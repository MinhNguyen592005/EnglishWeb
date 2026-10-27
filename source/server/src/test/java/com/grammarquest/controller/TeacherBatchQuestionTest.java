package com.grammarquest.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.grammarquest.entity.User;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.security.core.Authentication;

class TeacherBatchQuestionTest {

    @Test
    void nonTeacherCannotAccessBatchCreation() {
        var db = mock(JdbcTemplate.class);
        var users = mock(UserRepository.class);
        var auth = mock(Authentication.class);
        when(auth.getName()).thenReturn("learner");
        var learner = new User("learner", "Learner", "pass");
        learner.role = "LEARNER";
        when(users.findByUsernameIgnoreCase("learner")).thenReturn(Optional.of(learner));

        var controller = new TeacherQuestionController(db, users);
        var batch = new TeacherQuestionController.BatchBody(
            1L,
            List.of(
                new TeacherQuestionController.BatchItem(
                    "Prompt 1",
                    "A",
                    "B",
                    "C",
                    "D",
                    "A",
                    "Expl 1",
                    "MCQ",
                    null
                )
            )
        );

        ApiException ex = assertThrows(ApiException.class, () ->
            controller.createBatch(auth, batch)
        );
        assertEquals("TEACHER_ONLY", ex.code);
    }

    @Test
    void batchFailsIfLessonNotFound() {
        var db = mock(JdbcTemplate.class);
        var users = mock(UserRepository.class);
        var auth = mock(Authentication.class);
        when(auth.getName()).thenReturn("teacher");
        var teacher = new User("teacher", "Teacher", "pass");
        teacher.role = "TEACHER";
        when(users.findByUsernameIgnoreCase("teacher")).thenReturn(Optional.of(teacher));
        when(
            db.queryForObject(
                "select count(*) from lessons where id=? and published=true",
                Integer.class,
                99L
            )
        ).thenReturn(0);

        var controller = new TeacherQuestionController(db, users);
        var batch = new TeacherQuestionController.BatchBody(
            99L,
            List.of(
                new TeacherQuestionController.BatchItem(
                    "Prompt 1",
                    "A",
                    "B",
                    "C",
                    "D",
                    "A",
                    "Expl 1",
                    "MCQ",
                    null
                )
            )
        );

        ApiException ex = assertThrows(ApiException.class, () ->
            controller.createBatch(auth, batch)
        );
        assertEquals("LESSON_NOT_FOUND", ex.code);
    }

    @Test
    void batchValidatesOptionsAndProvidesQuestionNumberInError() {
        var db = mock(JdbcTemplate.class);
        var users = mock(UserRepository.class);
        var auth = mock(Authentication.class);
        when(auth.getName()).thenReturn("teacher");
        var teacher = new User("teacher", "Teacher", "pass");
        teacher.role = "TEACHER";
        when(users.findByUsernameIgnoreCase("teacher")).thenReturn(Optional.of(teacher));
        when(
            db.queryForObject(
                "select count(*) from lessons where id=? and published=true",
                Integer.class,
                1L
            )
        ).thenReturn(1);

        var controller = new TeacherQuestionController(db, users);
        var batch = new TeacherQuestionController.BatchBody(
            1L,
            List.of(
                new TeacherQuestionController.BatchItem(
                    "Prompt 1",
                    "A",
                    "B",
                    "C",
                    "D",
                    "A",
                    "Expl 1",
                    "MCQ",
                    null
                ),
                new TeacherQuestionController.BatchItem(
                    "Prompt 2",
                    "A",
                    "B",
                    "C",
                    "",
                    "A",
                    "Expl 2",
                    "MCQ",
                    null
                )
            )
        );

        doAnswer(invocation -> {
            KeyHolder kh = invocation.getArgument(1);
            Map<String, Object> keys = new HashMap<>();
            keys.put("GENERATED_KEY", 101L);
            kh.getKeyList().add(keys);
            return 1;
        })
            .when(db)
            .update(any(PreparedStatementCreator.class), any(KeyHolder.class));

        when(db.queryForMap(anyString(), anyLong())).thenReturn(Map.of("id", 101L));

        ApiException ex = assertThrows(ApiException.class, () ->
            controller.createBatch(auth, batch)
        );
        assertEquals("INVALID_BATCH_ITEM", ex.code);
        assertTrue(ex.getMessage().contains("Câu số 2"));
    }

