package com.grammarquest.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.grammarquest.entity.User;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.context.annotation.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import javax.sql.DataSource;
import java.sql.DriverManager;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Opt-in: kiểm tra SQL/khóa hàng thật trên schema MySQL tạm, không dùng grammar_quest. */
@EnabledIfEnvironmentVariable(named="RUN_LIVE_EXAM_DB_TEST",matches="true")
class LiveExamConcurrencyTest {
    static final String schema="grammar_quest_live_exam_"+UUID.randomUUID().toString().replace("-","").substring(0,12)+"_test";
    static String url,username,password;
    static DataSource source;
    static UserRepository users;
    static AnnotationConfigApplicationContext context;
    static LiveExamService service;
    static JdbcTemplate db;
    static final ObjectMapper json=new ObjectMapper();
    @Configuration @EnableTransactionManagement
    static class Config {
        @Bean DataSource dataSource(){return source;}
        @Bean JdbcTemplate jdbcTemplate(){return new JdbcTemplate(source);}
        @Bean org.springframework.transaction.PlatformTransactionManager transactionManager(){return new DataSourceTransactionManager(source);}
        @Bean UserRepository userRepository(){return users;}
        @Bean ObjectMapper objectMapper(){return json;}
        @Bean LiveExamService liveExamService(JdbcTemplate db,UserRepository repo,ObjectMapper mapper){return new LiveExamService(db,repo,mapper);}
    }
    @BeforeAll static void setup() throws Exception {
        assertTrue(schema.matches("grammar_quest_live_exam_[0-9a-f]{12}_test"));
        var yaml=new YamlPropertiesFactoryBean();yaml.setResources(new ClassPathResource("application.yml"));var p=Objects.requireNonNull(yaml.getObject());
        username=System.getenv().getOrDefault("EXAM_TEST_DB_USER",p.getProperty("spring.datasource.username"));
        password=System.getenv().getOrDefault("EXAM_TEST_DB_PASSWORD",p.getProperty("spring.datasource.password"));
        url="jdbc:mysql://127.0.0.1:3306/";
        try(var c=DriverManager.getConnection(url,username,password);var s=c.createStatement()){s.executeUpdate("CREATE DATABASE `"+schema+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");}
        source=new DriverManagerDataSource(url+schema,username,password);db=new JdbcTemplate(source);
        db.execute("create table users(id bigint primary key,username varchar(80),display_name varchar(80)) engine=InnoDB");
        db.execute("create table classrooms(id bigint primary key,teacher_id bigint) engine=InnoDB");
        db.execute("create table class_members(class_id bigint,user_id bigint,primary key(class_id,user_id)) engine=InnoDB");
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V14__live_class_exams.sql")).execute(source);
        users=mock(UserRepository.class);
        for(int i=1;i<=22;i++) {
            var u=new User("user"+i,"User "+i,"hash");u.id=(long)i;u.role=i==1?"TEACHER":"LEARNER";
            when(users.findByUsernameIgnoreCase(u.username)).thenReturn(Optional.of(u));
            db.update("insert into users values(?,?,?)",u.id,u.username,u.displayName);
        }
        db.update("insert into classrooms values(1,1)");
        for(int i=2;i<=21;i++)db.update("insert into class_members values(1,?)",i);
        context=new AnnotationConfigApplicationContext(Config.class);service=context.getBean(LiveExamService.class);
    }
    @AfterAll static void cleanup() throws Exception {
        if(context!=null)context.close();
        if(url!=null&&schema.matches("grammar_quest_live_exam_[0-9a-f]{12}_test"))
            try(var c=DriverManager.getConnection(url,username,password);var s=c.createStatement()){s.executeUpdate("DROP DATABASE IF EXISTS `"+schema+"`");}
    }
    @Test void simultaneousLearnersRegradeAndAccessIsolation() throws Exception {
        var create=json.createObjectNode().put("classId",1).put("title","Concurrent exam").put("endsAt",Instant.now().plusSeconds(3600).toString());
        create.set("questions",json.readTree("[{\"id\":\"q1\",\"prompt\":\"Choose\",\"options\":[\"A\",\"B\",\"C\",\"D\"],\"correct\":0}]"));
        var exam=(Map<?,?>)service.action("user1","EXAM_CREATE",create);long id=((Number)exam.get("id")).longValue();
        var pool=Executors.newFixedThreadPool(20);var start=new CountDownLatch(1);List<Future<?>> tasks=new ArrayList<>();
        try {
            for(int i=2;i<=21;i++){final String name="user"+i;tasks.add(pool.submit(()->{start.await();service.action(name,"EXAM_ANSWER",json.createObjectNode().put("examId",id).put("version",1).put("questionId","q1").put("option",0));return null;}));}
            start.countDown();for(var task:tasks)task.get(30,TimeUnit.SECONDS);
        }finally{pool.shutdownNow();}
        assertEquals(20,db.queryForObject("select count(*) from class_exam_submissions where exam_id=? and correct_count=1",Integer.class,id));
        var learner=service.view("user2",id);assertFalse(learner.containsKey("ranking"));assertFalse(learner.containsKey("correctCount"));
        assertFalse(((com.fasterxml.jackson.databind.JsonNode)learner.get("questions")).get(0).has("correct"));
        assertThrows(ApiException.class,()->service.view("user22",id));
        service.action("user2","EXAM_SUBMIT",json.createObjectNode().put("examId",id).put("version",1));
        var edit=create.deepCopy();edit.put("examId",id).put("version",1).put("closed",false);((com.fasterxml.jackson.databind.node.ObjectNode)edit.path("questions").get(0)).put("correct",1);
        service.action("user1","EXAM_EDIT",edit);
        assertEquals(20,db.queryForObject("select count(*) from class_exam_submissions where exam_id=? and correct_count=0",Integer.class,id));
        assertTrue(Boolean.TRUE.equals(db.queryForObject("select submitted from class_exam_submissions where exam_id=? and user_id=2",Boolean.class,id)));
        assertEquals(2L,((Number)service.view("user3",id).get("version")).longValue());
        assertThrows(ApiException.class,()->service.action("user3","EXAM_ANSWER",json.createObjectNode().put("examId",id).put("version",1).put("questionId","q1").put("option",0)));
        service.action("user3","EXAM_ANSWER",json.createObjectNode().put("examId",id).put("version",2).put("questionId","q1").put("option",1));
        var board=(List<?>)service.view("user1",id).get("ranking");assertEquals(3L,((Number)((Map<?,?>)board.getFirst()).get("userId")).longValue());
        assertThrows(ApiException.class,()->service.action("user2","EXAM_ANSWER",json.createObjectNode().put("examId",id).put("version",2).put("questionId","q1").put("option",1)));
        // Sửa đề đồng thời với nhiều đáp án: thứ tự khóa hàng quyết định; không có điểm theo đáp án cũ.
        var racePool=Executors.newFixedThreadPool(20);var raceStart=new CountDownLatch(1);List<Future<?>> raceTasks=new ArrayList<>();
        var nextEdit=edit.deepCopy().put("version",2);((com.fasterxml.jackson.databind.node.ObjectNode)nextEdit.path("questions").get(0)).put("correct",0);
        try {
            raceTasks.add(racePool.submit(()->{raceStart.await();service.action("user1","EXAM_EDIT",nextEdit);return null;}));
            for(int i=4;i<=21;i++){final String name="user"+i;raceTasks.add(racePool.submit(()->{raceStart.await();try{service.action(name,"EXAM_ANSWER",json.createObjectNode().put("examId",id).put("version",2).put("questionId","q1").put("option",1));}catch(ApiException stale){assertEquals("INVALID_EXAM",stale.code);}return null;}));}
            raceStart.countDown();for(var task:raceTasks)task.get(30,TimeUnit.SECONDS);
        }finally{racePool.shutdownNow();}
        var currentQuestions=(com.fasterxml.jackson.databind.JsonNode)service.view("user1",id).get("questions");
        for(var row:db.queryForList("select answers_json,correct_count from class_exam_submissions where exam_id=?",id))
            assertEquals(LiveExamService.score(currentQuestions,json.readTree(row.get("answers_json").toString())),((Number)row.get("correct_count")).intValue());
        db.update("delete from class_members where class_id=1 and user_id=3");assertThrows(ApiException.class,()->service.view("user3",id));
        var closed=nextEdit.deepCopy().put("version",3).put("closed",true);service.action("user1","EXAM_EDIT",closed);
        assertThrows(ApiException.class,()->service.action("user4","EXAM_ANSWER",json.createObjectNode().put("examId",id).put("version",4).put("questionId","q1").put("option",1)));
        // Sau restart (service instance mới), bài làm vẫn đọc lại được từ DB.
        var fresh=new LiveExamService(db,users,json);assertEquals(19,((List<?>)fresh.view("user1",id).get("ranking")).size());
    }
}
