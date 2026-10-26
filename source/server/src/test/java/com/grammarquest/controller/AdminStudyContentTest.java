package com.grammarquest.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.grammarquest.entity.User;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import com.grammarquest.service.CurriculumChanged;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class AdminStudyContentTest {
    final JdbcTemplate db=mock(JdbcTemplate.class);
    final UserRepository users=mock(UserRepository.class);
    final Authentication auth=mock(Authentication.class);
    final ApplicationEventPublisher events=mock(ApplicationEventPublisher.class);
    final AdminStudyContentController controller=new AdminStudyContentController(db,users,new ObjectMapper(),events);
    AdminStudyContentTest(){
        var user=new User("admin","Admin","hash");user.id=1L;user.role="ADMIN";
        when(auth.getName()).thenReturn("admin");when(users.findByUsernameIgnoreCase("admin")).thenReturn(Optional.of(user));
    }
    @Test void embeddedQuestionBlockIsScopedToItsLessonAndCanBeRemoved() {
        when(db.queryForList("select questions_json from study_lessons where id=? for update","1.1"))
            .thenReturn(List.of(Map.of("questions_json","[{\"id\":\"q1\"}]")));
        controller.publish(auth,new AdminStudyContentController.Publication("QUESTION","q1","1.1",false));
        verify(db).update("insert ignore into study_question_blocks(lesson_id,question_id) values(?,?)","1.1","q1");
        controller.publish(auth,new AdminStudyContentController.Publication("QUESTION","q1","1.1",true));
        verify(db).update("delete from study_question_blocks where lesson_id=? and question_id=?","1.1","q1");
        verify(events,times(2)).publishEvent(any(CurriculumChanged.class));
    }
    @Test void rejectsQuestionThatDoesNotBelongToLesson() {
        when(db.queryForList("select questions_json from study_lessons where id=? for update","1.1"))
            .thenReturn(List.of(Map.of("questions_json","[{\"id\":\"q1\"}]")));
        assertThrows(ApiException.class,()->controller.publish(auth,new AdminStudyContentController.Publication("QUESTION","other","1.1",false)));
        verifyNoInteractions(events);
        verify(db,never()).update(anyString(),any(Object[].class));
    }
    @Test void teacherCannotModerateStudyContent() {
        var teacher=new User("admin","Teacher","hash");teacher.id=1L;teacher.role="TEACHER";
        when(users.findByUsernameIgnoreCase("admin")).thenReturn(Optional.of(teacher));
        assertThrows(ApiException.class,()->controller.list(auth));
        assertThrows(ApiException.class,()->controller.publish(auth,new AdminStudyContentController.Publication("LESSON","1.1",null,false)));
        verifyNoInteractions(db,events);
    }
    @Test void hidingLessonDoesNotDeleteProgressOrHistoricalAttempts() {
        when(db.update("update study_lessons set published=? where id=?",false,"1.1")).thenReturn(1);
        controller.publish(auth,new AdminStudyContentController.Publication("LESSON","1.1",null,false));
        verify(db).update("update study_lessons set published=? where id=?",false,"1.1");
        verify(db).update(eq("insert into audit_logs(actor_id,action,target_type,target_id,detail) values(?,?,?,?,?)"),eq(1L),eq("STUDY_PUBLICATION"),eq("LESSON"),eq(0),anyString());
        verifyNoMoreInteractions(db);
        verify(events).publishEvent(any(CurriculumChanged.class));
    }
}
