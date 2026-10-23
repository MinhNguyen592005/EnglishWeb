package com.grammarquest.service;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.grammarquest.GrammarQuestApplication;
import com.grammarquest.entity.User;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.net.*;
import java.net.http.*;
import java.sql.DriverManager;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

/** Opt-in MySQL + Flyway + real authenticated WebSocket, always in a disposable schema. */
@EnabledIfEnvironmentVariable(named="RUN_STUDY_TEST",matches="true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class StudyRoadmapIntegrationTest {
    final String schema="grammar_quest_study_"+UUID.randomUUID().toString().replace("-","").substring(0,12)+"_test";
    final String password="StudyTestOnly123!";
    String dbUser,dbPassword,base;ServletWebServerApplicationContext app;ObjectMapper json;JdbcTemplate db;RoadmapCourseService course;User learner;
    @BeforeAll void boot()throws Exception {
        dbUser=Objects.requireNonNull(System.getenv("DB_USERNAME"));dbPassword=Objects.requireNonNull(System.getenv("DB_PASSWORD"));
        assertTrue(schema.matches("grammar_quest_study_[0-9a-f]{12}_test"));
        try(var c=DriverManager.getConnection("jdbc:mysql://127.0.0.1:3306/",dbUser,dbPassword);var s=c.createStatement()){s.executeUpdate("CREATE DATABASE `"+schema+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");}
        app=(ServletWebServerApplicationContext)new SpringApplicationBuilder(GrammarQuestApplication.class).run("--spring.profiles.active=test","--DB_TEST_NAME="+schema,"--server.port=0","--spring.datasource.url=jdbc:mysql://127.0.0.1:3306/"+schema,"--spring.datasource.username="+dbUser,"--spring.datasource.password="+dbPassword,"--app.seed-demo=false","--spring.main.banner-mode=off","--debug=false","--logging.level.root=WARN");
        base="http://127.0.0.1:"+app.getWebServer().getPort();json=app.getBean(ObjectMapper.class);db=app.getBean(JdbcTemplate.class);course=app.getBean(RoadmapCourseService.class);
        learner=app.getBean(UserRepository.class).save(new User("study_fixture","Study fixture",app.getBean(PasswordEncoder.class).encode(password)));
    }
    @AfterAll void cleanup()throws Exception {
        if(app!=null)app.close();
        if(dbUser!=null&&schema.matches("grammar_quest_study_[0-9a-f]{12}_test"))try(var c=DriverManager.getConnection("jdbc:mysql://127.0.0.1:3306/",dbUser,dbPassword);var s=c.createStatement()){s.executeUpdate("DROP DATABASE IF EXISTS `"+schema+"`");}
    }
    JsonNode call(String action,Object payload){return json.valueToTree(course.action(learner.username,action,json.valueToTree(payload)));}
    ObjectNode answers(long id,int right){
        try{var qs=json.readTree(db.queryForObject("select questions_json from study_attempts where id=?",String.class,id));var out=json.createObjectNode();int index=0;for(var q:qs){String answer=q.path("correctOption").asText();out.put(q.path("id").asText(),index++<right?answer:answer.equals("A")?"B":"A");}return out;}catch(Exception e){throw new RuntimeException(e);}
    }
    JsonNode start(String kind,String ref){return call("ROADMAP_START",Map.of("kind",kind,"referenceId",ref,"requestKey",UUID.randomUUID().toString()));}
    JsonNode submit(long id,int right){return call("ROADMAP_SUBMIT",Map.of("attemptId",id,"answers",answers(id,right)));}
    @Test void fullCourseRulesAndLegacyIsolationAndSocketTransport()throws Exception {
        int legacyLessons=db.queryForObject("select count(*) from lessons",Integer.class),legacyQuestions=db.queryForObject("select count(*) from questions",Integer.class);
        var initial=call("ROADMAP_OPEN",Map.of());assertEquals(5,initial.path("levels").size());
        assertEquals(28,db.queryForObject("select count(*) from study_modules",Integer.class));assertEquals(120,db.queryForObject("select count(*) from study_lessons",Integer.class));
        assertTrue(initial.path("levels").get(0).path("unlocked").asBoolean());assertFalse(initial.path("levels").get(1).path("unlocked").asBoolean());
        assertTrue(initial.path("levels").get(0).path("modules").get(0).path("unlocked").asBoolean());
        assertFalse(initial.path("levels").get(0).path("modules").get(1).path("unlocked").asBoolean());
        assertThrows(ApiException.class,()->call("ROADMAP_LESSON",Map.of("lessonId","2.1")));
        assertThrows(ApiException.class,()->start("LESSON","2.1"));
        assertThrows(ApiException.class,()->start("MODULE_REVIEW","l1-m2"));
        assertThrows(ApiException.class,()->start("MODULE_TEST","l1-m2"));
        assertEquals(0,db.queryForObject("select count(*) from study_progress where user_id=?",Integer.class,learner.id));
        var limitedReview=start("LEVEL_REVIEW","1");
        assertTrue(java.util.stream.StreamSupport.stream(limitedReview.path("questions").spliterator(),false).allMatch(q->Set.of("1.1","1.2","1.3").contains(q.path("lessonId").asText())));
        assertThrows(ApiException.class,()->call("ROADMAP_LESSON",Map.of("lessonId","9.1")));
        assertThrows(ApiException.class,()->start("LEVEL_TEST","1"));assertThrows(ApiException.class,()->start("LEVEL_REVIEW","01"));
        var lesson=call("ROADMAP_LESSON",Map.of("lessonId","1.1"));var first=lesson.path("attempt");long firstId=first.path("id").asLong();
        assertEquals(3,first.path("totalQuestions").asInt());assertFalse(first.has("correctCount"));for(var q:first.path("questions")){assertFalse(q.has("correctOption"));assertFalse(q.has("explanation"));assertFalse(q.has("correct"));}
        var draft=answers(firstId,0);var firstQuestion=draft.fieldNames().next();draft.put(firstQuestion,"A");
        call("ROADMAP_SAVE",Map.of("attemptId",firstId,"answers",draft));draft.put(firstQuestion,"B");
        var changed=call("ROADMAP_SAVE",Map.of("attemptId",firstId,"answers",draft));assertEquals("B",changed.path("answers").path(firstQuestion).asText());assertFalse(changed.has("correctCount"));
        assertThrows(ApiException.class,()->call("ROADMAP_SUBMIT",Map.of("attemptId",firstId,"answers",Map.of())));
        var result=submit(firstId,0);assertEquals("COMPLETED",result.path("status").asText());assertEquals(0,result.path("correctCount").asInt());
        assertEquals(result,submit(firstId,3));
        var retry=start("LESSON","1.1");assertEquals(first.path("questions").get(0).path("id"),retry.path("questions").get(0).path("id"));
        assertTrue(call("ROADMAP_LESSON",Map.of("lessonId","1.1")).path("completed").asBoolean());
        var secondLesson=start("LESSON","1.2");submit(secondLesson.path("id").asLong(),0);
        assertFalse(call("ROADMAP_OPEN",Map.of()).path("levels").get(0).path("modules").get(1).path("unlocked").asBoolean());
        assertTrue(call("ROADMAP_LESSON",Map.of("lessonId","1.3")).path("nextLessonId").isNull());
        var thirdLesson=start("LESSON","1.3");submit(thirdLesson.path("id").asLong(),0);
        var moduleUnlocked=call("ROADMAP_OPEN",Map.of()).path("levels").get(0).path("modules");
        assertTrue(moduleUnlocked.get(1).path("unlocked").asBoolean());assertFalse(moduleUnlocked.get(2).path("unlocked").asBoolean());
        assertEquals("2.1",call("ROADMAP_LESSON",Map.of("lessonId","1.3")).path("nextLessonId").asText());
        assertEquals("2.1",call("ROADMAP_LESSON",Map.of("lessonId","2.1")).path("id").asText());
        assertEquals("MODULE_REVIEW",start("MODULE_REVIEW","l1-m2").path("kind").asText());
        // Sparse historical progress in a later module must not skip an unfinished earlier module.
        db.update("insert into study_progress(user_id,lesson_id,completed_at) select ?,id,current_timestamp(6) from study_lessons where module_id='l1-m3'",learner.id);
        assertThrows(ApiException.class,()->call("ROADMAP_LESSON",Map.of("lessonId","10.1")));
        db.update("delete from study_progress where user_id=? and lesson_id in (select id from study_lessons where module_id='l1-m3')",learner.id);
        // Attempts created under the old rule are checked again when read/saved/submitted.
        long lockedAttempt=db.queryForObject("select max(id) from study_attempts where user_id=? and kind='MODULE_REVIEW' and reference_id='l1-m2'",Long.class,learner.id);
        db.update("update study_progress set completed_at=null where user_id=? and lesson_id='1.3'",learner.id);
        assertThrows(ApiException.class,()->call("ROADMAP_ATTEMPT",Map.of("attemptId",lockedAttempt)));
        assertThrows(ApiException.class,()->call("ROADMAP_SAVE",Map.of("attemptId",lockedAttempt,"answers",Map.of())));
        assertThrows(ApiException.class,()->submit(lockedAttempt,0));
        db.update("update study_progress set completed_at=current_timestamp(6) where user_id=? and lesson_id='1.3'",learner.id);
        for(String id:db.queryForList("select l.id from study_lessons l join study_modules m on m.id=l.module_id where m.level_id=1 order by m.ordinal_no,l.ordinal_no",String.class)){var a=start("LESSON",id);submit(a.path("id").asLong(),0);}
        var ready=call("ROADMAP_OPEN",Map.of());assertEquals(18,ready.path("levels").get(0).path("completedCount").asInt());assertTrue(ready.path("levels").get(0).path("examReady").asBoolean());
        var exam=start("LEVEL_TEST","1");assertEquals(10,exam.path("questions").size());assertEquals(4,java.util.stream.StreamSupport.stream(exam.path("questions").spliterator(),false).map(q->q.path("moduleTitle").asText()).distinct().count());
        assertEquals("FAILED",submit(exam.path("id").asLong(),7).path("status").asText());assertFalse(call("ROADMAP_OPEN",Map.of()).path("levels").get(1).path("unlocked").asBoolean());
        var pass=start("LEVEL_TEST","1");assertEquals("PASSED",submit(pass.path("id").asLong(),8).path("status").asText());
        var unlocked=call("ROADMAP_OPEN",Map.of());assertTrue(unlocked.path("levels").get(1).path("unlocked").asBoolean());assertFalse(unlocked.path("levels").get(2).path("unlocked").asBoolean());
        var failAgain=start("LEVEL_TEST","1");submit(failAgain.path("id").asLong(),0);assertTrue(call("ROADMAP_OPEN",Map.of()).path("levels").get(1).path("unlocked").asBoolean());
        var request=Map.of("kind","LEVEL_REVIEW","referenceId","1","requestKey",UUID.randomUUID().toString());assertEquals(call("ROADMAP_START",request).path("id"),call("ROADMAP_START",request).path("id"));
        var other=app.getBean(UserRepository.class).save(new User("study_other","Other","unused"));assertThrows(ApiException.class,()->course.action(other.username,"ROADMAP_ATTEMPT",json.valueToTree(Map.of("attemptId",firstId))));
        other.role="TEACHER";app.getBean(UserRepository.class).save(other);assertThrows(ApiException.class,()->course.action(other.username,"ROADMAP_OPEN",json.createObjectNode()));
        assertEquals(legacyLessons,db.queryForObject("select count(*) from lessons",Integer.class));assertEquals(legacyQuestions,db.queryForObject("select count(*) from questions",Integer.class));assertEquals(0,db.queryForObject("select count(*) from attempts",Integer.class));assertEquals(0,db.queryForObject("select count(*) from xp_ledger",Integer.class));
        socketRoundTrip();
    }
    void socketRoundTrip()throws Exception {
        var cookie=new CookieManager(null,CookiePolicy.ACCEPT_ALL);var http=HttpClient.newBuilder().cookieHandler(cookie).build();
        var csrf=json.readTree(http.send(HttpRequest.newBuilder(URI.create(base+"/api/v1/auth/csrf")).GET().build(),HttpResponse.BodyHandlers.ofString()).body());
        var login=http.send(HttpRequest.newBuilder(URI.create(base+"/api/v1/auth/login")).header("Content-Type","application/json").header("X-XSRF-TOKEN",csrf.path("token").asText()).POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(Map.of("username",learner.username,"password",password)))).build(),HttpResponse.BodyHandlers.ofString());assertEquals(200,login.statusCode());
        var received=new LinkedBlockingQueue<String>();var partial=new StringBuilder();
        var listener=new WebSocket.Listener(){public CompletionStage<?> onText(WebSocket ws,CharSequence data,boolean last){partial.append(data);if(last){received.add(partial.toString());partial.setLength(0);}ws.request(1);return null;}public void onOpen(WebSocket ws){ws.request(1);}};
        var socket=http.newWebSocketBuilder().buildAsync(URI.create(base.replace("http:","ws:")+"/api/ws-system"),listener).join();
        try{socket.sendText("{\"action\":\"ROADMAP_OPEN\",\"requestId\":\"study-roundtrip\",\"payload\":{}}",true).join();JsonNode reply=null;for(int i=0;i<10;i++){var raw=received.poll(1,TimeUnit.SECONDS);if(raw!=null){var msg=json.readTree(raw);if("study-roundtrip".equals(msg.path("requestId").asText())){reply=msg;break;}}}assertNotNull(reply);assertEquals("ROADMAP_COURSE_DATA",reply.path("action").asText());assertEquals(5,reply.path("payload").path("levels").size());}finally{socket.sendClose(1000,"test complete").join();}
    }
}
