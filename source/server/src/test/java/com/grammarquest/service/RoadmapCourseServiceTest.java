package com.grammarquest.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;

class RoadmapCourseServiceTest {

    final ObjectMapper json = new ObjectMapper();
    final RoadmapCourseService service = new RoadmapCourseService(
        mock(JdbcTemplate.class),
        json,
        mock(UserRepository.class),
        mock(ApplicationEventPublisher.class),
        mock(PlacementService.class)
    );

    @Test
    void batchSubmissionRejectsMissingUnknownAndInvalidAnswers() throws Exception {
        var questions = json.readTree(
            "[{\"id\":\"one\",\"correctOption\":\"A\"},{\"id\":\"two\",\"correctOption\":\"B\"}]"
        );
        assertThrows(ApiException.class, () ->
            service.validateAnswers(questions, json.readTree("{\"one\":\"A\"}"), true)
        );
        assertThrows(ApiException.class, () ->
            service.validateAnswers(
                questions,
                json.readTree("{\"one\":\"A\",\"other\":\"B\"}"),
                false
            )
        );
        assertThrows(ApiException.class, () ->
            service.validateAnswers(questions, json.readTree("{\"one\":\"E\"}"), false)
        );
        assertThrows(ApiException.class, () ->
            service.validateAnswers(questions, json.readTree("{\"one\":0}"), false)
        );
        assertEquals(
            1,
            service.validateAnswers(questions, json.readTree("{\"one\":\"A\"}"), false).size()
        );
        assertEquals(
            0,
            RoadmapCourseService.score(questions, json.readTree("{\"one\":\"B\",\"two\":\"A\"}"))
        );
    }

    @Test
    void tenQuestionExamAlwaysCoversAllModulesWithoutDuplicates() {
        var banks = new LinkedHashMap<String, List<com.fasterxml.jackson.databind.JsonNode>>();
        for (int module = 0; module < 7; module++) {
            var bank = new ArrayList<com.fasterxml.jackson.databind.JsonNode>();
            for (int q = 0; q < 12; q++) bank.add(
                json
                    .createObjectNode()
                    .put("id", module + "-" + q)
                    .put("module", module)
            );
            banks.put("m" + module, bank);
        }
        for (int i = 0; i < 30; i++) {
            var selected = RoadmapCourseService.selectBalanced(banks, 10);
            assertEquals(10, selected.size());
            assertEquals(
                10,
                selected
                    .stream()
                    .map(q -> q.path("id").asText())
                    .distinct()
                    .count()
            );
            assertEquals(
                7,
                selected
                    .stream()
                    .map(q -> q.path("module").asInt())
                    .distinct()
                    .count()
            );
        }
        assertEquals(84, banks.values().stream().mapToInt(List::size).sum());
    }
}
