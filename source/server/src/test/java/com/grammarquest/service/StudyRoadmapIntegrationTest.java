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
    @Test void staleJpaAccountCannotLoseLegacyXpOrOverwriteNewerElo(){
        var users=app.getBean(UserRepository.class);var rewards=app.getBean(StudyRewardService.class);
        var fixture=new User("mixed_rewards","Mixed rewards","unused");fixture.totalXp=100;long userId=users.save(fixture).id;
        var manager=app.getBean(org.springframework.transaction.PlatformTransactionManager.class);
        var outer=new org.springframework.transaction.support.TransactionTemplate(manager);
        var inner=new org.springframework.transaction.support.TransactionTemplate(manager);
        inner.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        outer.execute(status->{
            var cached=users.findByUsernameIgnoreCase("mixed_rewards").orElseThrow();assertEquals(100,cached.totalXp);
            inner.execute(other->{rewards.award(userId,"LESSON","audit-lesson",1);db.update("update users set pvp_elo=1200 where id=?",userId);return null;});
            assertEquals(20,rewards.awardFirstWin(userId,"LESSON_BOSS:audit",20));
            assertEquals(0,rewards.awardFirstWin(userId,"LESSON_BOSS:audit",20));
            return null;
        });
        assertEquals(140,db.queryForObject("select total_xp from users where id=?",Integer.class,userId));
        assertEquals(1200,db.queryForObject("select pvp_elo from users where id=?",Integer.class,userId));
        assertEquals(40,db.queryForObject("select sum(amount) from xp_ledger where user_id=?",Integer.class,userId));
    }
    @Test void oldReadSnapshotCannotBypassSharedReviewCap(){
        var users=app.getBean(UserRepository.class);var rewards=app.getBean(StudyRewardService.class);
        long userId=users.save(new User("snapshot_rewards","Snapshot rewards","unused")).id;
        var manager=app.getBean(org.springframework.transaction.PlatformTransactionManager.class);
        var outer=new org.springframework.transaction.support.TransactionTemplate(manager);
        var inner=new org.springframework.transaction.support.TransactionTemplate(manager);
        inner.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        outer.execute(status->{
            users.findByUsernameIgnoreCase("snapshot_rewards").orElseThrow();
            inner.execute(other->{assertEquals(10,rewards.award(userId,"LEVEL_REVIEW","1",1));assertEquals(10,rewards.award(userId,"LEVEL_REVIEW","1",2));return null;});
            assertEquals(10,rewards.award(userId,"PRACTICE","",3));assertEquals(0,rewards.award(userId,"PRACTICE","",4));return null;
        });
        assertEquals(30,db.queryForObject("select total_xp from users where id=?",Integer.class,userId));
    }
    @Test void independentBankDoesNotContainLessonPromptsAndRankedPairsAreLimited()throws Exception {
        assertEquals(280,db.queryForObject("select count(*) from study_exam_questions",Integer.class));
        var prompts=new HashSet<String>();
        for(var raw:db.queryForList("select questions_json from study_lessons",String.class))for(var q:json.readTree(raw))prompts.add(q.path("prompt").asText().strip().toLowerCase(Locale.ROOT));
        for(var prompt:db.queryForList("select prompt from study_exam_questions",String.class))assertFalse(prompts.contains(prompt.strip().toLowerCase(Locale.ROOT)));
        var users=app.getBean(UserRepository.class);var first=users.save(new User("pair_first","First","unused"));var second=users.save(new User("pair_second","Second","unused"));
        var rules=new RankedPairRules(db);var now=java.time.Instant.now();
        for(int i=0;i<3;i++)db.update("insert into arena_rooms(code,host_id,guest_id,status,is_matchmade,settled_at) values(?,?,?,'FINISHED',true,?)","PAIR"+i,first.id,second.id,java.sql.Timestamp.from(now.minusSeconds(60)));
        assertFalse(rules.allowed(first.id,second.id,now));assertFalse(rules.allowed(second.id,first.id,now));
        assertEquals(Set.of(RankedPairRules.pairKey(first.id,second.id)),rules.blockedPairs(List.of(first.id,second.id),now));
        var ex=assertThrows(ApiException.class,()->app.getBean(ArenaMatchFactory.class).create(first.username,second.username));assertEquals("RANKED_PAIR_LIMIT",ex.code);
        db.update("update arena_rooms set settled_at=? where host_id=?",java.sql.Timestamp.from(now.minusSeconds(86401)),first.id);
        assertTrue(rules.allowed(first.id,second.id,now));
        db.update("update arena_rooms set settled_at=?,is_matchmade=false where host_id=?",java.sql.Timestamp.from(now),first.id);
        assertTrue(rules.allowed(first.id,second.id,now));
    }
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
        var result=submit(firstId,0);assertEquals("FAILED",result.path("status").asText());assertEquals(0,result.path("correctCount").asInt());
        assertFalse(call("ROADMAP_LESSON",Map.of("lessonId","1.1")).path("completed").asBoolean());
        assertEquals(0,result.path("awardedXp").asInt());
        assertEquals(result,submit(firstId,3));
        var retry=start("LESSON","1.1");assertEquals(first.path("questions").get(0).path("id"),retry.path("questions").get(0).path("id"));
        assertEquals(20,submit(retry.path("id").asLong(),3).path("awardedXp").asInt());
        assertTrue(call("ROADMAP_LESSON",Map.of("lessonId","1.1")).path("completed").asBoolean());
        var secondLesson=start("LESSON","1.2");var duplicateLesson=start("LESSON","1.2");
        try(var pool=Executors.newFixedThreadPool(2)){
            var a=pool.submit(()->submit(secondLesson.path("id").asLong(),3));
            var b=pool.submit(()->submit(duplicateLesson.path("id").asLong(),3));
            assertEquals(20,a.get(15,TimeUnit.SECONDS).path("awardedXp").asInt()+b.get(15,TimeUnit.SECONDS).path("awardedXp").asInt());
        }
        assertFalse(call("ROADMAP_OPEN",Map.of()).path("levels").get(0).path("modules").get(1).path("unlocked").asBoolean());
        assertTrue(call("ROADMAP_LESSON",Map.of("lessonId","1.3")).path("nextLessonId").isNull());
        var thirdLesson=start("LESSON","1.3");submit(thirdLesson.path("id").asLong(),3);
        assertFalse(call("ROADMAP_OPEN",Map.of()).path("levels").get(0).path("modules").get(1).path("unlocked").asBoolean());
        assertThrows(ApiException.class,()->start("LEVEL_TEST","1"));
        var moduleExam=start("MODULE_TEST","l1-m1");
        assertEquals("FAILED",submit(moduleExam.path("id").asLong(),7).path("status").asText());
        var modulePass=start("MODULE_TEST","l1-m1");
        assertEquals(50,submit(modulePass.path("id").asLong(),modulePass.path("totalQuestions").asInt()).path("awardedXp").asInt());
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
        for(String module:db.queryForList("select id from study_modules where level_id=1 order by ordinal_no",String.class)){
            for(String id:db.queryForList("select id from study_lessons where module_id=? order by ordinal_no",String.class,module)){var a=start("LESSON",id);submit(a.path("id").asLong(),a.path("totalQuestions").asInt());}
            var a=start("MODULE_TEST",module);submit(a.path("id").asLong(),a.path("totalQuestions").asInt());
        }
        var ready=call("ROADMAP_OPEN",Map.of());assertEquals(18,ready.path("levels").get(0).path("completedCount").asInt());assertTrue(ready.path("levels").get(0).path("examReady").asBoolean());
        var exam=start("LEVEL_TEST","1");assertEquals(10,exam.path("questions").size());assertEquals(4,java.util.stream.StreamSupport.stream(exam.path("questions").spliterator(),false).map(q->q.path("moduleTitle").asText()).distinct().count());
        assertEquals("FAILED",submit(exam.path("id").asLong(),7).path("status").asText());assertFalse(call("ROADMAP_OPEN",Map.of()).path("levels").get(1).path("unlocked").asBoolean());
        var pass=start("LEVEL_TEST","1");assertEquals("PASSED",submit(pass.path("id").asLong(),8).path("status").asText());
        var unlocked=call("ROADMAP_OPEN",Map.of());assertTrue(unlocked.path("levels").get(1).path("unlocked").asBoolean());assertFalse(unlocked.path("levels").get(2).path("unlocked").asBoolean());
        var failAgain=start("LEVEL_TEST","1");submit(failAgain.path("id").asLong(),0);assertTrue(call("ROADMAP_OPEN",Map.of()).path("levels").get(1).path("unlocked").asBoolean());
        var request=Map.of("kind","LEVEL_REVIEW","referenceId","1","requestKey",UUID.randomUUID().toString());assertEquals(call("ROADMAP_START",request).path("id"),call("ROADMAP_START",request).path("id"));
        var other=app.getBean(UserRepository.class).save(new User("study_other","Other","unused"));assertThrows(ApiException.class,()->course.action(other.username,"ROADMAP_ATTEMPT",json.valueToTree(Map.of("attemptId",firstId))));
        other.role="TEACHER";app.getBean(UserRepository.class).save(other);assertThrows(ApiException.class,()->course.action(other.username,"ROADMAP_OPEN",json.createObjectNode()));
        assertEquals(legacyLessons,db.queryForObject("select count(*) from lessons",Integer.class));assertEquals(legacyQuestions,db.queryForObject("select count(*) from questions",Integer.class));assertEquals(0,db.queryForObject("select count(*) from attempts",Integer.class));assertEquals(710,db.queryForObject("select total_xp from users where id=?",Integer.class,learner.id));
        assertEquals(710,db.queryForObject("select sum(amount) from xp_ledger where user_id=?",Integer.class,learner.id));
        var reviews=new ArrayList<JsonNode>();
        for(int i=0;i<4;i++)reviews.add(start(i%2==0?"LEVEL_REVIEW":"MODULE_REVIEW",i%2==0?"1":"l1-m1"));
        try(var pool=Executors.newFixedThreadPool(4)){
            var tasks=new ArrayList<Future<JsonNode>>();
            for(var review:reviews)tasks.add(pool.submit(()->submit(review.path("id").asLong(),review.path("totalQuestions").asInt())));
            int totalXp=0;for(var task:tasks)totalXp+=task.get(15,TimeUnit.SECONDS).path("awardedXp").asInt();
            assertEquals(30,totalXp);
        }
        assertEquals(740,db.queryForObject("select total_xp from users where id=?",Integer.class,learner.id));
        assertEquals(1,db.queryForObject("select current_streak from user_quest_streaks where user_id=?",Integer.class,learner.id));
        assertNull(db.queryForObject("select milestone_claimed_date from user_quest_streaks where user_id=?",java.sql.Date.class,learner.id));
        socketRoundTrip();
        var history=call("ROADMAP_HISTORY",Map.of());assertTrue(history.isArray());assertTrue(history.size()>0);
        for(var entry:history){
            assertFalse(entry.has("questions"));assertFalse(entry.has("answers"));
            assertTrue(entry.path("levelId").asInt()>=1);assertFalse(entry.path("title").asText().isBlank());
            if("IN_PROGRESS".equals(entry.path("status").asText()))assertTrue(entry.path("correctCount").isNull());
            assertEquals(learner.id,db.queryForObject("select user_id from study_attempts where id=?",Long.class,entry.path("id").asLong()));
        }
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
