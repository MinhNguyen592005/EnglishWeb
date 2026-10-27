package com.grammarquest.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.grammarquest.controller.ClassroomController;
import com.grammarquest.entity.User;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import jakarta.validation.Validation;
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

/** Kiểm thử controller/service thật với MySQL; learning mock để cô lập việc chuyển giao thức lớp học. */
@EnabledIfEnvironmentVariable(named="RUN_CLASSROOM_DB_TEST",matches="true")
class ClassroomSocketIntegrationTest {
    static final String schema="grammar_quest_class_socket_"+UUID.randomUUID().toString().replace("-","").substring(0,12)+"_test";
    static String url,username,password;
    static DataSource source;
    static UserRepository users;
    static LearningService learning;
    static org.springframework.context.ApplicationEventPublisher published;
    static AnnotationConfigApplicationContext context;
    static SocketClassroomService service;
    static JdbcTemplate db;
    static final ObjectMapper json=new ObjectMapper();
    @Configuration @EnableTransactionManagement
    static class Config {
        @Bean DataSource dataSource(){return source;}
        @Bean JdbcTemplate jdbcTemplate(){return new JdbcTemplate(source);}
        @Bean org.springframework.transaction.PlatformTransactionManager transactionManager(){return new DataSourceTransactionManager(source);}
        @Bean RealtimeNotifier notifier(JdbcTemplate db){return new RealtimeNotifier(mock(org.springframework.messaging.simp.SimpMessagingTemplate.class),db,published);}
        @Bean ClassroomController classroomController(JdbcTemplate db,RealtimeNotifier notifier){return new ClassroomController(db,users,learning,notifier);}
        @Bean LearnerReportService learnerReports(JdbcTemplate db,RealtimeNotifier notifier){return new LearnerReportService(db,users,notifier);}
        @Bean com.grammarquest.controller.AdminController adminController(JdbcTemplate db){return new com.grammarquest.controller.AdminController(db,users);}
        @Bean SocketClassroomService socketClassroomService(ClassroomController controller){return new SocketClassroomService(controller,learning,Validation.buildDefaultValidatorFactory().getValidator());}
    }
    @BeforeAll static void setup() throws Exception {
        assertTrue(schema.matches("grammar_quest_class_socket_[0-9a-f]{12}_test"));
        var yaml=new YamlPropertiesFactoryBean();yaml.setResources(new ClassPathResource("application.yml"));var p=Objects.requireNonNull(yaml.getObject());
        username=System.getenv().getOrDefault("EXAM_TEST_DB_USER",p.getProperty("spring.datasource.username"));
        password=System.getenv().getOrDefault("EXAM_TEST_DB_PASSWORD",p.getProperty("spring.datasource.password"));url="jdbc:mysql://127.0.0.1:3306/";
        try(var c=DriverManager.getConnection(url,username,password);var s=c.createStatement()){s.executeUpdate("CREATE DATABASE `"+schema+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");}
        source=new DriverManagerDataSource(url+schema,username,password);db=new JdbcTemplate(source);
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V1__initial.sql"),new ClassPathResource("db/migration/V3__classrooms_arena_admin.sql"),new ClassPathResource("db/migration/V5__assignment_duration.sql"),new ClassPathResource("db/migration/V6__arena_chat.sql"),new ClassPathResource("db/migration/V7__arena_reports.sql"),new ClassPathResource("db/migration/V15__learner_reports.sql")).execute(source);
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V26__assignment_question_snapshot.sql")).execute(source);
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V27__teacher_material_library.sql")).execute(source);
        users=mock(UserRepository.class);learning=mock(LearningService.class);published=mock(org.springframework.context.ApplicationEventPublisher.class);
        for(int i=1;i<=22;i++) {
            var u=new User("user"+i,"User "+i,"hash");u.id=(long)i;u.role=i==1?"TEACHER":"LEARNER";
            when(users.findByUsernameIgnoreCase(u.username)).thenReturn(Optional.of(u));
            when(users.findWithLockById(u.id)).thenReturn(Optional.of(u));when(users.findById(u.id)).thenReturn(Optional.of(u));
            db.update("insert into users(id,username,display_name,password_hash,role) values(?,?,?,'hash',?)",u.id,u.username,u.displayName,u.role);
        }
        db.update("insert into lessons(id,topic_slug,ordinal_no,title,summary,theory) values(1,'test',0,'Lesson','Summary','Theory')");
        context=new AnnotationConfigApplicationContext(Config.class);service=context.getBean(SocketClassroomService.class);
    }
    @AfterAll static void cleanup() throws Exception {
        if(context!=null)context.close();
        if(url!=null&&schema.matches("grammar_quest_class_socket_[0-9a-f]{12}_test"))
            try(var c=DriverManager.getConnection(url,username,password);var s=c.createStatement()){s.executeUpdate("DROP DATABASE IF EXISTS `"+schema+"`");}
    }
    @Test void joinChatAssignGradeAndRevokeAcrossConcurrentLearners() throws Exception {
        var classroom=(Map<?,?>)service.action("user1","CLASS_CREATE",json.createObjectNode().put("name","Socket classroom"));long classId=((Number)classroom.get("id")).longValue();
        String code=classroom.get("joinCode").toString();
        var pool=Executors.newFixedThreadPool(20);var start=new CountDownLatch(1);List<Future<?>> tasks=new ArrayList<>();
        try {
            for(int i=2;i<=21;i++){final String name="user"+i;tasks.add(pool.submit(()->{start.await();service.action(name,"CLASS_JOIN",json.createObjectNode().put("code",code));service.action(name,"CLASS_CHAT",json.createObjectNode().put("classId",classId).put("body","Hello from "+name));return null;}));}
            start.countDown();for(var task:tasks)task.get(30,TimeUnit.SECONDS);
        }finally{pool.shutdownNow();}
        var snapshot=service.snapshot("user1",classId,null);var detail=(Map<?,?>)snapshot.get("classroom");
        assertEquals(20,((List<?>)detail.get("members")).size());assertEquals(20,((List<?>)snapshot.get("messages")).size());
        service.action("user2","CLASS_JOIN",json.createObjectNode().put("code",code));assertEquals(20,db.queryForObject("select count(*) from class_members where class_id=?",Integer.class,classId));
        assertThrows(ApiException.class,()->service.snapshot("user22",classId,null));
        assertThrows(ApiException.class,()->service.action("user2","CLASS_RENAME",json.createObjectNode().put("classId",classId).put("name","Bad")));
        service.action("user1","CLASS_RENAME",json.createObjectNode().put("classId",classId).put("name","Renamed class"));
        assertEquals("Renamed class",((Map<?,?>)service.snapshot("user2",classId,null).get("classroom")).get("name"));
        var assignment=json.createObjectNode().put("classId",classId).put("lessonId",1).put("title","Live assignment").put("passPercent",80).put("dueAt",Instant.now().plusSeconds(3600).toString());
        var created=(Map<?,?>)service.action("user1","CLASS_ASSIGN",assignment);long assignmentId=((Number)created.get("id")).longValue();
        db.update("insert into attempts(id,user_id,lesson_id,kind,status,required_correct,total_questions,correct_count) values(1,2,1,'PRACTICE','IN_PROGRESS',8,10,3)");
        when(learning.startAssignment("user2",1L,1L)).thenReturn(new LearningService.AttemptView(1L,"PRACTICE","IN_PROGRESS",1L,10,8,3,0,0,List.of()));
        service.action("user2","CLASS_START_ASSIGNMENT",json.createObjectNode().put("classId",classId).put("assignmentId",assignmentId));
        assertNotNull(db.queryForObject("select submit_deadline_at from assignment_attempts where attempt_id=1",java.sql.Timestamp.class));
        assertEquals(3,((Number)((Map<?,?>)((List<?>)service.snapshot("user1",classId,assignmentId).get("results")).getFirst()).get("correctCount")).intValue());
        db.update("update attempts set correct_count=9,status='WON',completed_at=current_timestamp(6) where id=1");
        assertEquals(9,((Number)((Map<?,?>)((List<?>)service.snapshot("user1",classId,assignmentId).get("results")).getFirst()).get("correctCount")).intValue());
        assertThrows(ApiException.class,()->service.snapshot("user2",classId,assignmentId));
        new AssignmentAnswerGuard(db).check(1);
        var update=assignment.deepCopy().put("assignmentId",assignmentId).put("status","CLOSED");service.action("user1","CLASS_UPDATE_ASSIGNMENT",update);
        assertEquals("ASSIGNMENT_CLOSED",assertThrows(ApiException.class,()->new AssignmentAnswerGuard(db).check(1)).code);
        assertThrows(ApiException.class,()->service.action("user2","CLASS_START_ASSIGNMENT",json.createObjectNode().put("classId",classId).put("assignmentId",assignmentId)));
        var messages=(List<?>)snapshot.get("messages");long messageId=((Number)((Map<?,?>)messages.stream().filter(item->((Number)((Map<?,?>)item).get("userId")).longValue()!=2L).findFirst().orElseThrow()).get("id")).longValue();
        service.action("user2","CLASS_REPORT",json.createObjectNode().put("classId",classId).put("messageId",messageId).put("reason","Test report"));
        assertEquals(1,db.queryForObject("select count(*) from reports",Integer.class));
        var reports=context.getBean(LearnerReportService.class);var payload=json.createObjectNode().put("targetId",3).put("contextId",classId).put("contextType","CLASS").put("reason","Learner behavior");
        var receipt=reports.report("user1",payload);long reportId=((Number)receipt.get("id")).longValue();
        verify(published).publishEvent(new RealtimeNotifier.Reported(3,1,"USER",reportId));
        assertThrows(ApiException.class,()->reports.report("user1",payload));
        assertThrows(ApiException.class,()->reports.report("user22",payload));
        assertThrows(ApiException.class,()->reports.report("user3",payload));
        var admin=users.findById(22L).orElseThrow();admin.role="ADMIN";db.update("update users set role='ADMIN' where id=22");
        var controller=context.getBean(com.grammarquest.controller.AdminController.class);var auth=new org.springframework.security.authentication.UsernamePasswordAuthenticationToken("user22",null,java.util.List.of());
        assertTrue(controller.reports(auth).stream().anyMatch(row->"USER".equals(row.get("source"))));
        controller.decide(auth,reportId,new com.grammarquest.controller.AdminController.Decision("WARN","Reviewed","USER"));
        assertEquals("RESOLVED",db.queryForObject("select status from learner_reports where id=?",String.class,reportId));
        service.action("user1","CLASS_REMOVE_MEMBER",json.createObjectNode().put("classId",classId).put("memberId",2));
        assertThrows(ApiException.class,()->service.snapshot("user2",classId,null));
        assertEquals("CLASS_ACCESS_REVOKED",assertThrows(ApiException.class,()->new AssignmentAnswerGuard(db).check(1)).code);
        assertThrows(ApiException.class,()->service.action("user2","CLASS_CHAT",json.createObjectNode().put("classId",classId).put("body","Should fail")));
    }
}
