package com.grammarquest.service;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import com.grammarquest.GrammarQuestApplication;
import com.grammarquest.controller.*;
import com.grammarquest.entity.User;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import java.net.*;
import java.net.http.*;
import java.sql.DriverManager;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Real HTTP, WebSocket, Flyway and MySQL in a disposable schema; no demo/user data is touched. */
@EnabledIfEnvironmentVariable(named = "RUN_NOTIFICATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class NotificationIntegrationTest {

    final String schema =
        "grammar_quest_notifications_" +
        UUID.randomUUID().toString().replace("-", "").substring(0, 12) +
        "_test";
    String dbUser, dbPassword, base;
    ServletWebServerApplicationContext app;
    JdbcTemplate db;
    UserRepository users;
    NotificationService notifications;
    ObjectMapper json;

    @BeforeAll
    void boot() throws Exception {
        dbUser = Objects.requireNonNull(System.getenv("DB_USERNAME"));
        dbPassword = Objects.requireNonNull(System.getenv("DB_PASSWORD"));
        assertTrue(schema.matches("grammar_quest_notifications_[0-9a-f]{12}_test"));
        try (
            var c = DriverManager.getConnection("jdbc:mysql://127.0.0.1:3306/", dbUser, dbPassword);
            var s = c.createStatement()
        ) {
            s.executeUpdate(
                "CREATE DATABASE `" + schema + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            );
        }
        app = (ServletWebServerApplicationContext) new SpringApplicationBuilder(
            GrammarQuestApplication.class
        ).run(
            "--spring.profiles.active=test",
            "--DB_TEST_NAME=" + schema,
            "--server.port=0",
            "--spring.flyway.locations=filesystem:" +
                java.nio.file.Path.of("src/main/resources/db/migration")
                    .toAbsolutePath()
                    .toString()
                    .replace('\\', '/'),
            "--spring.datasource.url=jdbc:mysql://127.0.0.1:3306/" + schema,
            "--spring.datasource.username=" + dbUser,
            "--spring.datasource.password=" + dbPassword,
            "--app.seed-demo=false",
            "--debug=false",
            "--logging.level.root=WARN"
        );
        base = "http://127.0.0.1:" + app.getWebServer().getPort();
        db = app.getBean(JdbcTemplate.class);
        users = app.getBean(UserRepository.class);
        notifications = app.getBean(NotificationService.class);
        json = app.getBean(ObjectMapper.class);
    }

    @AfterAll
    void cleanup() throws Exception {
        if (app != null) app.close();
        if (dbUser != null && schema.matches("grammar_quest_notifications_[0-9a-f]{12}_test")) {
            try (
                var c = DriverManager.getConnection(
                    "jdbc:mysql://127.0.0.1:3306/",
                    dbUser,
                    dbPassword
                );
                var s = c.createStatement()
            ) {
                s.executeUpdate("DROP DATABASE IF EXISTS `" + schema + "`");
            }
        }
    }

    Authentication auth(User user) {
        return new UsernamePasswordAuthenticationToken(user.username, "unused");
    }

    User user(String name, String role) {
        var user = new User(
            name,
            name,
            app.getBean(PasswordEncoder.class).encode("testPassword123")
        );
        user.role = role;
        return users.save(user);
    }

    long id(Map<String, Object> row) {
        return ((Number) row.get("id")).longValue();
    }

    Map<String, Object> classroom(User teacher, User learner) {
        var classes = app.getBean(ClassroomController.class);
        var room = classes.create(
            auth(teacher),
            new ClassroomController.NewClass("Lớp " + teacher.username)
        );
        classes.join(auth(learner), new ClassroomController.Join(room.get("joinCode").toString()));
        return room;
    }

    long material(User teacher) {
        return id(
            app
                .getBean(TeacherMaterialController.class)
                .create(
                    auth(teacher),
                    new TeacherMaterialController.Body(
                        "Bộ bài kiểm tra",
                        "",
                        List.of(
                            new TeacherMaterialController.Draft(
                                "Choose A",
                                "A",
                                "B",
                                "C",
                                "D",
                                "A",
                                "A is correct",
                                "MCQ",
                                null
                            )
                        )
                    )
                )
        );
    }

    long assignment(User teacher, long classId, long materialId) {
        return id(
            app
                .getBean(ClassroomController.class)
                .assign(
                    auth(teacher),
                    classId,
                    new ClassroomController.NewAssignment(
                        "Bài tập mới",
                        null,
                        "Làm đủ câu",
                        80,
                        Instant.now().plusSeconds(3600),
                        null,
                        materialId
                    )
                )
        );
    }

    @Test
    void deliveryIsPrivateDurableAndDoesNotStartAttempts() {
        var teacher = user("privacy_teacher", "TEACHER");
        var alice = user("privacy_alice", "LEARNER");
        var bob = user("privacy_bob", "LEARNER");
        long a = id(classroom(teacher, alice));
        long b = id(classroom(teacher, bob));
        long material = material(teacher);
        long assignment = assignment(teacher, a, material);
        assignment(teacher, b, material);
        var inbox = notifications.inbox(alice.username, null);
        assertEquals(1, inbox.unreadCount());
        var item = inbox.items().getFirst();
        assertEquals(a, item.classId());
        assertEquals(assignment, item.assignmentId());
        assertEquals("Bài tập mới", item.workTitle());
        assertTrue(item.available());
        assertNotNull(item.dueAt());
        assertEquals(0, notifications.inbox(teacher.username, null).unreadCount());
        assertEquals(b, notifications.inbox(bob.username, null).items().getFirst().classId());
        assertThrows(ApiException.class, () -> notifications.read(bob.username, item.id()));
        assertNull(notifications.inbox(alice.username, null).items().getFirst().readAt());
        notifications.classwork(a, assignment, null);
        assertEquals(
            1,
            notifications.inbox(alice.username, null).unreadCount(),
            "Duplicate delivery must be idempotent"
        );
        assertNotNull(notifications.read(alice.username, item.id()).readAt());
        assertEquals(0, notifications.inbox(alice.username, null).unreadCount());
        assertEquals(
            0,
            db.queryForObject("select count(*) from assignment_attempts", Integer.class)
        );
        db.update("update assignments set status='CLOSED' where id=?", assignment);
        assertFalse(notifications.read(alice.username, item.id()).available());
        app.getBean(ClassroomController.class).removeMember(auth(teacher), a, alice.id);
        assertTrue(notifications.inbox(alice.username, null).items().isEmpty());
        assertThrows(ApiException.class, () -> notifications.read(alice.username, item.id()));
    }

    @Test
    void bothExamCreationPathsNotifyWithoutOpeningExamAndRollbackLeavesNoNotice() {
        var teacher = user("exam_notice_teacher", "TEACHER");
        var alice = user("exam_notice_alice", "LEARNER");
        long classId = id(classroom(teacher, alice));
        long material = material(teacher);
        app.getBean(TeacherMaterialController.class).exam(
            auth(teacher),
            material,
            new TeacherMaterialController.ExamInput(
                classId,
                "Kiểm tra từ kho",
                Instant.now().plusSeconds(3600)
            )
        );
        var input = json
            .createObjectNode()
            .put("classId", classId)
            .put("title", "Kiểm tra trực tiếp")
            .put("endsAt", Instant.now().plusSeconds(3600).toString());
        var q = input
            .putArray("questions")
            .addObject()
            .put("id", "q1")
            .put("prompt", "Choose A")
            .put("correct", 0);
        q.putArray("options").add("A").add("B").add("C").add("D");
        app.getBean(LiveExamService.class).action(teacher.username, "EXAM_CREATE", input);
        var inbox = notifications.inbox(alice.username, null);
        assertEquals(2, inbox.unreadCount());
        assertTrue(
            inbox
                .items()
                .stream()
                .allMatch(item -> item.kind().equals("LIVE_EXAM") && item.available())
        );
        for (var item : inbox.items()) notifications.read(alice.username, item.id());
        assertEquals(
            0,
            db.queryForObject("select count(*) from class_exam_submissions", Integer.class)
        );
        var tx = new TransactionTemplate(app.getBean(PlatformTransactionManager.class));
        tx.executeWithoutResult(status -> {
            assignment(teacher, classId, material);
            status.setRollbackOnly();
        });
        assertEquals(2, notifications.inbox(alice.username, null).items().size());
        db.update("update class_exams set closed=true where class_id=?", classId);
        assertTrue(
            notifications
                .inbox(alice.username, null)
                .items()
                .stream()
                .noneMatch(NotificationService.Item::available)
        );
    }

    @Test
    void adminActionsAndReportResultsPersistForOfflineRecipientsWithPagination() {
        var admin = user("notice_admin", "ADMIN");
        var alice = user("admin_notice_alice", "LEARNER");
        var reporter = user("admin_notice_reporter", "LEARNER");
        var controller = app.getBean(AdminController.class);
        controller.role(auth(admin), alice.id, new AdminController.RoleChange("TEACHER"));
        controller.lock(auth(admin), alice.id, new AdminController.LockChange(true));
        controller.lock(auth(admin), alice.id, new AdminController.LockChange(false));
        db.update(
            "insert into learner_reports(reporter_id,target_id,context_type,context_id,reason) values(?,?,'CLASS',1,'test')",
            reporter.id,
            alice.id
        );
        long reportId = db.queryForObject("select max(id) from learner_reports", Long.class);
        controller.decide(
            auth(admin),
            reportId,
            new AdminController.Decision("WARN", "Hãy tuân thủ nội quy", "USER")
        );
        assertEquals(4, notifications.inbox(alice.username, null).unreadCount());
        assertTrue(
            notifications
                .inbox(alice.username, null)
                .items()
                .getFirst()
                .message()
                .contains("Hãy tuân thủ nội quy")
        );
        assertEquals(1, notifications.inbox(reporter.username, null).unreadCount());
        assertEquals(0, notifications.inbox(admin.username, null).unreadCount());
        for (int i = 0; i < 23; i++) notifications.adminNotice(
            alice.id,
            "Lời nhắc",
            "Nội dung " + i
        );
        var first = notifications.inbox(alice.username, null);
        var second = notifications.inbox(alice.username, first.nextBeforeId());
        assertEquals(20, first.items().size());
        assertEquals(7, second.items().size());
        assertNull(second.nextBeforeId());
        assertTrue(first.items().getLast().id() > second.items().getFirst().id());
        notifications.readAll(alice.username);
        assertEquals(0, notifications.inbox(alice.username, null).unreadCount());
        assertEquals(1, notifications.inbox(reporter.username, null).unreadCount());
    }

    class Client {

        final HttpClient http = HttpClient.newBuilder()
            .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
            .build();
        String csrf;

        Client(User user) throws Exception {
            csrf = json
                .readTree(call("GET", "/api/v1/auth/csrf", null).body())
                .path("token")
                .asText();
            assertEquals(
                200,
                call(
                    "POST",
                    "/api/v1/auth/login",
                    json.writeValueAsString(
                        Map.of("username", user.username, "password", "testPassword123")
                    )
                ).statusCode()
            );
            csrf = json
                .readTree(call("GET", "/api/v1/auth/csrf", null).body())
                .path("token")
                .asText();
        }

        HttpResponse<String> call(String method, String path, String body) throws Exception {
            var request = HttpRequest.newBuilder(URI.create(base + path)).header(
                "Content-Type",
                "application/json"
            );
            if (csrf != null && !method.equals("GET")) request.header("X-XSRF-TOKEN", csrf);
            return http.send(
                request
                    .method(
                        method,
                        body == null
                            ? HttpRequest.BodyPublishers.noBody()
                            : HttpRequest.BodyPublishers.ofString(body)
                    )
                    .build(),
                HttpResponse.BodyHandlers.ofString()
            );
        }

        WebSocket socket(BlockingQueue<String> events) {
            return http
                .newWebSocketBuilder()
                .buildAsync(
                    URI.create(base.replace("http:", "ws:") + "/api/ws-system"),
                    new WebSocket.Listener() {
                        final StringBuilder buffer = new StringBuilder();

                        public void onOpen(WebSocket socket) {
                            socket.request(1);
                        }

                        public CompletionStage<?> onText(
                            WebSocket socket,
                            CharSequence data,
                            boolean last
                        ) {
                            buffer.append(data);
                            if (last) {
                                events.add(buffer.toString());
                                buffer.setLength(0);
                            }
                            socket.request(1);
                            return null;
                        }
                    }
                )
                .join();
        }
    }

    boolean changed(BlockingQueue<String> events) throws Exception {
        return received(events, "NOTIFICATIONS_CHANGED");
    }

    boolean received(BlockingQueue<String> events, String action) throws Exception {
        long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < end) {
            String message = events.poll(200, TimeUnit.MILLISECONDS);
            if (
                message != null && json.readTree(message).path("action").asText().equals(action)
            ) return true;
        }
        return false;
    }

    @Test
    void realAdminSocketReminderAndDisconnectAreStoredForTheTargetAccount() throws Exception {
        var alice = user("socket_reminder_alice", "LEARNER");
        var admin = user("socket_reminder_admin", "ADMIN");
        var aliceClient = new Client(alice);
        var adminClient = new Client(admin);
        var aliceEvents = new LinkedBlockingQueue<String>();
        var adminEvents = new LinkedBlockingQueue<String>();
        var aliceSocket = aliceClient.socket(aliceEvents);
        var adminSocket = adminClient.socket(adminEvents);
        try {
            var handler = app.getBean(com.grammarquest.websocket.SystemSocketHandler.class);
            var target = handler
                .clientDetails()
                .stream()
                .filter(detail -> detail.userId().equals(alice.id))
                .findFirst()
                .orElseThrow();
            adminSocket
                .sendText(
                    json.writeValueAsString(
                        Map.of(
                            "action",
                            "SYSTEM_REMIND",
                            "requestId",
                            "remind-test",
                            "payload",
                            Map.of("sessionId", target.sessionId(), "message", "Tiếp tục học nhé!")
                        )
                    ),
                    true
                )
                .join();
            assertTrue(received(adminEvents, "SYSTEM_ACTION_RESULT"));
            assertTrue(changed(aliceEvents));
            assertEquals(
                "Tiếp tục học nhé!",
                notifications.inbox(alice.username, null).items().getFirst().message()
            );
            assertEquals(1, notifications.inbox(alice.username, null).unreadCount());
            assertEquals(0, notifications.inbox(admin.username, null).unreadCount());
            adminSocket
                .sendText(
                    json.writeValueAsString(
                        Map.of(
                            "action",
                            "SYSTEM_DISCONNECT",
                            "requestId",
                            "disconnect-test",
                            "payload",
                            Map.of("sessionId", target.sessionId())
                        )
                    ),
                    true
                )
                .join();
            assertTrue(received(adminEvents, "SYSTEM_ACTION_RESULT"));
            assertEquals(2, notifications.inbox(alice.username, null).unreadCount());
            assertEquals(
                "Kết nối đã bị ngắt",
                notifications.inbox(alice.username, null).items().getFirst().title()
            );
        } finally {
            aliceSocket.abort();
            adminSocket.abort();
        }
    }

    @Test
    void realHttpAndSocketsSynchronizeReadStateAcrossTabsAndRejectOtherAccounts() throws Exception {
        var alice = user("http_notice_alice", "LEARNER");
        var bob = user("http_notice_bob", "LEARNER");
        var a = new Client(alice);
        var b = new Client(bob);
        var events1 = new LinkedBlockingQueue<String>();
        var events2 = new LinkedBlockingQueue<String>();
        var socket1 = a.socket(events1);
        var socket2 = a.socket(events2);
        try {
            notifications.adminNotice(alice.id, "Lời nhắc từ quản trị viên", "Tiếp tục học nhé!");
            assertTrue(changed(events1));
            assertTrue(changed(events2));
            var snapshot = json.readTree(a.call("GET", "/api/v1/notifications", null).body());
            long id = snapshot.path("items").get(0).path("id").asLong();
            assertEquals(1, snapshot.path("unreadCount").asInt());
            assertEquals(
                404,
                b.call("PATCH", "/api/v1/notifications/" + id + "/read", null).statusCode()
            );
            assertEquals(
                200,
                a.call("PATCH", "/api/v1/notifications/" + id + "/read", null).statusCode()
            );
            assertTrue(changed(events2));
            assertEquals(
                0,
                json
                    .readTree(a.call("GET", "/api/v1/notifications", null).body())
                    .path("unreadCount")
                    .asInt()
            );
            assertEquals(
                0,
                json
                    .readTree(b.call("GET", "/api/v1/notifications", null).body())
                    .path("items")
                    .size()
            );
            var anonymous = HttpClient.newHttpClient().send(
                HttpRequest.newBuilder(URI.create(base + "/api/v1/notifications")).build(),
                HttpResponse.BodyHandlers.ofString()
            );
            assertEquals(401, anonymous.statusCode());
        } finally {
            socket1.abort();
            socket2.abort();
        }
    }
}
