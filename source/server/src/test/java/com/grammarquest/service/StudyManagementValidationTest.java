package com.grammarquest.service;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.grammarquest.exception.ApiException;
import org.junit.jupiter.api.Test;

class StudyManagementValidationTest {

    final ObjectMapper json = new ObjectMapper();

    ObjectNode payload() throws Exception {
        return (ObjectNode) json.readTree(
            """
            {"id":"m-test","levelId":1,"ordinalNo":1,"title":"A module","archived":false,
              "lessons":[{"id":"lesson-test","title":"A lesson","archived":false,
                "content":{"objective":"Understand sentences","sections":[{"title":"Word order","body":"Subject first."}],"examples":[],"mistakes":[],"prerequisites":[],"application":"Write.","summary":"Remember."},
                "questions":[{"id":"q-test","prompt":"Choose.","options":["One","Two","Three","Four"],"correctOption":"A","explanation":"First is correct."}]}]}
            """
        );
    }

    @Test
    void incompleteWorkCanBeSavedButCannotBeSubmitted() throws Exception {
        var p = payload();
        ((ObjectNode) p.path("lessons").get(0)).putArray("questions");
        assertDoesNotThrow(() -> StudyManagementService.validate(p, false));
        assertThrows(ApiException.class, () -> StudyManagementService.validate(p, true));
    }

    @Test
    void invalidAnswersAndDuplicateQuestionIdsAreRejected() throws Exception {
        var p = payload();
        var q = (ObjectNode) p.path("lessons").get(0).path("questions").get(0);
        q.put("correctOption", "E");
        assertThrows(ApiException.class, () -> StudyManagementService.validate(p, false));
        q.put("correctOption", "A");
        (
            (com.fasterxml.jackson.databind.node.ArrayNode) p
                .path("lessons")
                .get(0)
                .path("questions")
        ).add(q.deepCopy());
        assertThrows(ApiException.class, () -> StudyManagementService.validate(p, true));
    }

    @Test
    void blankTheoryCannotBePublishedAndInvalidPositionCannotBeSaved() throws Exception {
        var p = payload();
        ((ObjectNode) p.path("lessons").get(0).path("content").path("sections").get(0)).put(
            "body",
            ""
        );
        assertDoesNotThrow(() -> StudyManagementService.validate(p, false));
        assertThrows(ApiException.class, () -> StudyManagementService.validate(p, true));
        p.put("ordinalNo", 0);
        assertThrows(ApiException.class, () -> StudyManagementService.validate(p, false));
    }

    @Test
    void existingShortModuleCanBePublishedWithoutInventingQuestions() throws Exception {
        assertDoesNotThrow(() -> StudyManagementService.validate(payload(), true));
    }
}
