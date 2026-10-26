package com.grammarquest.service;

import com.grammarquest.entity.User;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SecurityIncidentServiceTest {
    final JdbcTemplate db=mock(JdbcTemplate.class);
    final UserRepository users=mock(UserRepository.class);
    final ApplicationEventPublisher events=mock(ApplicationEventPublisher.class);
    final SecurityIncidentService service=new SecurityIncidentService(db,users,events);
    void admin(){var admin=new User("admin","Admin","hash");admin.id=1L;admin.role="ADMIN";when(users.findByUsernameIgnoreCase("admin")).thenReturn(Optional.of(admin));}
    void incident(Map<String,Object> row){when(db.queryForList(contains("select * from security_incidents"),eq(5L))).thenReturn(List.of(row));}
    @Test void detectionPersistsEvidenceAndPublishesSavedIncidentId(){
        when(db.queryForList("select id from users where username=?",Long.class,"alice")).thenReturn(List.of(2L));
        when(db.update(any(org.springframework.jdbc.core.PreparedStatementCreator.class),any(org.springframework.jdbc.support.KeyHolder.class))).thenAnswer(inv->{
            org.springframework.jdbc.support.KeyHolder keys=inv.getArgument(1);keys.getKeyList().add(Map.of("id",99L));return 1;
        });
        service.detected(new com.grammarquest.security.BehaviorMonitor.Detected(com.grammarquest.security.BehaviorMonitor.Rule.CHAT_SPAM,"alice",null,"tab1",8,java.time.Instant.now()));
        var alert=org.mockito.ArgumentCaptor.forClass(SecurityIncidentService.Alert.class);verify(events).publishEvent(alert.capture());
        assertEquals(99L,alert.getValue().id());assertEquals("alice",alert.getValue().username());assertTrue(alert.getValue().message().contains("8"));
    }
    @Test void learnersAndLockedAdminsCannotSeeIncidents(){
        var user=new User("alice","Alice","hash");when(users.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));
        assertEquals("ADMIN_ONLY",assertThrows(ApiException.class,()->service.list("alice")).code);
        user.role="ADMIN";user.locked=true;
        assertEquals("ADMIN_ONLY",assertThrows(ApiException.class,()->service.list("alice")).code);
        verifyNoInteractions(db);
    }
    @Test void lockDecisionLocksAccountAndRecordsAuditAndNotification(){
        admin();incident(Map.of("status","OPEN","user_id",2L,"username","alice"));
        var target=new User("alice","Alice","hash");target.id=2L;when(users.findWithLockById(2L)).thenReturn(Optional.of(target));
        service.decide("admin",5L,"LOCK","Reviewed repeated access violations");
        assertTrue(target.locked);verify(users).save(target);
        verify(db).update(startsWith("insert into audit_logs"),eq(1L),eq("SECURITY_LOCK"),eq("SECURITY_INCIDENT"),eq(5L),anyString());
        verify(events).publishEvent(any(SecurityIncidentService.Resolved.class));
    }
    @Test void lastAdminCannotBeLocked(){
        admin();incident(Map.of("status","OPEN","user_id",1L,"username","admin"));
        var target=users.findByUsernameIgnoreCase("admin").orElseThrow();when(users.findWithLockById(1L)).thenReturn(Optional.of(target));
        when(db.queryForList(contains("role='ADMIN'"),eq(Long.class))).thenReturn(List.of(1L));
        assertEquals("LAST_ADMIN",assertThrows(ApiException.class,()->service.decide("admin",5L,"LOCK","")).code);
        assertFalse(target.locked);verifyNoInteractions(events);
    }
    @Test void anonymousIncidentCannotLockAnyoneAndResolvedDecisionCannotBeRepeated(){
        admin();incident(Map.of("status","OPEN"));
        assertEquals("NO_ACCOUNT",assertThrows(ApiException.class,()->service.decide("admin",5L,"LOCK","")).code);
        service.decide("admin",5L,"DISMISS","Shared network; reviewed");
        verify(events).publishEvent(any(SecurityIncidentService.Resolved.class));
        incident(Map.of("status","RESOLVED"));
        assertEquals("ALREADY_RESOLVED",assertThrows(ApiException.class,()->service.decide("admin",5L,"WARN","")).code);
    }
}
