package com.grammarquest;

import com.fasterxml.jackson.databind.*;
import com.grammarquest.entity.User;
import com.grammarquest.repository.UserRepository;
import com.grammarquest.security.SocketSessionRegistry;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.core.io.ClassPathResource;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.net.*;
import java.net.http.*;
import java.sql.DriverManager;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

/** Toàn bộ Spring Boot + Tomcat + security + socket + Flyway/MySQL thật, không mock giao thức. */
@EnabledIfEnvironmentVariable(named="RUN_FULL_REALTIME_TEST",matches="true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class FullRealtimeIntegrationTest {
    final String schema="grammar_quest_full_ws_"+UUID.randomUUID().toString().replace("-","").substring(0,12)+"_test";
    String dbUser,dbPassword,base;ObjectMapper json;ServletWebServerApplicationContext app;
    static final String PASSWORD="NetworkTest123!";
    @BeforeAll void boot() throws Exception {
        assertTrue(schema.matches("grammar_quest_full_ws_[0-9a-f]{12}_test"));
        var yaml=new YamlPropertiesFactoryBean();yaml.setResources(new ClassPathResource("application.yml"));var props=Objects.requireNonNull(yaml.getObject());
        dbUser=System.getenv().getOrDefault("EXAM_TEST_DB_USER",props.getProperty("spring.datasource.username"));dbPassword=System.getenv().getOrDefault("EXAM_TEST_DB_PASSWORD",props.getProperty("spring.datasource.password"));
        try(var c=DriverManager.getConnection("jdbc:mysql://127.0.0.1:3306/",dbUser,dbPassword);var s=c.createStatement()){s.executeUpdate("CREATE DATABASE `"+schema+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");}
        app=(ServletWebServerApplicationContext)new SpringApplicationBuilder(GrammarQuestApplication.class).run("--server.port=0","--app.capacity.max-sockets-per-account=40","--app.allowed-origin=http://localhost:5173,http://localhost:5177","--spring.datasource.url=jdbc:mysql://127.0.0.1:3306/"+schema,"--spring.datasource.username="+dbUser,"--spring.datasource.password="+dbPassword,"--spring.main.banner-mode=off","--debug=false","--logging.level.root=WARN","--logging.level.org.springframework=WARN");
        base="http://localhost:"+app.getWebServer().getPort();json=app.getBean(ObjectMapper.class);
    }
    @AfterAll void cleanup()throws Exception {
        if(app!=null)app.close();
        if(dbUser!=null&&schema.matches("grammar_quest_full_ws_[0-9a-f]{12}_test"))try(var c=DriverManager.getConnection("jdbc:mysql://127.0.0.1:3306/",dbUser,dbPassword);var s=c.createStatement()){s.executeUpdate("DROP DATABASE IF EXISTS `"+schema+"`");}
    }
    String createUser(){String name="test_"+UUID.randomUUID().toString().substring(0,8);app.getBean(UserRepository.class).save(new User(name,name,app.getBean(PasswordEncoder.class).encode(PASSWORD)));return name;}
    JsonNode awaitAction(Pipe pipe,String action)throws Exception {
        long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(10);
        while(System.nanoTime()<until){var raw=pipe.incoming.poll(1,TimeUnit.SECONDS);if(raw!=null){var data=json.readTree(raw);if(action.equals(data.path("action").asText()))return data;}}
        throw new AssertionError("Missing socket action: "+action);
    }
    @Test void workspaceWatchAndReportDecisionAndCurriculumPushUseRealSockets()throws Exception {
        var users=app.getBean(UserRepository.class);
        String teacherName=createUser(),adminName=createUser(),learnerName=createUser();
        var teacherUser=users.findByUsernameIgnoreCase(teacherName).orElseThrow();teacherUser.role="TEACHER";users.save(teacherUser);
        var adminUser=users.findByUsernameIgnoreCase(adminName).orElseThrow();adminUser.role="ADMIN";users.save(adminUser);
        var teacher=new Client(teacherName);var admin=new Client(adminName);var learner=new Client(learnerName);
        try(var t=teacher.open("/api/ws-system");var a=admin.open("/api/ws-system");var b=admin.open("/api/ws-system");var l=learner.open("/api/ws-system")){
            assertEquals("ERROR",l.request("ADMIN_REPORTS_WATCH").path("action").asText());
            assertEquals("ERROR",l.request("TEACHER_OVERVIEW_WATCH").path("action").asText());
            assertEquals(0,t.request("TEACHER_OVERVIEW_WATCH").path("payload").path("classes").asInt());
            assertEquals("CLASS_DATA",t.request("CLASS_CREATE",Map.of("name","Live workspace class")).path("action").asText());
            assertEquals(1,awaitAction(t,"WORKSPACE_UPDATE").path("payload").path("data").path("classes").asInt());
            var db=app.getBean(org.springframework.jdbc.core.JdbcTemplate.class);
            long learnerId=users.findByUsernameIgnoreCase(learnerName).orElseThrow().id;
            db.update("insert into learner_reports(reporter_id,target_id,context_type,context_id,reason) values(?,?,'CLASS',1,'workspace test')",teacherUser.id,learnerId);
            long reportId=db.queryForObject("select max(id) from learner_reports",Long.class);
            assertEquals("WORKSPACE_DATA",a.request("ADMIN_REPORTS_WATCH").path("action").asText());
            assertEquals("WORKSPACE_DATA",b.request("ADMIN_REPORTS_WATCH").path("action").asText());
            assertEquals("REPORT_DECISION_DATA",a.request("ADMIN_REPORT_DECIDE",Map.of("reportId",reportId,"source","USER","action","WARN","note","Checked")).path("action").asText());
            var update=awaitAction(b,"WORKSPACE_UPDATE");
            assertTrue(java.util.stream.StreamSupport.stream(update.path("payload").path("data").path("reports").spliterator(),false).anyMatch(r->r.path("id").asLong()==reportId&&"RESOLVED".equals(r.path("status").asText())));
            String slug="realtime-"+UUID.randomUUID().toString().substring(0,8);
            assertEquals(200,teacher.post("/api/v1/teacher/curriculum/topics",json.writeValueAsString(Map.of("slug",slug,"title","Realtime topic","description","Description","outcome","Outcome","sortOrder",99,"planetStyle","aqua"))).statusCode());
            assertEquals("CURRICULUM_CHANGED",awaitAction(l,"CURRICULUM_CHANGED").path("action").asText());
            assertEquals("WORKSPACE_DATA",t.request("WORKSPACE_UNWATCH").path("action").asText());
        }
    }
    @Test void adminReminderAndDisconnectReachOnlySelectedRealSocket()throws Exception {
        var users=app.getBean(UserRepository.class);String adminName=createUser(),learnerName=createUser();
        var account=users.findByUsernameIgnoreCase(adminName).orElseThrow();account.role="ADMIN";users.save(account);
        var admin=new Client(adminName);var learner=new Client(learnerName);
        try(var a=admin.open("/api/ws-system");var target=learner.open("/api/ws-system");var other=learner.open("/api/ws-system")){
            a.send("{\"action\":\"AUTH\",\"payload\":{\"role\":\"ADMIN\"}}");
            assertEquals("ACCOUNT_DATA",a.request("ACCOUNT_GET").path("action").asText());
            assertEquals("MATCHMAKING_UPDATE",target.request("QUEUE_JOIN").path("action").asText());
            var queue=app.getBean(com.grammarquest.service.ArenaMatchmaker.class).dashboardQueue();
            var row=queue.stream().filter(q->q.username().equals(learnerName)).findFirst().orElseThrow();
            app.getBean(com.grammarquest.service.ServerMonitorService.class).broadcastStats();
            var stats=awaitAction(a,"STATS_UPDATE").path("data");assertTrue(stats.has("alerts"));assertTrue(stats.has("queue"));
            assertEquals("SYSTEM_ACTION_RESULT",a.request("SYSTEM_REMIND",Map.of("sessionId",row.sessionId(),"message","Continue learning")).path("action").asText());
            assertEquals("Continue learning",awaitAction(target,"SYSTEM_NOTICE").path("payload").path("message").asText());
            assertEquals("SYSTEM_ACTION_RESULT",a.request("SYSTEM_DISCONNECT",Map.of("sessionId",row.sessionId())).path("action").asText());
            assertEquals(4006,target.closed.get(5,TimeUnit.SECONDS));
            assertTrue(app.getBean(com.grammarquest.service.ArenaMatchmaker.class).dashboardQueue().stream().noneMatch(q->q.username().equals(learnerName)));
            assertTrue(app.getBean(com.grammarquest.websocket.SystemSocketHandler.class).clientDetails().stream().noneMatch(c->c.sessionId().equals(row.sessionId())));
            assertEquals("ACCOUNT_DATA",other.request("ACCOUNT_GET").path("action").asText());
            assertFalse(users.findByUsernameIgnoreCase(learnerName).orElseThrow().locked);
        }
    }
    @Test void admissionLimitsRejectBusyWorkAndRecoverAfterCapacityIsReleased()throws Exception {
        var login=new Client(createUser());var capacity=app.getBean(com.grammarquest.security.ServerCapacity.class);
        try(var pipe=login.open("/api/ws-system")){
            int entered=0;
            try{
                while(capacity.tryEnter())entered++;
                var response=login.http.send(HttpRequest.newBuilder(URI.create(base+"/api/v1/auth/me")).GET().build(),HttpResponse.BodyHandlers.ofString());
                assertEquals(503,response.statusCode());assertEquals("3",response.headers().firstValue("Retry-After").orElseThrow());
                assertEquals("SERVER_BUSY",pipe.request("ACCOUNT_GET").path("payload").path("code").asText());
            }finally{for(int i=0;i<entered;i++)capacity.leave();}
            assertEquals("ACCOUNT_DATA",pipe.request("ACCOUNT_GET").path("action").asText());
            assertEquals(0,capacity.metrics().get("activeRequests"));
        }
    }
    @Test void connectionLimitIsSharedByRawAndStompAndReleasedOnDisconnect()throws Exception {
        var login=new Client(createUser());var pipes=new ArrayList<Pipe>();
        try{
            // Integration profile allows 40 sockets/account for the existing 30-socket load test.
            for(int i=0;i<40;i++)pipes.add(login.open("/api/ws-system"));
            try(var extra=login.open("/ws")){assertEquals(1013,extra.closed.get(5,TimeUnit.SECONDS));}
            var first=pipes.removeFirst();first.close();first.closed.get(5,TimeUnit.SECONDS);
            try(var replacement=login.open("/api/ws-system")){assertEquals("ACCOUNT_DATA",replacement.request("ACCOUNT_GET").path("action").asText());}
        }finally{pipes.forEach(Pipe::close);}
    }
    @Test void roadmapContainsNoTheoryAndMatchesRestUnlockState()throws Exception {
        var login=new Client(createUser());
        try(var pipe=login.open("/api/ws-system")){
            var roadmap=pipe.request("GET_ROADMAP");assertEquals("ROADMAP_DATA",roadmap.path("action").asText());
            var groups=roadmap.path("payload");assertTrue(groups.isArray());assertFalse(groups.isEmpty());
            assertTrue(groups.get(0).path("topic").path("unlocked").asBoolean());
            var visible=new java.util.HashMap<Long,String>();
            for(var group:groups)for(var lesson:group.path("lessons")){assertTrue(lesson.path("theory").isNull());visible.put(lesson.path("id").asLong(),lesson.path("status").asText());}
            var rest=login.http.send(HttpRequest.newBuilder(URI.create(base+"/api/v1/lessons")).GET().build(),HttpResponse.BodyHandlers.ofString());assertEquals(200,rest.statusCode());
            var lessons=json.readTree(rest.body());assertEquals(visible.size(),lessons.size());
            for(var lesson:lessons)assertEquals(visible.get(lesson.path("id").asLong()),lesson.path("status").asText());
        }
    }
    @Test void reportsAcrossAllSourcesNotifyOnceAndAdminPenaltiesAreEnforced()throws Exception {
        var users=app.getBean(UserRepository.class);String teacherName=createUser(),adminName=createUser(),aliceName=createUser(),bobName=createUser();
        var teacherAccount=users.findByUsernameIgnoreCase(teacherName).orElseThrow();teacherAccount.role="TEACHER";users.save(teacherAccount);
        var adminAccount=users.findByUsernameIgnoreCase(adminName).orElseThrow();adminAccount.role="ADMIN";users.save(adminAccount);
        var teacher=new Client(teacherName);var admin=new Client(adminName);var alice=new Client(aliceName);var bob=new Client(bobName);
        long aliceId=users.findByUsernameIgnoreCase(aliceName).orElseThrow().id;
        var db=app.getBean(org.springframework.jdbc.core.JdbcTemplate.class);
        try(var t=teacher.open("/api/ws-system");var a=alice.open("/api/ws-system");var a2=alice.open("/api/ws-system");var b=bob.open("/api/ws-system");var b2=bob.open("/api/ws-system");var mod=admin.open("/api/ws-system");var mod2=admin.open("/api/ws-system")){
            var classroom=t.request("CLASS_CREATE",Map.of("name","Report checks")).path("payload");long classId=classroom.path("id").asLong();
            a.request("CLASS_JOIN",Map.of("code",classroom.path("joinCode").asText()));b.request("CLASS_JOIN",Map.of("code",classroom.path("joinCode").asText()));
            long messageId=a.request("CLASS_CHAT",Map.of("classId",classId,"body","Reportable message")).path("payload").path("id").asLong();
            long classReport=b.request("CLASS_REPORT",Map.of("classId",classId,"messageId",messageId,"reason","Review this message")).path("payload").path("id").asLong();
            assertEquals(classReport,awaitAction(b2,"REPORT_SUBMITTED").path("payload").path("reportId").asLong());
            assertTrue(classReport>0);assertEquals("CLASS",awaitAction(a,"REPORT_RECEIVED").path("payload").path("source").asText());
            assertEquals("ERROR",b.request("CLASS_REPORT",Map.of("classId",classId,"messageId",messageId,"reason","Duplicate")).path("action").asText());
            assertEquals("ADMIN_ONLY",b.request("ADMIN_REPORT_DECIDE",Map.of("reportId",classReport,"source","CLASS","action","WARN","note","" )).path("payload").path("code").asText());
            var decision=Map.<String,Object>of("reportId",classReport,"source","CLASS","action","WARN","note","x".repeat(500));
            var one=CompletableFuture.supplyAsync(()->{try{return mod.request("ADMIN_REPORT_DECIDE",decision);}catch(Exception e){throw new CompletionException(e);}});
            var two=CompletableFuture.supplyAsync(()->{try{return mod2.request("ADMIN_REPORT_DECIDE",decision);}catch(Exception e){throw new CompletionException(e);}});
            var replies=List.of(one.get(15,TimeUnit.SECONDS),two.get(15,TimeUnit.SECONDS));
            assertEquals(1,replies.stream().filter(r->r.path("action").asText().equals("REPORT_DECISION_DATA")).count());
            assertEquals(1,replies.stream().filter(r->r.path("payload").path("code").asText().equals("REPORT_CLOSED")).count());
            var warning=awaitAction(a,"REPORT_DECISION").path("payload");assertEquals("WARN",warning.path("decision").asText());assertFalse(warning.has("note"));assertFalse(warning.has("reporterId"));
            assertEquals("REPORTER",awaitAction(b2,"REPORT_DECISION").path("payload").path("recipient").asText());
            assertEquals(506,db.queryForObject("select char_length(decision) from reports where id=?",Integer.class,classReport));
            var reportPayload=Map.<String,Object>of("targetId",aliceId,"contextType","CLASS","contextId",classId,"reason","Account report");
            long userReport=b.request("REPORT_USER",reportPayload).path("payload").path("id").asLong();assertTrue(userReport>0);
            assertEquals(userReport,awaitAction(b2,"REPORT_SUBMITTED").path("payload").path("reportId").asLong());
            assertEquals("INVALID_REPORT",b.request("REPORT_USER",reportPayload).path("payload").path("code").asText());
            assertEquals("USER",awaitAction(a,"REPORT_RECEIVED").path("payload").path("source").asText());
            assertEquals("REPORT_DECISION_DATA",mod.request("ADMIN_REPORT_DECIDE",Map.of("reportId",userReport,"source","USER","action","DISMISS","note","x".repeat(500))).path("action").asText());
            assertEquals("DISMISS",awaitAction(a,"REPORT_DECISION").path("payload").path("decision").asText());
            assertEquals("DISMISS",awaitAction(b2,"REPORT_DECISION").path("payload").path("decision").asText());
            assertEquals("DISMISS: "+"x".repeat(500),db.queryForObject("select decision from learner_reports where id=?",String.class,userReport));
            var room=a.request("ARENA_CREATE").path("payload");long roomId=room.path("id").asLong();assertTrue(roomId>0);
            b.request("ARENA_JOIN",Map.of("code",room.path("code").asText()));
            long arenaMessage=a.request("ARENA_CHAT",Map.of("roomId",roomId,"body","Arena message")).path("payload").path("id").asLong();
            assertEquals("ARENA_DATA",b.request("ARENA_REPORT",Map.of("roomId",roomId,"messageId",arenaMessage,"reason","Review arena message")).path("action").asText());
            assertEquals("ARENA",awaitAction(b2,"REPORT_SUBMITTED").path("payload").path("source").asText());
            var arenaReport=awaitAction(a,"REPORT_RECEIVED").path("payload");assertEquals("ARENA",arenaReport.path("source").asText());
            assertEquals("REPORT_DECISION_DATA",mod.request("ADMIN_REPORT_DECIDE",Map.of("reportId",arenaReport.path("reportId").asLong(),"source","ARENA","action","MUTE_24H","note","x".repeat(500))).path("action").asText());
            assertEquals("MUTE_24H",awaitAction(a,"REPORT_DECISION").path("payload").path("decision").asText());
            assertEquals("MUTE_24H",awaitAction(b2,"REPORT_DECISION").path("payload").path("decision").asText());
            assertEquals("CHAT_MUTED",a.request("CLASS_CHAT",Map.of("classId",classId,"body","Muted")).path("payload").path("code").asText());
            assertEquals("CHAT_MUTED",a.request("ARENA_CHAT",Map.of("roomId",roomId,"body","Muted")).path("payload").path("code").asText());
            long lockReport=b.request("REPORT_USER",reportPayload).path("payload").path("id").asLong();assertTrue(lockReport>userReport);
            assertEquals(lockReport,awaitAction(b2,"REPORT_SUBMITTED").path("payload").path("reportId").asLong());
            assertEquals("REPORT_DECISION_DATA",mod.request("ADMIN_REPORT_DECIDE",Map.of("reportId",lockReport,"source","USER","action","LOCK","note","Reviewed")).path("action").asText());
            assertEquals("LOCK",awaitAction(a,"REPORT_DECISION").path("payload").path("decision").asText());
            assertEquals("LOCK",awaitAction(b2,"REPORT_DECISION").path("payload").path("decision").asText());
            assertEquals(4003,a.closed.get(5,TimeUnit.SECONDS));assertEquals(4003,a2.closed.get(5,TimeUnit.SECONDS));assertTrue(users.findById(aliceId).orElseThrow().locked);
        }
    }
    @Test void openReportsRemainVisibleAheadOfTwoHundredNewerResolvedReports()throws Exception {
        var users=app.getBean(UserRepository.class);String name=createUser(),targetName=createUser();
        var actor=users.findByUsernameIgnoreCase(name).orElseThrow();actor.role="ADMIN";users.save(actor);
        long targetId=users.findByUsernameIgnoreCase(targetName).orElseThrow().id;
        var db=app.getBean(org.springframework.jdbc.core.JdbcTemplate.class);
        db.update("insert into learner_reports(reporter_id,target_id,context_type,context_id,reason,status,created_at) values(?,?,'CLASS',1,'Old pending report','OPEN',date_sub(current_timestamp(6),interval 30 day))",actor.id,targetId);
        long oldId=db.queryForObject("select max(id) from learner_reports",Long.class);
        var rows=new ArrayList<Object[]>();for(int i=0;i<201;i++)rows.add(new Object[]{actor.id,targetId});
        db.batchUpdate("insert into learner_reports(reporter_id,target_id,context_type,context_id,reason,status) values(?,?,'CLASS',1,'Resolved fixture','RESOLVED')",rows);
        try(var socket=new Client(name).open("/api/ws-system")){
            var reports=socket.request("ADMIN_REPORTS_WATCH").path("payload").path("reports");assertEquals(200,reports.size());
            assertTrue(java.util.stream.StreamSupport.stream(reports.spliterator(),false).anyMatch(r->r.path("source").asText().equals("USER")&&r.path("id").asLong()==oldId));
            boolean resolvedSeen=false;for(var r:reports){if("OPEN".equals(r.path("status").asText()))assertFalse(resolvedSeen);else resolvedSeen=true;}
        }
    }
    @Test void supportChatIsPrivatePersistentIdempotentAndHandsOverToAdmin()throws Exception {
        var users=app.getBean(UserRepository.class);String aliceName=createUser(),bobName=createUser(),adminName=createUser();
        var adminAccount=users.findByUsernameIgnoreCase(adminName).orElseThrow();adminAccount.role="ADMIN";users.save(adminAccount);
        var alice=new Client(aliceName);var bob=new Client(bobName);var admin=new Client(adminName);
        long threadId;
        try(var a=alice.open("/api/ws-system");var a2=alice.open("/api/ws-system");var b=bob.open("/api/ws-system");var mod=admin.open("/api/ws-system")){
            var initial=a.request("SUPPORT_OPEN").path("payload");threadId=initial.path("id").asLong();assertTrue(threadId>0);assertEquals("BOT",initial.path("messages").get(0).path("senderType").asText());
            assertEquals(threadId,a2.request("SUPPORT_OPEN").path("payload").path("id").asLong());
            long otherThread=b.request("SUPPORT_OPEN").path("payload").path("id").asLong();assertNotEquals(threadId,otherThread);
            assertEquals("ADMIN_ONLY",b.request("SUPPORT_LIST").path("payload").path("code").asText());
            assertEquals("SUPPORT_FORBIDDEN",b.request("SUPPORT_SEND",Map.of("threadId",threadId,"body","Intrusion","clientMessageId",UUID.randomUUID().toString())).path("payload").path("code").asText());
            assertEquals("SUPPORT_DATA",mod.request("SUPPORT_OPEN",Map.of("threadId",threadId)).path("action").asText());
            var payload=Map.<String,Object>of("threadId",threadId,"body","My socket connection is broken","clientMessageId",UUID.randomUUID().toString());
            var sent=a.request("SUPPORT_SEND",payload).path("payload");assertEquals(3,sent.path("messages").size());
            assertEquals("USER",sent.path("messages").get(1).path("senderType").asText());assertEquals("BOT",sent.path("messages").get(2).path("senderType").asText());
            assertEquals(sent.path("lastMessageId"),a.request("SUPPORT_SEND",payload).path("payload").path("lastMessageId"));
            assertEquals(sent.path("lastMessageId"),awaitAction(a2,"SUPPORT_UPDATE").path("payload").path("lastMessageId"));
            assertEquals(sent.path("lastMessageId"),awaitAction(mod,"SUPPORT_UPDATE").path("payload").path("lastMessageId"));
            assertTrue(b.incoming.stream().noneMatch(raw->raw.contains("SUPPORT_UPDATE")||raw.contains("SUPPORT_NOTIFICATION")));
            var reply=mod.request("SUPPORT_SEND",Map.of("threadId",threadId,"body","Admin is checking the connection","clientMessageId",UUID.randomUUID().toString())).path("payload");
            assertEquals(4,reply.path("messages").size());assertEquals("ADMIN",reply.path("messages").get(3).path("senderType").asText());
            assertEquals(reply.path("lastMessageId"),awaitAction(a,"SUPPORT_UPDATE").path("payload").path("lastMessageId"));
            assertEquals(reply.path("lastMessageId"),awaitAction(a2,"SUPPORT_UPDATE").path("payload").path("lastMessageId"));
            var followup=a.request("SUPPORT_SEND",Map.of("threadId",threadId,"body","Thanks, please check","clientMessageId",UUID.randomUUID().toString())).path("payload");
            assertEquals(5,followup.path("messages").size());assertEquals("USER",followup.path("messages").get(4).path("senderType").asText());
            assertEquals("SUPPORT_DATA",a.request("SUPPORT_UNWATCH").path("action").asText());
            mod.request("SUPPORT_SEND",Map.of("threadId",threadId,"body","We have received your details","clientMessageId",UUID.randomUUID().toString()));
            var notification=awaitAction(a,"SUPPORT_NOTIFICATION").path("payload");assertEquals(threadId,notification.path("threadId").asLong());
            assertEquals("SUPPORT_DATA",mod.request("SUPPORT_LIST").path("action").asText());
            var db=app.getBean(org.springframework.jdbc.core.JdbcTemplate.class);
            assertEquals(6,db.queryForObject("select count(*) from support_messages where thread_id=?",Integer.class,threadId));
            for(int i=0;i<3;i++)assertEquals("SUPPORT_DATA",a.request("SUPPORT_SEND",Map.of("threadId",threadId,"body","Extra detail "+i,"clientMessageId",UUID.randomUUID().toString())).path("action").asText());
            assertEquals("SUPPORT_RATE_LIMIT",a.request("SUPPORT_SEND",Map.of("threadId",threadId,"body","Too many","clientMessageId",UUID.randomUUID().toString())).path("payload").path("code").asText());
        }
        try(var reopened=alice.open("/api/ws-system")){
            var history=reopened.request("SUPPORT_OPEN").path("payload");assertEquals(threadId,history.path("id").asLong());assertEquals(9,history.path("messages").size());
        }
    }
    class Client {
        final HttpClient http=HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).connectTimeout(Duration.ofSeconds(5)).build();
        final String username;
        Client(String username)throws Exception{this.username=username;login();}
        String csrf()throws Exception{return json.readTree(http.send(HttpRequest.newBuilder(URI.create(base+"/api/v1/auth/csrf")).GET().build(),HttpResponse.BodyHandlers.ofString()).body()).path("token").asText();}
        HttpResponse<String> post(String path,String body)throws Exception{return http.send(HttpRequest.newBuilder(URI.create(base+path)).header("Content-Type","application/json").header("X-XSRF-TOKEN",csrf()).POST(HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());}
        void login()throws Exception{assertEquals(200,post("/api/v1/auth/login",json.writeValueAsString(Map.of("username",username,"password",PASSWORD))).statusCode());}
        Pipe open(String path)throws Exception{return new Pipe(http,path);}
    }
    class Pipe implements WebSocket.Listener,AutoCloseable {
        WebSocket ws;final BlockingQueue<String> incoming=new LinkedBlockingQueue<>();final StringBuilder text=new StringBuilder();final CompletableFuture<Integer> closed=new CompletableFuture<>();
        Pipe(HttpClient http,String path)throws Exception{ws=http.newWebSocketBuilder().header("Origin","http://localhost:5173").buildAsync(URI.create(base.replace("http:","ws:")+path),this).get(10,TimeUnit.SECONDS);}
        @Override public void onOpen(WebSocket socket){socket.request(1);}
        @Override public CompletionStage<?> onText(WebSocket socket,CharSequence data,boolean last){text.append(data);if(last){incoming.add(text.toString());text.setLength(0);}socket.request(1);return null;}
        @Override public CompletionStage<?> onClose(WebSocket socket,int status,String reason){closed.complete(status);return null;}
        @Override public void onError(WebSocket socket,Throwable error){closed.completeExceptionally(error);}
        void send(String message){ws.sendText(message,true).join();}
        JsonNode request(String action)throws Exception{return request(action,Map.of());}
        JsonNode request(String action,Map<String,Object> payload)throws Exception {String id=UUID.randomUUID().toString();send(json.writeValueAsString(Map.of("action",action,"requestId",id,"payload",payload)));long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(15);while(System.nanoTime()<until){String raw=incoming.poll(1,TimeUnit.SECONDS);if(raw!=null){var data=json.readTree(raw);if(id.equals(data.path("requestId").asText()))return data;}}throw new AssertionError("No response: "+action);}
        @Override public void close(){
            if(ws==null||closed.isDone()||ws.isOutputClosed())return;
            try{ws.sendClose(1000,"test finished").join();}
            catch(CompletionException ex){if(!closed.isDone()&&!ws.isInputClosed())throw ex;}
        }
    }
    @Test void logoutClosesEverySocketOfSessionButKeepsOtherLoginAlive()throws Exception {
        String name=createUser();var login=new Client(name);var anotherLogin=new Client(name);
        try(var a=login.open("/api/ws-system");var b=login.open("/api/ws-system");var stomp=login.open("/ws");var independent=anotherLogin.open("/api/ws-system")){
            assertEquals("ACCOUNT_DATA",a.request("ACCOUNT_GET").path("action").asText());
            stomp.send("CONNECT\naccept-version:1.2\nheart-beat:0,0\n\n\0");assertTrue(stomp.incoming.poll(5,TimeUnit.SECONDS).startsWith("CONNECTED"));
            assertEquals(204,login.post("/api/v1/auth/logout","{}").statusCode());
            // Tomcat cũng chủ động đóng session đã hết hạn bằng 1008; registry dùng 4004.
            assertTrue(Set.of(4004,1008).contains(a.closed.get(5,TimeUnit.SECONDS)));assertTrue(Set.of(4004,1008).contains(b.closed.get(5,TimeUnit.SECONDS)));assertTrue(Set.of(4004,1008).contains(stomp.closed.get(5,TimeUnit.SECONDS)));
            assertEquals("ACCOUNT_DATA",independent.request("ACCOUNT_GET").path("action").asText());
        }
    }
    @Test void restRawAndStompShareRateWindowWithoutBanningRoommates()throws Exception {
        String name=createUser();var login=new Client(name);var roommate=new Client(createUser());
        try(var raw=login.open("/api/ws-system");var stomp=login.open("/ws");var other=roommate.open("/api/ws-system")){
            stomp.send("CONNECT\naccept-version:1.2\nheart-beat:0,0\n\n\0");assertTrue(stomp.incoming.poll(5,TimeUnit.SECONDS).startsWith("CONNECTED"));
            // Sáu yêu cầu REST cùng cửa sổ, ba raw và hai STOMP; payload lỗi vẫn tính trước validation.
            String token=login.csrf();List<CompletableFuture<HttpResponse<String>>> calls=new ArrayList<>();
            for(int i=0;i<6;i++)calls.add(login.http.sendAsync(HttpRequest.newBuilder(URI.create(base+"/api/v1/attempts/0/answers")).header("Content-Type","application/json").header("X-XSRF-TOKEN",token).POST(HttpRequest.BodyPublishers.ofString("{}")).build(),HttpResponse.BodyHandlers.ofString()));
            calls.forEach(CompletableFuture::join);
            for(int i=0;i<3;i++)raw.send("{\"action\":\"SUBMIT_ANSWER\",\"payload\":{}}");
            for(int i=0;i<2;i++)stomp.send("SEND\ndestination:/app/arena/action\ncontent-type:application/json\n\n{\"action\":\"ANSWER\",\"roomId\":0,\"roundNo\":1,\"option\":\"A\"}\0");
            assertEquals(4005,raw.closed.get(5,TimeUnit.SECONDS));assertEquals(4005,stomp.closed.get(5,TimeUnit.SECONDS));
            assertEquals(429,login.post("/api/v1/attempts/0/answers","{}").statusCode());
            assertFalse(app.getBean(UserRepository.class).findByUsernameIgnoreCase(name).orElseThrow().locked);
            assertEquals("ACCOUNT_DATA",other.request("ACCOUNT_GET").path("action").asText());
        }
    }
    @Test void thirtyRealConnectionsServeConcurrentRequestsAndReleaseRam()throws Exception {
        var login=new Client(createUser());List<Pipe> pipes=new ArrayList<>();List<Long> elapsed=Collections.synchronizedList(new ArrayList<>());
        try{
            for(int i=0;i<30;i++)pipes.add(login.open("/api/ws-system"));
            var jobs=pipes.stream().map(pipe->CompletableFuture.runAsync(()->{try{for(int i=0;i<5;i++){long start=System.nanoTime();assertEquals("ACCOUNT_DATA",pipe.request("ACCOUNT_GET").path("action").asText());elapsed.add(System.nanoTime()-start);}}catch(Exception e){throw new CompletionException(e);}})).toArray(CompletableFuture[]::new);
            CompletableFuture.allOf(jobs).get(30,TimeUnit.SECONDS);assertEquals(150,elapsed.size());
            elapsed.sort(Long::compare);long p95=TimeUnit.NANOSECONDS.toMillis(elapsed.get((int)(elapsed.size()*.95)-1));assertTrue(p95<5000,"p95="+p95+"ms");System.out.println("REALTIME_LOAD: 30 sockets, 150 requests, p95="+p95+"ms");
        }finally{pipes.forEach(Pipe::close);}
        long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(app.getBean(SocketSessionRegistry.class).size()!=0&&System.nanoTime()<until)Thread.sleep(20);
        assertEquals(0,app.getBean(SocketSessionRegistry.class).size());assertEquals(0,app.getBean(com.grammarquest.websocket.SystemSocketHandler.class).connectionCount());
    }
    @Test void browserUsesRealBackendAndRecoversAfterDisconnect()throws Exception {
        Assumptions.assumeTrue("true".equals(System.getenv("RUN_BROWSER_REALTIME_TEST")));
        var directory=java.nio.file.Path.of("../client/artifacts/real-backend").toAbsolutePath().normalize();java.nio.file.Files.createDirectories(directory);
        var fixture=directory.resolve("connection.json");var result=directory.resolve("result.json");java.nio.file.Files.deleteIfExists(result);
        try{
            java.nio.file.Files.writeString(fixture,json.writeValueAsString(Map.of("base",base,"username",createUser(),"password",PASSWORD)));
            long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(90);
            while(!java.nio.file.Files.exists(result)&&System.nanoTime()<until)Thread.sleep(100);
            assertTrue(java.nio.file.Files.exists(result),"Run node scripts/check-real-backend.mjs in source/client");
            var report=json.readTree(java.nio.file.Files.readString(result));assertTrue(report.path("passed").asBoolean(),report.path("error").asText());
        }finally{java.nio.file.Files.deleteIfExists(fixture);java.nio.file.Files.deleteIfExists(result);}
    }
    @Test void pvpPacketIsSharedAndReleasedWhenBothClientsDisconnect()throws Exception {
        var host=new Client(createUser());var guest=new Client(createUser());
        var created=host.post("/api/v1/arena/rooms","{}");assertEquals(200,created.statusCode());var room=json.readTree(created.body());long id=room.path("id").asLong();
        assertEquals(200,guest.post("/api/v1/arena/join",json.writeValueAsString(Map.of("code",room.path("code").asText()))).statusCode());
        assertEquals(200,host.post("/api/v1/arena/rooms/"+id+"/ready","{\"ready\":true}").statusCode());
        assertEquals(200,guest.post("/api/v1/arena/rooms/"+id+"/ready","{\"ready\":true}").statusCode());
        assertEquals(200,host.post("/api/v1/arena/rooms/"+id+"/start","{}").statusCode());
        var packets=app.getBean(com.grammarquest.service.ArenaSnapshotStore.class);
        try(var a=host.open("/api/ws-system");var b=guest.open("/api/ws-system")){
            assertEquals("ARENA_DATA",a.request("ARENA_OPEN",Map.of("roomId",id)).path("action").asText());
            assertEquals("ARENA_DATA",b.request("ARENA_OPEN",Map.of("roomId",id)).path("action").asText());
            assertEquals(1,packets.packetCount());
            assertTrue(app.getBean(com.grammarquest.websocket.SystemSocketHandler.class).clientDetails().stream().filter(c->Objects.equals(c.activeArenaId(),id)).allMatch(c->c.allocatedArenaQuestions()==10));
            host.post("/api/v1/auth/logout","{}");a.closed.get(5,TimeUnit.SECONDS);assertEquals(1,packets.packetCount());
            guest.post("/api/v1/auth/logout","{}");b.closed.get(5,TimeUnit.SECONDS);
        }
        long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(packets.packetCount()!=0&&System.nanoTime()<until)Thread.sleep(20);assertEquals(0,packets.packetCount());
    }
}