    @Test
    void batchCreatesFillBlankErrorCorrectionAndRewriteSuccessfully() {
        var db = mock(JdbcTemplate.class);
        var users = mock(UserRepository.class);
        var auth = mock(Authentication.class);
        when(auth.getName()).thenReturn("teacher");
        var teacher = new User("teacher", "Teacher", "pass");
        teacher.role = "TEACHER";
        when(users.findByUsernameIgnoreCase("teacher")).thenReturn(Optional.of(teacher));
        when(
            db.queryForObject(
                "select count(*) from lessons where id=? and published=true",
                Integer.class,
                1L
            )
        ).thenReturn(1);

        var controller = new TeacherQuestionController(db, users);
        var batch = new TeacherQuestionController.BatchBody(
            1L,
            List.of(
                new TeacherQuestionController.BatchItem(
                    "She ___ to school",
                    "",
                    "",
                    "",
                    "",
                    "A",
                    "Giải thích",
                    "FILL_BLANK",
                    "goes"
                ),
                new TeacherQuestionController.BatchItem(
                    "She go to school",
                    "",
                    "",
                    "",
                    "",
                    "A",
                    "Giải thích",
                    "ERROR_CORRECTION",
                    "went"
                ),
                new TeacherQuestionController.BatchItem(
                    "It started raining 2 hours ago",
                    "",
                    "",
                    "",
                    "",
                    "A",
                    "Giải thích",
                    "REWRITE",
                    "It has been raining for 2 hours"
                )
            )
        );

        doAnswer(invocation -> {
            KeyHolder kh = invocation.getArgument(1);
            Map<String, Object> keys = new HashMap<>();
            keys.put("GENERATED_KEY", 101L);
            kh.getKeyList().add(keys);
            return 1;
        })
            .when(db)
            .update(any(PreparedStatementCreator.class), any(KeyHolder.class));

        when(db.queryForMap(anyString(), anyLong())).thenReturn(
            Map.of("id", 101L, "prompt", "Test")
        );

        var result = controller.createBatch(auth, batch);
        assertEquals(3, result.get("createdCount"));
    }

    @Test
    void curriculumBatchValidatesCorrectOption() {
        var db = mock(JdbcTemplate.class);
        var users = mock(UserRepository.class);
        var auth = mock(Authentication.class);
        when(auth.getName()).thenReturn("teacher");
        var teacher = new User("teacher", "Teacher", "pass");
        teacher.role = "TEACHER";
        when(users.findByUsernameIgnoreCase("teacher")).thenReturn(Optional.of(teacher));
        when(
            db.queryForObject(
                "select count(*) from lessons where id=? and deleted=false",
                Integer.class,
                1L
            )
        ).thenReturn(1);

        var controller = new TeacherCurriculumController(db, users);
        var batch = new TeacherCurriculumController.BatchQuestionInput(
            1L,
            List.of(
                new TeacherCurriculumController.QuestionItemInput(
                    "Prompt 1",
                    "A",
                    "B",
                    "C",
                    "D",
                    "X",
                    "Expl 1"
                )
            )
        );

        ApiException ex = assertThrows(ApiException.class, () ->
            controller.createQuestionsBatch(auth, batch)
        );
        assertEquals("INVALID_CORRECT_OPTION", ex.code);
        assertTrue(ex.getMessage().contains("Câu số 1"));
    }

