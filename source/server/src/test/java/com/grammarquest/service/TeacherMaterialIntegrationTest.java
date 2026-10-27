package com.grammarquest.service;

import static org.junit.jupiter.api.Assertions.*;

import com.grammarquest.GrammarQuestApplication;
import com.grammarquest.controller.ArenaController;
import com.grammarquest.controller.ClassroomController;
import com.grammarquest.controller.TeacherMaterialController;
import com.grammarquest.entity.User;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import java.sql.DriverManager;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

/** Real Flyway/MySQL in a fresh disposable schema; no application database is changed. */
@EnabledIfEnvironmentVariable(named = "RUN_MATERIAL_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class TeacherMaterialIntegrationTest {

    final String schema =
        "grammar_quest_material_" +
        UUID.randomUUID().toString().replace("-", "").substring(0, 12) +
        "_test";
    String dbUser, dbPassword;
    ServletWebServerApplicationContext app;

    @BeforeAll
    void boot() throws Exception {
        dbUser = Objects.requireNonNull(System.getenv("DB_USERNAME"));
        dbPassword = Objects.requireNonNull(System.getenv("DB_PASSWORD"));
        assertTrue(schema.matches("grammar_quest_material_[0-9a-f]{12}_test"));
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
            "--spring.datasource.url=jdbc:mysql://127.0.0.1:3306/" + schema,
            "--spring.datasource.username=" + dbUser,
            "--spring.datasource.password=" + dbPassword,
            "--app.seed-demo=false",
            "--spring.main.banner-mode=off",
            "--debug=false",
            "--logging.level.root=WARN"
        );
    }

    @AfterAll
    void cleanup() throws Exception {
        if (app != null) app.close();
        if (dbUser != null && schema.matches("grammar_quest_material_[0-9a-f]{12}_test")) try (
            var c = DriverManager.getConnection("jdbc:mysql://127.0.0.1:3306/", dbUser, dbPassword);
            var s = c.createStatement()
        ) {
            s.executeUpdate("DROP DATABASE IF EXISTS `" + schema + "`");
        }
    }

    @Test
    void roadmapReviewsUseUnlockedContentAndUpdateDailyQuestsOnlyOnce() throws Exception {
        var users = app.getBean(UserRepository.class);
        var db = app.getBean(JdbcTemplate.class);
        var course = app.getBean(RoadmapCourseService.class);
        var json = app.getBean(com.fasterxml.jackson.databind.ObjectMapper.class);
        var learner = users.save(new User("practice_roadmap", "Practice Learner", "hash"));
        db.update(
            "insert into user_daily_quests(user_id,quest_id,quest_date) select ?,id,current_date from daily_quests where code in ('PRACTICE_1','CORRECT_15','PERFECT_PRACTICE_1')",
            learner.id
        );
        var input = json
            .createObjectNode()
            .put("kind", "MODULE_REVIEW")
            .put("referenceId", "l1-m1")
            .put("requestKey", UUID.randomUUID().toString());
        var attempt = json.valueToTree(course.action(learner.username, "ROADMAP_START", input));
        long id = attempt.path("id").asLong();
        assertEquals(9, attempt.path("totalQuestions").asInt());
        for (var question : attempt.path("questions")) {
            assertFalse(question.has("correctOption"));
            assertFalse(question.has("explanation"));
        }
        var questions = json.readTree(
            db.queryForObject(
                "select questions_json from study_attempts where id=?",
                String.class,
                id
            )
        );
        var answers = json.createObjectNode();
        for (var question : questions)
            answers.put(question.path("id").asText(), question.path("correctOption").asText());
        var submit = json.createObjectNode().put("attemptId", id);
        submit.set("answers", answers);
        course.action(learner.username, "ROADMAP_SUBMIT", submit);
        assertEquals(
            9,
            db.queryForObject(
                "select current_progress from user_daily_quests u join daily_quests q on q.id=u.quest_id where u.user_id=? and q.code='CORRECT_15'",
                Integer.class,
                learner.id
            )
        );
        assertEquals(
            1,
            db.queryForObject(
                "select current_progress from user_daily_quests u join daily_quests q on q.id=u.quest_id where u.user_id=? and q.code='PRACTICE_1'",
                Integer.class,
                learner.id
            )
        );
        course.action(learner.username, "ROADMAP_SUBMIT", submit);
        assertEquals(
            9,
            db.queryForObject(
                "select current_progress from user_daily_quests u join daily_quests q on q.id=u.quest_id where u.user_id=? and q.code='CORRECT_15'",
                Integer.class,
                learner.id
            )
        );
        assertEquals(
            0,
            db.queryForObject(
                "select count(*) from study_progress where user_id=?",
                Integer.class,
                learner.id
            )
        );
        input.put("referenceId", "l1-m2").put("requestKey", UUID.randomUUID().toString());
        assertThrows(ApiException.class, () ->
            course.action(learner.username, "ROADMAP_START", input)
        );
        input
            .put("kind", "LEVEL_REVIEW")
            .put("referenceId", "2")
            .put("requestKey", UUID.randomUUID().toString());
        assertThrows(ApiException.class, () ->
            course.action(learner.username, "ROADMAP_START", input)
        );
        db.update(
            "insert into study_progress(user_id,lesson_id,completed_at) select ?,id,current_timestamp(6) from study_lessons where module_id='l1-m1'",
            learner.id
        );
        input.put("referenceId", "1").put("requestKey", UUID.randomUUID().toString());
        var mixed = json.valueToTree(course.action(learner.username, "ROADMAP_START", input));
        long mixedId = mixed.path("id").asLong();
        assertEquals(10, mixed.path("totalQuestions").asInt());
        questions = json.readTree(
            db.queryForObject(
                "select questions_json from study_attempts where id=?",
                String.class,
                mixedId
            )
        );
        var correctAnswers = json.createObjectNode();
        for (var question : questions) {
            var module = db.queryForObject(
                "select module_id from study_lessons where id=?",
                String.class,
                question.path("lessonId").asText()
            );
            assertTrue(Set.of("l1-m1", "l1-m2").contains(module));
            correctAnswers.put(
                question.path("id").asText(),
                question.path("correctOption").asText()
            );
        }
        var mixedSubmit = json.createObjectNode().put("attemptId", mixedId);
        mixedSubmit.set("answers", correctAnswers);
        course.action(learner.username, "ROADMAP_SUBMIT", mixedSubmit);
        assertEquals(
            1,
            db.queryForObject(
                "select current_progress from user_daily_quests u join daily_quests q on q.id=u.quest_id where u.user_id=? and q.code='PERFECT_PRACTICE_1'",
                Integer.class,
                learner.id
            )
        );
        assertEquals(0, users.findById(learner.id).orElseThrow().totalXp);
    }

    @Test
    void retiredClassroomQuestIsReplacedAndDoesNotBlockDailyChest() {
        var users = app.getBean(UserRepository.class);
        var db = app.getBean(JdbcTemplate.class);
        var quests = app.getBean(DailyQuestService.class);
        var learner = users.save(new User("quest_retirement", "Quest Learner", "hash"));
        int classroomId = db.queryForObject(
            "select id from daily_quests where code='CLASS_ASSIGNMENT_1'",
            Integer.class
        );
        assertEquals(
            0,
            db.queryForObject(
                "select count(*) from daily_quests where active=true and category='CLASSROOM'",
                Integer.class
            )
        );
        db.update(
            "insert into user_daily_quests(user_id,quest_id,quest_date) values(?,?,current_date)",
            learner.id,
            classroomId
        );
        var overview = quests.getOverview(learner.username);
        assertEquals(3, overview.quests().size());
        assertTrue(
            overview
                .quests()
                .stream()
                .noneMatch(quest -> "CLASSROOM".equals(quest.category()))
        );
        assertEquals(
            Set.of("EASY", "MEDIUM", "HARD"),
            new HashSet<>(
                overview.quests().stream().map(DailyQuestService.QuestView::tier).toList()
            )
        );
        for (var quest : overview.quests())
            db.update(
                "update user_daily_quests set current_progress=?,completed=true where id=?",
                quest.targetCount(),
                quest.id()
            );
        assertTrue(quests.claimDailyMilestone(learner.username).milestone().claimed());
        assertEquals(
            1,
            db.queryForObject(
                "select count(*) from user_daily_quests where user_id=? and quest_id=?",
                Integer.class,
                learner.id,
                classroomId
            )
        );
    }

    @Test
    void pvpCatalogIncludesLockedItemsAndAllowsEquippingUnlockedFrames() {
        var users = app.getBean(UserRepository.class);
        var arena = app.getBean(ArenaController.class);
        var learner = users.save(new User("cosmetic_learner", "Cosmetic Learner", "hash"));
        var auth = new UsernamePasswordAuthenticationToken(learner.username, "n/a");
        var response = arena.cosmetics(auth);
        @SuppressWarnings("unchecked")
        var items = (List<Map<String, Object>>) response.get("items");
        assertEquals(
            8,
            items
                .stream()
                .filter(item -> "FRAME".equals(item.get("type")))
                .count()
        );
        assertEquals(
            10,
            items
                .stream()
                .filter(item -> "BADGE".equals(item.get("type")))
                .count()
        );
        assertTrue(
            items
                .stream()
                .anyMatch(
                    item ->
                        "FRAME_DEFAULT".equals(item.get("code")) &&
                        Boolean.TRUE.equals(item.get("unlocked"))
                )
        );
        assertTrue(
            items
                .stream()
                .anyMatch(
                    item ->
                        "FRAME_GOLD".equals(item.get("code")) &&
                        Boolean.FALSE.equals(item.get("unlocked"))
                )
        );
        assertEquals(
            "FRAME_DEFAULT",
            arena
                .equipCosmetic(auth, new ArenaController.EquipCosmetic("FRAME_DEFAULT"))
                .get("equippedFrame")
        );
        assertThrows(ApiException.class, () ->
            arena.equipCosmetic(auth, new ArenaController.EquipCosmetic("FRAME_GOLD"))
        );
    }

    @Test
    void teacherCreatesOwnContentAndReusesItWithoutRoadmapOrChangingPublishedAssignments() {
        var users = app.getBean(UserRepository.class);
        var db = app.getBean(JdbcTemplate.class);
        var materials = app.getBean(TeacherMaterialController.class);
        var classes = app.getBean(ClassroomController.class);
        User teacher = new User("material_owner", "Teacher", "hash");
        teacher.role = "TEACHER";
        users.save(teacher);
        User other = new User("material_other", "Other teacher", "hash");
        other.role = "TEACHER";
        users.save(other);
        User learner = new User("material_learner", "Learner", "hash");
        users.save(learner);
        var ownerAuth = new UsernamePasswordAuthenticationToken(teacher.username, "n/a");
        var otherAuth = new UsernamePasswordAuthenticationToken(other.username, "n/a");
        var learnerAuth = new UsernamePasswordAuthenticationToken(learner.username, "n/a");
        assertTrue(materials.list(ownerAuth).isEmpty(), "No material is seeded for a new teacher");
        int roadmapLessons = db.queryForObject("select count(*) from lessons", Integer.class);
        var first = new TeacherMaterialController.Draft(
            "She ___ to school.",
            "go",
            "goes",
            "going",
            "gone",
            "B",
            "Third person singular.",
            "MCQ",
            null
        );
        var second = new TeacherMaterialController.Draft(
            "They have lived here ___ 2020.",
            "",
            "",
            "",
            "",
            "A",
            "Since precedes a year.",
            "FILL_BLANK",
            "since"
        );
        var created = materials.create(
            ownerAuth,
            new TeacherMaterialController.Body(
                "Teacher's Unit 1",
                "Own uploaded content",
                List.of(first, second)
            )
        );
        long materialId = ((Number) created.get("id")).longValue();
        assertEquals(2, ((Number) created.get("questionCount")).intValue());
        assertEquals(
            roadmapLessons,
            db.queryForObject("select count(*) from lessons", Integer.class)
        );
        assertEquals(
            2,
            db.queryForObject(
                "select count(*) from questions where material_id=? and lesson_id is null",
                Integer.class,
                materialId
            )
        );
        assertTrue(materials.list(otherAuth).isEmpty());
        assertThrows(ApiException.class, () -> materials.detail(otherAuth, materialId));
        var classA = classes.create(
            ownerAuth,
            new ClassroomController.NewClass("Material class A")
        );
        var classB = classes.create(
            ownerAuth,
            new ClassroomController.NewClass("Material class B")
        );
        long a = ((Number) classA.get("id")).longValue(),
            b = ((Number) classB.get("id")).longValue();
        Instant due = Instant.now().plusSeconds(86400);
        var assignmentA = classes.assign(
            ownerAuth,
            a,
            new ClassroomController.NewAssignment(
                "Homework A",
                null,
                "Read carefully",
                80,
                due,
                null,
                materialId
            )
        );
        var assignmentB = classes.assign(
            ownerAuth,
            b,
            new ClassroomController.NewAssignment(
                "Homework B",
                null,
                "",
                80,
                due.plusSeconds(3600),
                null,
                materialId
            )
        );
        long assignmentId = ((Number) assignmentA.get("id")).longValue();
        assertNotEquals(assignmentId, ((Number) assignmentB.get("id")).longValue());
        assertNull(assignmentA.get("lessonId"));
        String snapshot = db.queryForObject(
            "select question_snapshot_json from assignments where id=?",
            String.class,
            assignmentId
        );
        materials.update(
            ownerAuth,
            materialId,
            new TeacherMaterialController.Body("Updated title", "", List.of(second))
        );
        assertEquals(
            snapshot,
            db.queryForObject(
                "select question_snapshot_json from assignments where id=?",
                String.class,
                assignmentId
            )
        );
        classes.join(learnerAuth, new ClassroomController.Join(classA.get("joinCode").toString()));
        var attempt = classes.start(learnerAuth, a, assignmentId);
        assertNull(attempt.lessonId());
        assertEquals(2, attempt.totalQuestions());
        assertEquals(first.prompt(), attempt.questions().getFirst().prompt());
        assertNull(attempt.questions().getFirst().correctOption());
        var exam = materials.exam(
            ownerAuth,
            materialId,
            new TeacherMaterialController.ExamInput(b, "Unit test", due)
        );
        assertEquals(1, ((Number) exam.get("questionsCount")).intValue());
        materials.archive(ownerAuth, materialId, Map.of("archived", true));
        assertThrows(ApiException.class, () ->
            classes.assign(
                ownerAuth,
                a,
                new ClassroomController.NewAssignment(
                    "Archived",
                    null,
                    "",
                    80,
                    due,
                    null,
                    materialId
                )
            )
        );
        assertThrows(ApiException.class, () ->
            materials.exam(
                ownerAuth,
                materialId,
                new TeacherMaterialController.ExamInput(a, "Archived", due)
            )
        );
    }
}
