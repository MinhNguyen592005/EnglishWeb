package com.grammarquest.service;

import com.fasterxml.jackson.databind.*;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class PlacementServiceTest {
    final ObjectMapper json=new ObjectMapper();
    final PlacementService service=new PlacementService(mock(JdbcTemplate.class),json,mock(UserRepository.class),mock(ApplicationEventPublisher.class));
    @Test void exactScoringBoundariesAndCompleteAnswerValidation(){
        var questions=json.createArrayNode();var answers=json.createObjectNode();
        for(int i=0;i<10;i++)questions.add(json.createObjectNode().put("id","q"+i).put("correctOption","A"));
        int[] levels={1,1,1,1,1,1,2,2,2,3,3};
        for(int right=0;right<=10;right++){
            for(int i=0;i<10;i++)answers.put("q"+i,i<right?"A":"B");
            assertEquals(right,PlacementService.score(questions,service.validateAnswers(questions,answers)));
            assertEquals(levels[right],PlacementService.startingLevelForScore(right));
        }
        answers.remove("q0");assertThrows(ApiException.class,()->service.validateAnswers(questions,answers));
        answers.put("unknown","A");assertThrows(ApiException.class,()->service.validateAnswers(questions,answers));
        answers.remove("unknown");answers.put("q0","E");assertThrows(ApiException.class,()->service.validateAnswers(questions,answers));
        assertThrows(IllegalArgumentException.class,()->PlacementService.startingLevelForScore(11));
        assertEquals("Bạn chưa vượt qua level nào trong bài kiểm tra đầu vào. Bạn sẽ bắt đầu học từ Level 1.",PlacementService.resultMessage(5));
        assertEquals("Bạn đã vượt qua Level 1 trong bài kiểm tra đầu vào. Bạn sẽ bắt đầu học từ Level 2.",PlacementService.resultMessage(8));
        assertEquals("Bạn đã vượt qua Level 1 và Level 2 trong bài kiểm tra đầu vào. Bạn sẽ bắt đầu học từ Level 3.",PlacementService.resultMessage(9));
    }
    @Test void balancedRandomDrawHasNoDuplicatesAndDoesNotChangeBank(){
        var banks=new TreeMap<Integer,List<JsonNode>>();
        for(int level=1;level<=5;level++){var bank=new ArrayList<JsonNode>();for(int i=0;i<10;i++)bank.add(json.createObjectNode().put("id",level+"-"+i).put("level",level));banks.put(level,bank);}
        var seen=new HashSet<String>();int[] counts={3,3,2,1,1};
        for(int run=0;run<100;run++){
            var selected=PlacementService.draw(banks);assertEquals(10,selected.size());assertEquals(10,selected.stream().map(q->q.path("id").asText()).distinct().count());
            for(int level=1;level<=5;level++){int target=level;assertEquals(counts[level-1],selected.stream().filter(q->q.path("level").asInt()==target).count());}
            seen.add(selected.toString());
        }
        assertTrue(seen.size()>1);assertEquals(50,banks.values().stream().mapToInt(List::size).sum());
    }
}
