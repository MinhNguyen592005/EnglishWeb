package com.grammarquest.service;

import com.grammarquest.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AssignmentAnswerGuardTest {
    @Test void closingAssignmentOrRemovingMemberStopsExistingAttempt() {
        JdbcTemplate db=mock(JdbcTemplate.class);
        when(db.query(anyString(),any(org.springframework.jdbc.core.RowMapper.class),eq(42L)))
            .thenReturn(List.of(Timestamp.from(Instant.now().plusSeconds(600))));
        when(db.queryForList(anyString(),eq(42L))).thenReturn(List.of(java.util.Map.of("status","CLOSED","dueAt",Timestamp.from(Instant.now().plusSeconds(600)),"memberCount",1)));
        assertEquals("ASSIGNMENT_CLOSED",assertThrows(ApiException.class,()->new AssignmentAnswerGuard(db).check(42L)).code);
        when(db.queryForList(anyString(),eq(42L))).thenReturn(List.of(java.util.Map.of("status","PUBLISHED","dueAt",Timestamp.from(Instant.now().plusSeconds(600)),"memberCount",0)));
        assertEquals("CLASS_ACCESS_REVOKED",assertThrows(ApiException.class,()->new AssignmentAnswerGuard(db).check(42L)).code);
    }
    @Test void expiredAssignmentRejectsAnswer() {
        JdbcTemplate db=mock(JdbcTemplate.class);
        when(db.query(anyString(),any(org.springframework.jdbc.core.RowMapper.class),eq(42L)))
            .thenReturn(List.of(Timestamp.from(Instant.now().minusSeconds(60))));
        ApiException error=assertThrows(ApiException.class,()->new AssignmentAnswerGuard(db).check(42L));
        assertEquals("ASSIGNMENT_TIME_OVER",error.code);
    }
    @Test void regularPracticeHasNoAssignmentDeadline() {
        JdbcTemplate db=mock(JdbcTemplate.class);
        when(db.query(anyString(),any(org.springframework.jdbc.core.RowMapper.class),eq(7L))).thenReturn(List.of());
        assertDoesNotThrow(()->new AssignmentAnswerGuard(db).check(7L));
    }
}
