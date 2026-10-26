package com.grammarquest.controller;

import com.grammarquest.entity.User;
import com.grammarquest.repository.UserRepository;
import com.grammarquest.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import java.util.Optional;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdminModerationTest {
    @Test void blockingPrivateQuestionDoesNotChangeTeacherArchivePreference() {
        var db=mock(JdbcTemplate.class);var users=mock(UserRepository.class);var auth=mock(Authentication.class);
        when(auth.getName()).thenReturn("admin");
        var admin=new User("admin","Admin","hash");admin.id=1L;admin.role="ADMIN";
        when(users.findByUsernameIgnoreCase("admin")).thenReturn(Optional.of(admin));
        when(db.queryForList("select owner_id,lesson_id from questions where id=? and deleted=false",5L))
            .thenReturn(List.of(Map.of("owner_id",2L,"lesson_id",3L)));
        var controller=new AdminController(db,users);
        controller.questionPublication(auth,5L,new AdminController.Publish(false));
        verify(db).update("update questions set admin_blocked=? where id=?",true,5L);
        controller.questionPublication(auth,5L,new AdminController.Publish(true));
        verify(db).update("update questions set admin_blocked=? where id=?",false,5L);
        verify(db,never()).update("update questions set teacher_active=? where id=?",false,5L);
        verify(db,never()).update("update questions set teacher_active=? where id=?",true,5L);
    }

    @Test void removingCommonQuestionRechecksLessonAvailability() {
        var db=mock(JdbcTemplate.class);var users=mock(UserRepository.class);var auth=mock(Authentication.class);
        when(auth.getName()).thenReturn("admin");
        var admin=new User("admin","Admin","hash");admin.id=1L;admin.role="ADMIN";
        when(users.findByUsernameIgnoreCase("admin")).thenReturn(Optional.of(admin));
        var row=new java.util.HashMap<String,Object>();row.put("owner_id",null);row.put("lesson_id",3L);
        when(db.queryForList("select owner_id,lesson_id from questions where id=? and deleted=false",5L)).thenReturn(List.of(row));
        when(db.queryForObject("select count(*) from questions where id=? and deleted=false and owner_id is null",Integer.class,5L)).thenReturn(1);
        when(db.update("update questions set published=?,admin_blocked=? where id=? and owner_id is null",false,true,5L)).thenReturn(1);
        new AdminController(db,users).questionPublication(auth,5L,new AdminController.Publish(false));
        verify(db).update(org.mockito.ArgumentMatchers.contains("update lessons set published=false"),org.mockito.ArgumentMatchers.eq(3L),org.mockito.ArgumentMatchers.eq(3L));
    }

    @Test
    void deletionArchivesLessonAndQuestionsWithoutDeletingHistory() {
        var db=mock(JdbcTemplate.class);
        var users=mock(UserRepository.class);
        var auth=mock(Authentication.class);
        when(auth.getName()).thenReturn("admin");
        var user=new User("admin","Admin","unused");user.id=1L;user.role="ADMIN";
        when(users.findByUsernameIgnoreCase("admin")).thenReturn(Optional.of(user));
        when(db.update("update lessons set published=false,deleted=true where id=? and deleted=false",5L)).thenReturn(1);
        var result=new AdminController(db,users).deleteLesson(auth,5L);
        assertEquals(true,result.get("deleted"));
        verify(db).update("update lessons set published=false,deleted=true where id=? and deleted=false",5L);
        verify(db).update("update questions set published=false,teacher_active=false,deleted=true where lesson_id=?",5L);
        verify(db).update("insert into audit_logs(actor_id,action,target_type,target_id,detail) values(?,?,?,?,?)",1L,"LESSON_DELETE","LESSON",5L,"Xóa mềm bài học và câu hỏi; giữ lịch sử làm bài");
        verifyNoMoreInteractions(db);
    }

    @Test
    void teacherCannotUseAdminDeletion() {
        var db=mock(JdbcTemplate.class);var users=mock(UserRepository.class);var auth=mock(Authentication.class);
        when(auth.getName()).thenReturn("teacher");
        var teacher=new User("teacher","Teacher","unused");teacher.role="TEACHER";
        when(users.findByUsernameIgnoreCase("teacher")).thenReturn(Optional.of(teacher));
        assertThrows(ApiException.class,()->new AdminController(db,users).deleteQuestion(auth,5L));
        verifyNoInteractions(db);
    }
}