    @Test
    void promoteCommonClonesTeacherQuestionToCurriculum() {
        var db = mock(JdbcTemplate.class);
        var users = mock(UserRepository.class);
        var auth = mock(Authentication.class);
        when(auth.getName()).thenReturn("teacher");
        var teacher = new User("teacher", "Teacher", "pass");
        teacher.id = 5L;
        teacher.role = "TEACHER";
        when(users.findByUsernameIgnoreCase("teacher")).thenReturn(Optional.of(teacher));

        when(
            db.queryForList(
                eq("select * from questions where id=? and owner_id=? and deleted=false"),
                eq(10L),
                eq(5L)
            )
        ).thenReturn(
            List.of(
                Map.of(
                    "id",
                    10L,
                    "lesson_id",
                    1L,
                    "prompt",
                    "Question in bank",
                    "option_a",
                    "A",
                    "option_b",
                    "B",
                    "option_c",
                    "C",
                    "option_d",
                    "D",
                    "correct_option",
                    "B",
                    "explanation",
                    "Expl",
                    "question_type",
                    "MCQ"
                )
            )
        );

        doAnswer(invocation -> {
            KeyHolder kh = invocation.getArgument(1);
            Map<String, Object> keys = new HashMap<>();
            keys.put("GENERATED_KEY", 200L);
            kh.getKeyList().add(keys);
            return 1;
        })
            .when(db)
            .update(any(PreparedStatementCreator.class), any(KeyHolder.class));

        var controller = new TeacherQuestionController(db, users);
        var res = controller.promoteCommon(
            auth,
            new TeacherQuestionController.PromoteInput(List.of(10L))
        );
        assertEquals(1, res.get("promotedCount"));
        verify(db).update(
            eq(
                "insert into audit_logs(actor_id,action,target_type,target_id,detail) values(?,?,?,?,?)"
            ),
            eq(5L),
            eq("QUESTION_CREATE"),
            eq("QUESTION"),
            eq(200L),
            eq("Question in bank")
        );
    }

    @Test
    void toLiveExamCreatesClassExamFromSelectedQuestions() {
        var db = mock(JdbcTemplate.class);
        var users = mock(UserRepository.class);
        var auth = mock(Authentication.class);
        when(auth.getName()).thenReturn("teacher");
        var teacher = new User("teacher", "Teacher", "pass");
        teacher.id = 5L;
        teacher.role = "TEACHER";
        when(users.findByUsernameIgnoreCase("teacher")).thenReturn(Optional.of(teacher));

        when(
            db.queryForList("select teacher_id from classrooms where id=?", Long.class, 12L)
        ).thenReturn(List.of(5L));

        when(
            db.queryForList(
                eq("select * from questions where id=? and owner_id=? and deleted=false"),
                eq(10L),
                eq(5L)
            )
        ).thenReturn(
            List.of(
                Map.of(
                    "id",
                    10L,
                    "prompt",
                    "Question for exam",
                    "option_a",
                    "opt 1",
                    "option_b",
                    "opt 2",
                    "option_c",
                    "opt 3",
                    "option_d",
                    "opt 4",
                    "correct_option",
                    "C"
                )
            )
        );

        doAnswer(invocation -> {
            KeyHolder kh = invocation.getArgument(1);
            Map<String, Object> keys = new HashMap<>();
            keys.put("GENERATED_KEY", 999L);
            kh.getKeyList().add(keys);
            return 1;
        })
            .when(db)
            .update(any(PreparedStatementCreator.class), any(KeyHolder.class));

        var controller = new TeacherQuestionController(db, users);
        var res = controller.toLiveExam(
            auth,
            new TeacherQuestionController.LiveExamInput(
                12L,
                "15-min Exam",
                Instant.now().plusSeconds(3600),
                List.of(10L)
            )
        );
        assertEquals(999L, res.get("examId"));
        assertEquals(1, res.get("questionsCount"));
    }
}
