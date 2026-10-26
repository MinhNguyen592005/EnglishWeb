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
import org.springframework.test.util.ReflectionTestUtils;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class TeacherModerationTest {
    final JdbcTemplate db=mock(JdbcTemplate.class);
    final UserRepository users=mock(UserRepository.class);
    final Authentication auth=mock(Authentication.class);
    final TeacherQuestionController controller=new TeacherQuestionController(db,users,new ObjectMapper());
    TeacherModerationTest(){
        var user=new User("teacher","Teacher","hash");user.id=2L;user.role="TEACHER";
        when(auth.getName()).thenReturn("teacher");when(users.findByUsernameIgnoreCase("teacher")).thenReturn(Optional.of(user));
    }
    @Test void reactivatingPrivateQuestionCannotRemoveAdminBlockAndNotifiesOtherViews() {
        var events=mock(ApplicationEventPublisher.class);ReflectionTestUtils.setField(controller,"events",events);
        when(db.queryForObject("select count(*) from questions where id=? and deleted=false and owner_id=?",Integer.class,9L,2L)).thenReturn(1);
        when(db.queryForMap(contains("admin_blocked as adminBlocked"),eq(9L))).thenReturn(Map.of("active",true,"adminBlocked",true));
        var result=controller.active(auth,9L,Map.of("active",true));
        assertEquals(true,result.get("adminBlocked"));
        verify(db).update("update questions set teacher_active=? where id=?",true,9L);
        verify(db,never()).update(contains("set admin_blocked"),any(),any());
        verify(events).publishEvent(any(CurriculumChanged.class));
    }
    @Test void blockedOrArchivedQuestionsCannotBeCopiedToNewExamOrCommonBank() {
        when(db.queryForList("select teacher_id from classrooms where id=?",Long.class,5L)).thenReturn(List.of(2L));
        assertThrows(ApiException.class,()->controller.toLiveExam(auth,new TeacherQuestionController.LiveExamInput(5L,"Exam",Instant.now().plusSeconds(3600),List.of(9L))));
        assertThrows(ApiException.class,()->controller.promoteCommon(auth,new TeacherQuestionController.PromoteInput(List.of(9L))));
        verify(db,times(2)).queryForList("select * from questions where id=? and owner_id=? and deleted=false and admin_blocked=false and teacher_active=true",9L,2L);
        verify(db,never()).update(any(org.springframework.jdbc.core.PreparedStatementCreator.class),any(org.springframework.jdbc.support.KeyHolder.class));
    }
}
