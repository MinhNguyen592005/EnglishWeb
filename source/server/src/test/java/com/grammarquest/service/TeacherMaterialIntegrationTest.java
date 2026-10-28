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
    void learnerExamSubmitsLatestDraftPrivatelyAndRespectsVersionAndDeadline() throws Exception {
        var users = app.getBean(UserRepository.class);
        var db = app.getBean(JdbcTemplate.class);
        var classes = app.getBean(ClassroomController.class);
        var exams = app.getBean(LiveExamService.class);
        var json = app.getBean(com.fasterxml.jackson.databind.ObjectMapper.class);
        var teacher = new User("exam_flow_teacher", "Teacher", "hash");
        teacher.role = "TEACHER";
        users.save(teacher);
        var alice = users.save(new User("exam_flow_alice", "Alice", "hash"));
        var bob = users.save(new User("exam_flow_bob", "Bob", "hash"));
        var outsider = users.save(new User("exam_flow_outsider", "Outsider", "hash"));
        var teacherAuth = new UsernamePasswordAuthenticationToken(teacher.username, "n/a");
        var classroom = classes.create(teacherAuth, new ClassroomController.NewClass("Exam flow"));
        long classId = ((Number) classroom.get("id")).longValue();
        for (var learner : List.of(alice, bob))
            classes.join(
                new UsernamePasswordAuthenticationToken(learner.username, "n/a"),
                new ClassroomController.Join(classroom.get("joinCode").toString())
            );
        var qs = json.createArrayNode();
        for (int index = 0; index < 12; index++) {
            var q = qs
                .addObject()
                .put("id", "q" + index)
                .put("prompt", "Question " + index);
            if (index == 1 || index == 11) q.put("questionType", "FILL_BLANK").put(
                "acceptedAnswer",
                "since"
            );
            else {
                q.put("questionType", "MCQ").put("correct", 1);
                q.putArray("options").add("A").add("B").add("C").add("D");
            }
        }
        var input = json
            .createObjectNode()
            .put("classId", classId)
            .put("title", "Mixed exam")
            .put("endsAt", Instant.now().plusSeconds(3600).toString());
        input.set("questions", qs);
        var created = json.valueToTree(exams.action(teacher.username, "EXAM_CREATE", input));
        long id = created.path("id").asLong();
        var open = json.createObjectNode().put("examId", id);
        assertThrows(ApiException.class, () -> exams.action(outsider.username, "EXAM_OPEN", open));
        var aliceView = json.valueToTree(exams.action(alice.username, "EXAM_OPEN", open));
        assertFalse(aliceView.has("ranking"));
        assertFalse(aliceView.has("correctCount"));
        for (var q : aliceView.path("questions")) {
            assertFalse(q.has("correct"));
            assertFalse(q.has("acceptedAnswer"));
        }
        var answer = json
            .createObjectNode()
            .put("examId", id)
            .put("version", 1)
            .put("questionId", "q0")
            .put("option", 0);
        exams.action(alice.username, "EXAM_ANSWER", answer);
        assertThrows(ApiException.class, () ->
            exams.action(teacher.username, "EXAM_ANSWER", answer)
        );
        answer.put("version", 0);
        assertThrows(ApiException.class, () -> exams.action(alice.username, "EXAM_ANSWER", answer));
        var submit = json.createObjectNode().put("examId", id).put("version", 1);
        submit.set(
            "answers",
            json.createObjectNode().put("q0", 1).put("q1", " Since! ").put("q11", "since")
        );
        var submitted = json.valueToTree(exams.action(alice.username, "EXAM_SUBMIT", submit));
        assertTrue(submitted.path("submitted").asBoolean());
        assertEquals(1, submitted.path("answers").path("q0").asInt());
        assertEquals("Since!", submitted.path("answers").path("q1").asText());
        assertFalse(submitted.has("correctCount"));
        var bobView = json.valueToTree(exams.action(bob.username, "EXAM_OPEN", open));
        assertEquals(0, bobView.path("answers").size());
        var bad = json.createObjectNode().put("examId", id).put("version", 1);
        bad.set("answers", json.createObjectNode().put("unknown", 0));
        assertThrows(ApiException.class, () -> exams.action(bob.username, "EXAM_SUBMIT", bad));
        assertFalse(json.valueToTree(exams.view(bob.username, id)).path("submitted").asBoolean());
        var ranking = json.valueToTree(exams.view(teacher.username, id)).path("ranking");
        assertEquals(3, ranking.get(0).path("correctCount").asInt());
        var list = json.valueToTree(
            exams.action(
                alice.username,
                "EXAM_LIST",
                json.createObjectNode().put("classId", classId)
            )
        );
        assertTrue(list.get(0).path("submitted").asBoolean());
        assertFalse(list.get(0).has("correctCount"));
        db.update(
            "update class_exams set ends_at=? where id=?",
            java.sql.Timestamp.from(Instant.now().minusSeconds(5)),
            id
        );
        assertThrows(ApiException.class, () -> exams.action(bob.username, "EXAM_SUBMIT", submit));
        var closed = json.valueToTree(exams.view(alice.username, id));
        assertTrue(closed.path("closed").asBoolean());
        assertEquals(3, closed.path("correctCount").asInt());
        assertEquals(0, closed.path("questions").size());
        assertEquals(0, closed.path("answers").size());
        assertThrows(ApiException.class, () -> exams.action(alice.username, "EXAM_OPEN", open));
        assertThrows(ApiException.class, () -> exams.action(alice.username, "EXAM_SYNC", open));
        assertEquals(
            12,
            json
                .valueToTree(exams.action(teacher.username, "EXAM_OPEN", open))
                .path("questions")
                .size()
        );
        db.update("delete from class_members where class_id=? and user_id=?", classId, alice.id);
        assertThrows(ApiException.class, () -> exams.view(alice.username, id));
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
        assertEquals(a, attempt.classId());
        assertEquals(
            a,
            app.getBean(LearningService.class).get(learner.username, attempt.id()).classId()
        );
        assertNull(attempt.lessonId());
        assertEquals(2, attempt.totalQuestions());
        assertEquals(first.prompt(), attempt.questions().getFirst().prompt());
        assertNull(attempt.questions().getFirst().correctOption());
        // Learners can start/resume their own work, without teacher-grade permissions.
        assertEquals(attempt.id(), classes.start(learnerAuth, a, assignmentId).id());
        assertThrows(ApiException.class, () -> classes.results(learnerAuth, a, assignmentId));
        var ownWork = classes.myResults(learnerAuth, a);
        assertEquals(1, ownWork.size());
        assertEquals(
            attempt.id().longValue(),
            ((Number) ownWork.getFirst().get("attemptId")).longValue()
        );
        assertEquals(
            learner.id.longValue(),
            ((Number) ownWork.getFirst().get("userId")).longValue()
        );
        assertEquals(assignmentId, ((Number) ownWork.getFirst().get("assignmentId")).longValue());
        assertNotNull(ownWork.getFirst().get("submitDeadlineAt"));
        User classmate = users.save(new User("material_classmate", "Classmate", "hash"));
        var classmateAuth = new UsernamePasswordAuthenticationToken(classmate.username, "n/a");
        assertThrows(ApiException.class, () -> classes.start(classmateAuth, a, assignmentId));
        assertThrows(ApiException.class, () -> classes.myResults(classmateAuth, a));
        classes.join(
            classmateAuth,
            new ClassroomController.Join(classA.get("joinCode").toString())
        );
        assertTrue(classes.myResults(classmateAuth, a).isEmpty());
        var classmatesAttempt = classes.start(classmateAuth, a, assignmentId);
        assertNotEquals(attempt.id(), classmatesAttempt.id());
        assertEquals(1, classes.myResults(learnerAuth, a).size());
        var learning = app.getBean(LearningService.class);
        assertThrows(ApiException.class, () -> learning.get(classmate.username, attempt.id()));
        var feedback = learning.answer(learner.username, attempt.id(), 1, "A");
        assertNull(feedback.correctOption());
        assertNull(feedback.explanation());
        learning.answer(learner.username, attempt.id(), 2, "wrong");
        var failed = learning.get(learner.username, attempt.id());
        assertEquals("LOST", failed.status());
        assertTrue(
            failed
                .questions()
                .stream()
                .allMatch(q -> q.correctOption() == null && q.explanation() == null)
        );
        var successful = classes.start(learnerAuth, a, assignmentId);
        learning.answer(learner.username, successful.id(), 1, "B");
        assertNull(
            learning.get(learner.username, successful.id()).questions().getFirst().correctOption()
        );
        var passedAnswer = learning.answer(learner.username, successful.id(), 2, "since");
        assertNotNull(passedAnswer.correctOption());
        assertTrue(
            learning
                .get(learner.username, attempt.id())
                .questions()
                .stream()
                .allMatch(q -> q.correctOption() != null)
        );
        var ownGrade = classes.myResults(learnerAuth, a).getFirst();
        assertEquals(2, ((Number) ownGrade.get("correctCount")).intValue());
        assertEquals("WON", ownGrade.get("status"));
        var retry = classes.start(learnerAuth, a, assignmentId);
        var duringRetry = classes.myResults(learnerAuth, a).getFirst();
        assertEquals(true, duringRetry.get("passed"));
        assertEquals("IN_PROGRESS", duringRetry.get("status"));
        learning.answer(learner.username, retry.id(), 1, "A");
        learning.answer(learner.username, retry.id(), 2, "wrong");
        var retried = classes.myResults(learnerAuth, a).getFirst();
        var json = app.getBean(com.fasterxml.jackson.databind.ObjectMapper.class);
        var summary = json.valueToTree(retried);
        assertTrue(summary.path("passed").asBoolean());
        assertEquals(3, summary.path("attemptCount").asInt());
        assertEquals(0, summary.path("firstAttempt").path("correctCount").asInt());
        assertEquals(0, summary.path("latestAttempt").path("correctCount").asInt());
        assertEquals(2, summary.path("bestAttempt").path("correctCount").asInt());
        assertEquals(3, summary.path("history").size());
        assertNotNull(retried.get("firstPassedAt"));
        var teacherGrade = json.valueToTree(classes.results(ownerAuth, a, assignmentId)).get(0);
        // Find the learner rather than relying on display-name sorting.
        for (var grade : json.valueToTree(classes.results(ownerAuth, a, assignmentId))) {
            if (grade.path("userId").asLong() == learner.id) teacherGrade = grade;
        }
        assertEquals(2, teacherGrade.path("correctCount").asInt());
        assertTrue(teacherGrade.path("passed").asBoolean());
        assertEquals(
            100.0,
            ((Number) classes.overview(ownerAuth, a).get("averageScore")).doubleValue()
        );
        db.update(
            "update attempts set completed_at=? where id=?",
            java.sql.Timestamp.from(due.plusSeconds(1)),
            successful.id()
        );
        var late = json.valueToTree(classes.myResults(learnerAuth, a)).get(0);
        assertFalse(late.path("passed").asBoolean());
        assertEquals(0, late.path("bestAttempt").path("correctCount").asInt());
        assertEquals(
            0.0,
            ((Number) classes.overview(ownerAuth, a).get("averageScore")).doubleValue()
        );
        assertNull(
            learning.get(learner.username, retry.id()).questions().getFirst().correctOption()
        );
        assertEquals(2, classes.results(ownerAuth, a, assignmentId).size());
        db.update("delete from class_members where class_id=? and user_id=?", a, classmate.id);
        assertThrows(ApiException.class, () -> classes.myResults(classmateAuth, a));
        assertThrows(ApiException.class, () -> classes.start(classmateAuth, a, assignmentId));
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
