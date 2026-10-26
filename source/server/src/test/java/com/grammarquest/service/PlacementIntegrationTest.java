package com.grammarquest.service;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.grammarquest.GrammarQuestApplication;
import com.grammarquest.exception.ApiException;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import java.net.*;
import java.net.http.*;
import java.sql.DriverManager;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

/** Migrates an existing V20 database before exercising real registration/session/socket flows. */
@EnabledIfEnvironmentVariable(named="RUN_PLACEMENT_TEST",matches="true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PlacementIntegrationTest {
    final String schema="grammar_quest_entry_"+UUID.randomUUID().toString().replace("-","").substring(0,12)+"_test";
    final String password="PlacementTest123!";
    String dbUser,dbPassword,base,url;ServletWebServerApplicationContext app;ObjectMapper json;JdbcTemplate db;PlacementService placement;RoadmapCourseService course;
    @BeforeAll void boot()throws Exception {
        dbUser=Objects.requireNonNull(System.getenv("DB_USERNAME"));dbPassword=Objects.requireNonNull(System.getenv("DB_PASSWORD"));
        assertTrue(schema.matches("grammar_quest_entry_[0-9a-f]{12}_test"));
        try(var c=DriverManager.getConnection("jdbc:mysql://127.0.0.1:3306/",dbUser,dbPassword);var s=c.createStatement()){s.executeUpdate("CREATE DATABASE `"+schema+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");}
        url="jdbc:mysql://127.0.0.1:3306/"+schema;
        Flyway.configure().dataSource(url,dbUser,dbPassword).target("20").load().migrate();
        try(var c=DriverManager.getConnection(url,dbUser,dbPassword);var s=c.createStatement()){
            s.executeUpdate("insert into users(id,username,display_name,password_hash,role,total_xp) values(100,'old_learner','Old learner','unchanged','LEARNER',1234)");
            s.executeUpdate("insert into study_progress(user_id,lesson_id,opened_at,completed_at) values(100,'1.1','2026-01-01 00:00:00','2026-01-02 00:00:00')");
        }
        app=(ServletWebServerApplicationContext)new SpringApplicationBuilder(GrammarQuestApplication.class).run("--spring.profiles.active=test","--DB_TEST_NAME="+schema,"--server.port=0","--spring.datasource.url="+url,"--spring.datasource.username="+dbUser,"--spring.datasource.password="+dbPassword,"--app.seed-demo=false","--spring.main.banner-mode=off","--logging.level.root=WARN");
        base="http://127.0.0.1:"+app.getWebServer().getPort();json=app.getBean(ObjectMapper.class);db=app.getBean(JdbcTemplate.class);placement=app.getBean(PlacementService.class);course=app.getBean(RoadmapCourseService.class);
    }
    @AfterAll void cleanup()throws Exception {
        if(app!=null)app.close();
        if(dbUser!=null&&schema.matches("grammar_quest_entry_[0-9a-f]{12}_test"))try(var c=DriverManager.getConnection("jdbc:mysql://127.0.0.1:3306/",dbUser,dbPassword);var s=c.createStatement()){s.executeUpdate("DROP DATABASE IF EXISTS `"+schema+"`");}
    }
    JsonNode call(String name,String action,Object payload){return json.valueToTree(placement.action(name,action,json.valueToTree(payload)));}
    JsonNode roadmap(String name,String action,Object payload){return json.valueToTree(course.action(name,action,json.valueToTree(payload)));}
    ObjectNode answers(String table,long id,int right)throws Exception {
        assertTrue(Set.of("study_entry_attempts","study_attempts").contains(table));
        var questions=json.readTree(db.queryForObject("select questions_json from "+table+" where id=?",String.class,id));var out=json.createObjectNode();int i=0;
        var ordered=new ArrayList<JsonNode>();questions.forEach(ordered::add);if(table.equals("study_entry_attempts"))ordered.sort(Comparator.comparingInt(q->q.path("level").asInt()));
        for(var q:ordered){String answer=q.path("correctOption").asText();out.put(q.path("id").asText(),i++<right?answer:answer.equals("A")?"B":"A");}return out;
    }
    final class Session {
        final HttpClient http=HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build();
        HttpResponse<String> post(String path,Object payload)throws Exception {
            var token=json.readTree(http.send(HttpRequest.newBuilder(URI.create(base+"/api/v1/auth/csrf")).GET().build(),HttpResponse.BodyHandlers.ofString()).body()).path("token").asText();
            return http.send(HttpRequest.newBuilder(URI.create(base+path)).header("Content-Type","application/json").header("X-XSRF-TOKEN",token).POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload))).build(),HttpResponse.BodyHandlers.ofString());
        }
        void login(String name)throws Exception{assertEquals(200,post("/api/v1/auth/login",Map.of("username",name,"password",password)).statusCode());}
    }
    Session register(String name)throws Exception {
        var session=new Session();var result=session.post("/api/v1/auth/register",Map.of("username",name,"displayName","Placement learner","password",password));assertEquals(201,result.statusCode(),result.body());assertTrue(json.readTree(result.body()).path("placementEligible").asBoolean());session.login(name);return session;
    }
    @Test void migrationPreservesOldUsersAndCourseProgress(){
        assertFalse(db.queryForObject("select placement_eligible from users where id=100",Boolean.class));
        assertEquals(1234,db.queryForObject("select total_xp from users where id=100",Integer.class));
        assertEquals("unchanged",db.queryForObject("select password_hash from users where id=100",String.class));
        assertEquals("2026-01-02 00:00:00.000000",db.queryForObject("select date_format(completed_at,'%Y-%m-%d %H:%i:%s.%f') from study_progress where user_id=100 and lesson_id='1.1'",String.class));
        assertEquals("NOT_REQUIRED",call("old_learner","PLACEMENT_STATUS",Map.of()).path("status").asText());
        assertEquals(1,roadmap("old_learner","ROADMAP_OPEN",Map.of()).path("levels").get(0).path("completedCount").asInt());
        assertEquals(0,db.queryForObject("select count(*) from study_entry_profiles where user_id=100",Integer.class));
    }
    @Test void persistentExamAndRealSocketAndOwnership()throws Exception {
        var session=register("entry_resume");
        assertEquals("NOT_STARTED",call("entry_resume","PLACEMENT_STATUS",Map.of()).path("status").asText());
        assertEquals("PLACEMENT_REQUIRED",assertThrows(ApiException.class,()->roadmap("entry_resume","ROADMAP_OPEN",Map.of())).code);
        assertThrows(ApiException.class,()->app.getBean(LearningService.class).listLessons("entry_resume"));
        long uid=db.queryForObject("select id from users where username='entry_resume'",Long.class);
        assertEquals(0,db.queryForObject("select count(*) from study_entry_attempts where user_id=?",Integer.class,uid));
        // Popup choices have no storage endpoint and cannot change profile or exam level.
        assertThrows(ApiException.class,()->call("entry_resume","PLACEMENT_ACCEPT",Map.of("age","18–24.","experience","Đã có nền tảng.","time","Trên 1 giờ.")));
        var open=call("entry_resume","PLACEMENT_OPEN",Map.of());long id=open.path("attemptId").asLong();
        assertNull(db.queryForObject("select onboarding_json from study_entry_profiles where user_id=?",String.class,uid));
        assertNull(db.queryForObject("select placement_accepted_at from study_entry_profiles where user_id=?",java.sql.Timestamp.class,uid));
        assertEquals("Placement learner",db.queryForObject("select display_name from users where id=?",String.class,uid));
        assertFalse(open.has("welcomeRequired"));assertFalse(open.has("onboarding"));
        assertEquals(25,open.path("questions").size());assertFalse(open.has("correctCount"));
        var seen=new HashSet<String>();int[] count=new int[6];for(var q:open.path("questions")){assertTrue(seen.add(q.path("id").asText()));count[q.path("level").asInt()]++;assertFalse(q.has("correctOption"));assertFalse(q.has("explanation"));}
        assertArrayEquals(new int[]{0,5,5,5,5,5},count);
        assertEquals(50,db.queryForObject("select count(*) from study_entry_questions",Integer.class));
        String question=open.path("questions").get(0).path("id").asText();
        call("entry_resume","PLACEMENT_SAVE",Map.of("attemptId",id,"questionId",question,"option","A"));
        call("entry_resume","PLACEMENT_SAVE",Map.of("attemptId",id,"questionId",question,"option","B"));
        assertThrows(ApiException.class,()->call("entry_resume","PLACEMENT_SUBMIT",Map.of("attemptId",id,"answers",Map.of(question,"B"))));
        var relogin=new Session();relogin.login("entry_resume");
        var resumed=call("entry_resume","PLACEMENT_OPEN",Map.of());assertEquals(open.path("questions"),resumed.path("questions"));assertEquals(id,resumed.path("attemptId").asLong());assertEquals("B",resumed.path("answers").path(question).asText());
        register("entry_other");assertThrows(ApiException.class,()->call("entry_other","PLACEMENT_SAVE",Map.of("attemptId",id,"questionId",question,"option","A")));
        var received=new LinkedBlockingQueue<String>();var partial=new StringBuilder();
        var listener=new WebSocket.Listener(){public void onOpen(WebSocket ws){ws.request(1);}public CompletionStage<?> onText(WebSocket ws,CharSequence data,boolean last){partial.append(data);if(last){received.add(partial.toString());partial.setLength(0);}ws.request(1);return null;}};
        var socket=session.http.newWebSocketBuilder().buildAsync(URI.create(base.replace("http:","ws:")+"/api/ws-system"),listener).join();
        try{
            socket.sendText("{\"action\":\"PLACEMENT_OPEN\",\"requestId\":\"entry-test\",\"payload\":{}}",true).join();JsonNode reply=null;
            for(int i=0;i<10;i++){var raw=received.poll(1,TimeUnit.SECONDS);if(raw!=null){var message=json.readTree(raw);if("entry-test".equals(message.path("requestId").asText())){reply=message;break;}}}
            assertNotNull(reply);assertEquals("PLACEMENT_DATA",reply.path("action").asText());assertEquals(json.readTree(resumed.toString()),reply.path("payload"));
        }finally{socket.sendClose(1000,"complete").join();}
    }
    @Test void exactBoundariesIdempotentConcurrentSubmitAndCourseAccess()throws Exception {
        for(int score:new int[]{0,5,6,8,9,10,15,20,25}){
            String name="entry_score_"+score;register(name);var open=call(name,"PLACEMENT_OPEN",Map.of());long id=open.path("attemptId").asLong();
            var payload=Map.of("attemptId",id,"answers",answers("study_entry_attempts",id,score));
            JsonNode result;
            try(var pool=Executors.newFixedThreadPool(2)){
                var first=pool.submit(()->call(name,"PLACEMENT_SUBMIT",payload));var second=pool.submit(()->call(name,"PLACEMENT_SUBMIT",payload));result=first.get(15,TimeUnit.SECONDS);assertEquals(result,second.get(15,TimeUnit.SECONDS));
            }
            assertEquals(score,result.path("correctCount").asInt());int start=Math.min(5,1+(score+1)/5);assertEquals(start,result.path("startingLevel").asInt());assertEquals(start,result.path("currentLevel").asInt());assertEquals(start-1,result.path("passedLevels").size());
            assertTrue(result.path("message").asText().contains("Level "+start));
            assertEquals(25,result.path("totalQuestions").asInt());
            for(String key:List.of("questions","answers","correctOption","explanation"))assertFalse(result.has(key));
            assertEquals(result,call(name,"PLACEMENT_SUBMIT",Map.of("attemptId",id,"answers",answers("study_entry_attempts",id,10))));assertEquals(result,call(name,"PLACEMENT_OPEN",Map.of()));
            var session=new Session();session.login(name);assertFalse(call(name,"PLACEMENT_STATUS",Map.of()).path("required").asBoolean());
            long uid=db.queryForObject("select id from users where username=?",Long.class,name);assertEquals(1,db.queryForObject("select count(*) from study_entry_attempts where user_id=?",Integer.class,uid));assertEquals(0,db.queryForObject("select count(*) from study_progress where user_id=?",Integer.class,uid));
            var levels=roadmap(name,"ROADMAP_OPEN",Map.of()).path("levels");
            for(int i=0;i<5;i++){assertEquals(i<start,levels.get(i).path("unlocked").asBoolean());assertEquals(0,levels.get(i).path("completedCount").asInt());if(i<start-1)for(var module:levels.get(i).path("modules"))assertTrue(module.path("unlocked").asBoolean());}
            if(start<5){String locked=db.queryForObject("select l.id from study_lessons l join study_modules m on m.id=l.module_id where m.level_id=? order by m.ordinal_no,l.ordinal_no limit 1",String.class,start+1);
            assertThrows(ApiException.class,()->roadmap(name,"ROADMAP_LESSON",Map.of("lessonId",locked)));}
            for(int lower=1;lower<start;lower++){
                String review=db.queryForObject("select l.id from study_lessons l join study_modules m on m.id=l.module_id where m.level_id=? order by m.ordinal_no desc,l.ordinal_no desc limit 1",String.class,lower);
                assertEquals(review,roadmap(name,"ROADMAP_LESSON",Map.of("lessonId",review)).path("id").asText());
            }
        }
        String name="entry_score_9";long uid=db.queryForObject("select id from users where username=?",Long.class,name);
        String second=db.queryForObject("select l.id from study_lessons l join study_modules m on m.id=l.module_id where m.level_id=3 and m.ordinal_no=2 order by l.ordinal_no limit 1",String.class);
        assertThrows(ApiException.class,()->roadmap(name,"ROADMAP_LESSON",Map.of("lessonId",second)));
        for(String module:db.queryForList("select id from study_modules where level_id=3 order by ordinal_no",String.class)){
            for(String lesson:db.queryForList("select id from study_lessons where module_id=? order by ordinal_no",String.class,module)){
                var a=roadmap(name,"ROADMAP_LESSON",Map.of("lessonId",lesson)).path("attempt");long id=a.path("id").asLong();assertEquals("COMPLETED",roadmap(name,"ROADMAP_SUBMIT",Map.of("attemptId",id,"answers",answers("study_attempts",id,100))).path("status").asText());
            }
            var a=roadmap(name,"ROADMAP_START",Map.of("kind","MODULE_TEST","referenceId",module,"requestKey",UUID.randomUUID().toString()));long id=a.path("id").asLong();
            assertEquals("PASSED",roadmap(name,"ROADMAP_SUBMIT",Map.of("attemptId",id,"answers",answers("study_attempts",id,100))).path("status").asText());
        }
        var exam=roadmap(name,"ROADMAP_START",Map.of("kind","LEVEL_TEST","referenceId","3","requestKey",UUID.randomUUID().toString()));long id=exam.path("id").asLong();
        assertEquals("PASSED",roadmap(name,"ROADMAP_SUBMIT",Map.of("attemptId",id,"answers",answers("study_attempts",id,8))).path("status").asText());
        assertTrue(roadmap(name,"ROADMAP_OPEN",Map.of()).path("levels").get(3).path("unlocked").asBoolean());
        assertEquals(3,call(name,"PLACEMENT_STATUS",Map.of()).path("startingLevel").asInt());assertEquals(4,call(name,"PLACEMENT_STATUS",Map.of()).path("currentLevel").asInt());
        assertEquals(3,db.queryForObject("select starting_level from study_entry_profiles where user_id=?",Integer.class,uid));
    }
}
