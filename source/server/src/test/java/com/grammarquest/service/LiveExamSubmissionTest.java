package com.grammarquest.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.grammarquest.entity.User;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class LiveExamSubmissionTest {
    final JdbcTemplate db=mock(JdbcTemplate.class);
    final UserRepository users=mock(UserRepository.class);
    final ObjectMapper json=new ObjectMapper();
    final DailyQuestService quests=mock(DailyQuestService.class);
    final LiveExamService service=spy(new LiveExamService(db,users,json,quests));
    final String questions="""
        [{"id":"choice","questionType":"MCQ","correct":2},
         {"id":"text","questionType":"FILL_BLANK","acceptedAnswer":"home"}]
        """;
    LiveExamSubmissionTest(){
        var learner=new User("alice","Alice","hash");learner.id=2L;
        when(users.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(learner));
        when(db.queryForList("select * from class_exams where id=? for update",9L)).thenReturn(List.of(Map.of("class_id",5L,"questions_json",questions,"version",1L,"ends_at",Timestamp.from(Instant.now().plusSeconds(3600)),"closed",false)));
        when(db.queryForList("select teacher_id from classrooms where id=?",Long.class,5L)).thenReturn(List.of(1L));
        when(db.queryForObject("select count(*) from class_members where class_id=? and user_id=?",Integer.class,5L,2L)).thenReturn(1);
        when(db.queryForMap("select answers_json,submitted from class_exam_submissions where exam_id=? and user_id=?",9L,2L)).thenReturn(Map.of("answers_json","{\"choice\":0,\"text\":\"old\"}","submitted",false));
        doReturn(Map.of("submitted",true)).when(service).view("alice",9L);
    }
    @Test void submitStoresAndScoresFinalSnapshotInOneWrite() throws Exception {
        service.action("alice","EXAM_SUBMIT",json.readTree("{\"examId\":9,\"version\":1,\"answers\":{\"choice\":2,\"text\":\" home \"}}"));
        verify(db).update("update class_exam_submissions set answers_json=?,correct_count=?,answered_count=?,submitted=?,updated_at=current_timestamp(6) where exam_id=? and user_id=?","{\"choice\":2,\"text\":\"home\"}",2,2,true,9L,2L);
        verify(quests).recordProgress(2L,"CLASS_ASSIGNMENT",1);
        verify(quests).recordProgress(2L,"CORRECT_COUNT",2);
    }
    @Test void malformedSnapshotCannotFinalizeOrAwardQuests() throws Exception {
        assertThrows(ApiException.class,()->service.action("alice","EXAM_SUBMIT",json.readTree("{\"examId\":9,\"version\":1,\"answers\":{\"choice\":2,\"text\":7}}")));
        verify(db,never()).update(contains("update class_exam_submissions set answers_json"),any(Object[].class));
        verifyNoInteractions(quests);
    }
    @Test void validatesUnknownQuestionTypesLengthsAndEmptyAnswers() throws Exception {
        var qs=json.readTree(questions);
        for(String answers:List.of("[]","null","{\"other\":0}","{\"choice\":4}","{\"choice\":\"2\"}","{\"text\":true}","{\"text\":\""+"a".repeat(256)+"\"}")) {
            assertThrows(ApiException.class,()->service.submissionAnswers(qs,json.readTree(answers)),answers);
        }
        assertEquals(0,service.submissionAnswers(qs,json.readTree("{\"text\":\"  \"}")).size());
    }
    @Test void staleVersionCannotFinalizeNewSnapshot() throws Exception {
        assertThrows(ApiException.class,()->service.action("alice","EXAM_SUBMIT",json.readTree("{\"examId\":9,\"version\":0,\"answers\":{\"choice\":2}}")));
        verify(db,never()).update(anyString(),any(Object[].class));
        verifyNoInteractions(quests);
    }
}
