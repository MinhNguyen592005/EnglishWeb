package com.grammarquest.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.grammarquest.controller.ClassroomController;
import com.grammarquest.exception.ApiException;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.core.Authentication;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SocketClassroomServiceTest {
    private final ClassroomController classes=mock(ClassroomController.class);
    private final LearningService learning=mock(LearningService.class);
    private final SocketClassroomService service=new SocketClassroomService(classes,learning,Validation.buildDefaultValidatorFactory().getValidator());
    private final ObjectMapper json=new ObjectMapper();
    @Test void mutationsUseServerIdentityAndValidateLikeRest() throws Exception {
        service.action("teacher","CLASS_CREATE",json.readTree("{\"name\":\" English A1 \",\"username\":\"admin\"}"));
        var auth=ArgumentCaptor.forClass(Authentication.class);verify(classes).create(auth.capture(),eq(new ClassroomController.NewClass("English A1")));
        assertEquals("teacher",auth.getValue().getName());
        assertThrows(ApiException.class,()->service.action("teacher","CLASS_ASSIGN",json.readTree("{\"classId\":1,\"lessonId\":1,\"title\":\"Test\",\"dueAt\":\"2030-01-01T00:00:00Z\",\"passPercent\":0}")));
        assertThrows(ApiException.class,()->service.action("teacher","CLASS_RENAME",json.readTree("{\"classId\":1.5,\"name\":\"X\"}")));
        assertThrows(ApiException.class,()->service.action("teacher","CLASS_UPDATE_ASSIGNMENT",json.readTree("{\"classId\":1,\"assignmentId\":1,\"title\":\"Test\",\"dueAt\":\"invalid\",\"passPercent\":80,\"status\":\"OPEN\"}")));
        verify(classes,never()).assign(any(),anyLong(),any());
    }
    @Test void snapshotsSeparateListMembersMessagesAndOwnerOnlyResults() {
        when(classes.list(any())).thenReturn(List.of(Map.of("id",1L)));
        assertTrue(service.snapshot("alice",null,null).containsKey("classes"));
        when(classes.detail(any(),eq(1L))).thenReturn(Map.of("id",1L));
        when(classes.messages(any(),eq(1L))).thenReturn(List.of());
        assertFalse(service.snapshot("alice",1L,null).containsKey("results"));
        verify(classes,never()).results(any(),anyLong(),anyLong());
        when(classes.results(any(),eq(1L),eq(7L))).thenThrow(new ApiException(org.springframework.http.HttpStatus.FORBIDDEN,"FORBIDDEN","Only owner"));
        assertThrows(ApiException.class,()->service.snapshot("alice",1L,7L));
        when(classes.detail(any(),eq(2L))).thenThrow(new ApiException(org.springframework.http.HttpStatus.FORBIDDEN,"FORBIDDEN","Removed"));
        assertThrows(ApiException.class,()->service.snapshot("alice",2L,null));
        verify(classes,never()).messages(any(),eq(2L));
    }
}
