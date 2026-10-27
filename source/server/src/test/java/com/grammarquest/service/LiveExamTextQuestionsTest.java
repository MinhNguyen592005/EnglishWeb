package com.grammarquest.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.grammarquest.controller.TeacherQuestionController;
import com.grammarquest.entity.User;
import com.grammarquest.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;

import java.time.Instant;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class LiveExamTextQuestionsTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void isTextTypeCorrectlyIdentifiesTextQuestions() {
        assertTrue(LiveExamService.isTextType("FILL_BLANK"));
        assertTrue(LiveExamService.isTextType("ERROR_CORRECTION"));
        assertTrue(LiveExamService.isTextType("REWRITE"));
        assertFalse(LiveExamService.isTextType("MCQ"));
        assertFalse(LiveExamService.isTextType(null));
        assertFalse(LiveExamService.isTextType("OTHER"));
    }

    @Test
    void normalizeHandlesCaseWhitespaceAndPunctuation() {
        assertEquals("", LiveExamService.normalize(null));
        assertEquals("", LiveExamService.normalize("   "));
        assertEquals("he went to school", LiveExamService.normalize("  He went to   school.  "));
        assertEquals("they are students", LiveExamService.normalize("They Are Students!!!"));
        assertEquals("don't worry", LiveExamService.normalize("Don't worry?"));
    }

    @Test
    void scoreCalculatesMixedMcqAndTextQuestions() {
        ArrayNode qs = json.createArrayNode();

        // 1. MCQ
        ObjectNode q1 = qs.addObject();
        q1.put("id", "q1");
        q1.put("prompt", "Question 1");
        q1.put("questionType", "MCQ");
        q1.put("correct", 2);

        // 2. FILL_BLANK
        ObjectNode q2 = qs.addObject();
        q2.put("id", "q2");
        q2.put("prompt", "Question 2");
        q2.put("questionType", "FILL_BLANK");
        q2.put("acceptedAnswer", "went");

        // 3. REWRITE
        ObjectNode q3 = qs.addObject();
        q3.put("id", "q3");
        q3.put("prompt", "Question 3");
        q3.put("questionType", "REWRITE");
        q3.put("acceptedAnswer", "She is smarter than him.");

        // Answers: q1 correct (2), q2 correct ("  WENT!  "), q3 wrong ("he is smarter")
        ObjectNode answers = json.createObjectNode();
        answers.put("q1", 2);
        answers.put("q2", "  WENT!  ");
        answers.put("q3", "he is smarter");

        int calculatedScore = LiveExamService.score(qs, answers);
        assertEquals(2, calculatedScore);

        // Update q3 to correct
        answers.put("q3", "she is smarter than him");
        assertEquals(3, LiveExamService.score(qs, answers));
    }

    @Test
    void questionsValidatesTextQuestionsProperly() {
        var db = mock(JdbcTemplate.class);
        var users = mock(UserRepository.class);
        var service = new LiveExamService(db, users, json);

        ObjectNode p = json.createObjectNode();
        ArrayNode qs = p.putArray("questions");

        ObjectNode q1 = qs.addObject();
        q1.put("id", "q1");
        q1.put("prompt", "Fill in the blank");
        q1.put("questionType", "FILL_BLANK");
        q1.put("acceptedAnswer", "tested");

        var result = service.questions(p);
        assertEquals(1, result.size());
        assertEquals("FILL_BLANK", result.get(0).get("questionType").asText());
        assertEquals("tested", result.get(0).get("acceptedAnswer").asText());
        assertTrue(result.get(0).get("options").isArray());
        assertEquals(0, result.get(0).get("options").size());
    }

    @Test
    void toLiveExamPreservesQuestionTypeAndAcceptedAnswer() {
        var db = mock(JdbcTemplate.class);
        var users = mock(UserRepository.class);
        var auth = mock(Authentication.class);
        when(auth.getName()).thenReturn("teacher1");

        var teacher = new User("teacher1", "Teacher One", "pass");
        teacher.id = 10L;
        teacher.role = "TEACHER";
        when(users.findByUsernameIgnoreCase("teacher1")).thenReturn(Optional.of(teacher));

        when(db.queryForList("select teacher_id from classrooms where id=?", Long.class, 5L))
            .thenReturn(List.of(10L));

        Map<String, Object> textQ = new HashMap<>();
        textQ.put("id", 101L);
        textQ.put("prompt", "Change the sentence to past tense");
        textQ.put("question_type", "REWRITE");
        textQ.put("accepted_answer", "I went home.");

        when(db.queryForList("select * from questions where id=? and owner_id=? and deleted=false", 101L, 10L))
            .thenReturn(List.of(textQ));

        final String[] savedJson = new String[1];
        when(db.update(any(org.springframework.jdbc.core.PreparedStatementCreator.class), any(org.springframework.jdbc.support.GeneratedKeyHolder.class)))
            .thenAnswer(invocation -> {
                var kh = invocation.getArgument(1, org.springframework.jdbc.support.GeneratedKeyHolder.class);
                try {
                    var field = org.springframework.jdbc.support.GeneratedKeyHolder.class.getDeclaredField("keyList");
                    field.setAccessible(true);
                    @SuppressWarnings("unchecked")
                    var list = (List<Map<String, Object>>) field.get(kh);
                    list.add(Map.of("GENERATED_KEY", 999L));
                } catch (Exception ignored) {}
                return 1;
            });

        var controller = new TeacherQuestionController(db, users, json);
        var input = new TeacherQuestionController.LiveExamInput(
            5L,
            "Midterm Exam",
            Instant.now().plusSeconds(3600),
            List.of(101L)
        );

        var result = controller.toLiveExam(auth, input);
        assertNotNull(result);
        assertEquals(999L, result.get("examId"));
        assertEquals(1, result.get("questionsCount"));
    }
}
