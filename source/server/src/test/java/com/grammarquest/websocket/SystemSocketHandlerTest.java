package com.grammarquest.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.grammarquest.service.ServerMonitorService;
import com.grammarquest.entity.User;
import com.grammarquest.repository.UserRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import org.mockito.ArgumentCaptor;

class SystemSocketHandlerTest {
    @Test void securityAlertReachesAllTargetTabsAndAdminsWithoutLeakingToOtherUsers() throws Exception {
        var handler=new SystemSocketHandler(new ObjectMapper(),users,learning,matchmaker,arenaSocket,mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var target=socket("guest");var otherTab=socket("guest");when(otherTab.getId()).thenReturn("other-tab");
        var admin=socket("admin");var bystander=socket("bystander");
        for(var client:java.util.List.of(target,otherTab,admin,bystander))handler.afterConnectionEstablished(client);
        clearInvocations(target,otherTab,admin,bystander);
        handler.securityAlert(new com.grammarquest.service.SecurityIncidentService.Alert(9L,"guest","HIGH","Repeated access denied"));
        var sent=ArgumentCaptor.forClass(TextMessage.class);
        verify(target).sendMessage(sent.capture());var data=new ObjectMapper().readTree(sent.getValue().getPayload());
        assertEquals("SECURITY_WARNING",data.path("action").asText());assertFalse(data.path("payload").has("username"));
        verify(otherTab).sendMessage(any());verify(admin).sendMessage(sent.capture());
        assertEquals("SECURITY_INCIDENT",new ObjectMapper().readTree(sent.getValue().getPayload()).path("action").asText());
        verifyNoInteractions(bystander);
        clearInvocations(target,otherTab,admin,bystander);
        // Recheck the current DB role instead of trusting a stale ADMIN socket registration.
        users.findByUsernameIgnoreCase("admin").orElseThrow().role="TEACHER";
        handler.securityAlert(new com.grammarquest.service.SecurityIncidentService.Alert(10L,"guest","HIGH","Repeated access denied"));
        verifyNoInteractions(admin,bystander);
        handler.securityResolved(new com.grammarquest.service.SecurityIncidentService.Resolved(10L,"guest","LOCK","Account locked"));
        verify(target).close(new CloseStatus(4003,"Account locked"));verify(otherTab).close(new CloseStatus(4003,"Account locked"));
    }
    @Test void reportReceiptAndEveryDecisionArePushedToBothPartiesWithoutLeakingIdentity() throws Exception {
        var handler=new SystemSocketHandler(new ObjectMapper(),users,learning,matchmaker,arenaSocket,mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var target=socket("guest");var target2=socket("guest");when(target2.getId()).thenReturn("target2");
        var reporter=socket("reporter");var reporter2=socket("reporter");when(reporter2.getId()).thenReturn("reporter2");users.findByUsernameIgnoreCase("reporter").orElseThrow().id=3L;
        var bystander=socket("bystander");users.findByUsernameIgnoreCase("bystander").orElseThrow().id=4L;var admin=socket("admin");
        for(var socket:java.util.List.of(target,target2,reporter,reporter2,bystander,admin))handler.afterConnectionEstablished(socket);
        clearInvocations(target,target2,reporter,reporter2,bystander,admin);
        handler.reportReceived(new com.grammarquest.service.RealtimeNotifier.Reported(2L,3L,"CLASS",5L));
        var sent=ArgumentCaptor.forClass(TextMessage.class);verify(reporter).sendMessage(sent.capture());
        assertEquals("REPORT_SUBMITTED",new ObjectMapper().readTree(sent.getValue().getPayload()).path("action").asText());verify(reporter2).sendMessage(any());verify(target2).sendMessage(any());verifyNoInteractions(bystander);
        for(String decision:java.util.List.of("WARN","DISMISS","MUTE_24H","LOCK")){
            clearInvocations(target,target2,reporter,reporter2,bystander,admin);
            handler.reportResolved(new com.grammarquest.service.ReportResolved(2L,3L,"CLASS",5L,decision));
            verify(target).sendMessage(sent.capture());var data=new ObjectMapper().readTree(sent.getValue().getPayload()).path("payload");
            assertEquals(decision,data.path("decision").asText());assertEquals("TARGET",data.path("recipient").asText());assertFalse(data.has("reporterId"));assertFalse(data.has("note"));
            verify(reporter).sendMessage(sent.capture());assertEquals("REPORTER",new ObjectMapper().readTree(sent.getValue().getPayload()).path("payload").path("recipient").asText());
            verify(reporter2).sendMessage(any());verify(target2).sendMessage(any());verifyNoInteractions(bystander,admin);
        }
        verify(target).close(new CloseStatus(4003,"Account locked"));verify(target2).close(new CloseStatus(4003,"Account locked"));verify(reporter,never()).close(any());
    }

    @Test void busySocketRequestDoesNotQueryDatabaseAndRecoversWithoutLeakingPermits() throws Exception {
        var cap=new com.grammarquest.security.ServerCapacity(10,5,1);
        var handler=new SystemSocketHandler(new ObjectMapper(),users,learning,matchmaker,arenaSocket,mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        org.springframework.test.util.ReflectionTestUtils.setField(handler,"capacity",cap);
        var client=socket("guest");handler.afterConnectionEstablished(client);clearInvocations(users,client);
        assertTrue(cap.tryEnter());handler.handleTextMessage(client,new TextMessage("{\"action\":\"ACCOUNT_GET\",\"requestId\":\"busy\"}"));
        verifyNoInteractions(users);var sent=ArgumentCaptor.forClass(TextMessage.class);verify(client).sendMessage(sent.capture());
        var reply=new ObjectMapper().readTree(sent.getValue().getPayload());assertEquals("busy",reply.path("requestId").asText());assertEquals("SERVER_BUSY",reply.path("payload").path("code").asText());
        cap.leave();handler.handleTextMessage(client,new TextMessage("{\"action\":\"ACCOUNT_GET\"}"));assertEquals(0,cap.metrics().get("activeRequests"));
        handler.handleTextMessage(client,new TextMessage("{\"action\":\"UNKNOWN\"}"));assertEquals(0,cap.metrics().get("activeRequests"));
        handler.handleTextMessage(client,new TextMessage("invalid json"));assertEquals(0,cap.metrics().get("activeRequests"));
    }

    @Test void snapshotsAreReadOncePerUserPerTickAndNotSharedAcrossUsers() throws Exception {
        var classes=mock(com.grammarquest.service.SocketClassroomService.class);
        var workspaces=mock(com.grammarquest.service.SocketWorkspaceService.class);
        var handler=new SystemSocketHandler(new ObjectMapper(),users,learning,matchmaker,arenaSocket,mock(com.grammarquest.service.LiveExamService.class),classes,mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        org.springframework.test.util.ReflectionTestUtils.setField(handler,"workspaces",workspaces);
        var a=socket("guest");var b=socket("guest");var c=socket("admin");when(b.getId()).thenReturn("second");
        for(var socket:java.util.List.of(a,b,c))handler.afterConnectionEstablished(socket);
        when(classes.snapshot(anyString(),isNull(),isNull())).thenAnswer(call->java.util.Map.<String,Object>of("username",call.getArgument(0,String.class),"version",1));
        when(workspaces.snapshot(anyString(),anyString())).thenReturn(java.util.Map.of("version",1));
        for(var socket:java.util.List.of(a,b,c)){
            handler.handleTextMessage(socket,new TextMessage("{\"action\":\"CLASS_LIST\"}"));
            handler.handleTextMessage(socket,new TextMessage("{\"action\":\"TEACHER_OVERVIEW_WATCH\"}"));
        }
        clearInvocations(classes,workspaces);
        handler.pushClassroomUpdates();handler.pushWorkspaces();
        verify(classes,times(1)).snapshot("guest",null,null);verify(classes,times(1)).snapshot("admin",null,null);
        verify(workspaces,times(1)).snapshot("guest","TEACHER");verify(workspaces,times(1)).snapshot("admin","TEACHER");
        handler.pushClassroomUpdates();handler.pushWorkspaces();
        verify(classes,times(2)).snapshot("guest",null,null);verify(workspaces,times(2)).snapshot("guest","TEACHER");
    }
    @Test void telemetrySendsOnlyNewEventsAndRestoresHistoryAfterRewatch() throws Exception {
        var json=new ObjectMapper();
        var handler=new SystemSocketHandler(json,users,learning,matchmaker,arenaSocket,mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var admin=socket("admin");handler.afterConnectionEstablished(admin);
        handler.handleTextMessage(admin,new TextMessage("{\"action\":\"SYSTEM_MONITOR_WATCH\"}"));clearInvocations(admin);
        var monitor=new ServerMonitorService(handler,json);monitor.broadcastStats();monitor.broadcastStats();
        var sent=ArgumentCaptor.forClass(TextMessage.class);verify(admin,times(2)).sendMessage(sent.capture());
        var first=json.readTree(sent.getAllValues().get(0).getPayload()).path("data");var second=json.readTree(sent.getAllValues().get(1).getPayload()).path("data");
        assertTrue(first.path("events").size()>0);assertTrue(first.path("eventsDelta").asBoolean());assertEquals(0,second.path("events").size());
        handler.handleTextMessage(admin,new TextMessage("{\"action\":\"SYSTEM_MONITOR_UNWATCH\"}"));clearInvocations(admin,users);
        monitor.broadcastStats();verifyNoInteractions(admin,users);
        handler.handleTextMessage(admin,new TextMessage("{\"action\":\"SYSTEM_MONITOR_WATCH\"}"));clearInvocations(admin);
        monitor.broadcastStats();verify(admin).sendMessage(sent.capture());assertEquals(first.path("events").size(),json.readTree(sent.getValue().getPayload()).path("data").path("events").size());
    }

    @Test void adminControlsAreAuthorizedPrivateAndReleaseTargetOnly() throws Exception {
        var handler=new SystemSocketHandler(new ObjectMapper(),users,learning,matchmaker,arenaSocket,mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var admin=socket("admin");var client=socket("guest");var other=socket("guest");when(other.getId()).thenReturn("other-tab");
        handler.afterConnectionEstablished(admin);handler.afterConnectionEstablished(client);handler.afterConnectionEstablished(other);
        handler.handleTextMessage(client,new TextMessage("{\"action\":\"SYSTEM_DISCONNECT\",\"payload\":{\"sessionId\":\"admin\"}}"));
        verify(admin,never()).close(any());assertEquals(3,handler.connectionCount());
        clearInvocations(admin,client,other);
        handler.handleTextMessage(admin,new TextMessage("{\"action\":\"SYSTEM_REMIND\",\"payload\":{\"sessionId\":\"guest\",\"message\":\"Continue learning\"}}"));
        var sent=ArgumentCaptor.forClass(TextMessage.class);verify(client).sendMessage(sent.capture());
        assertEquals("SYSTEM_NOTICE",new ObjectMapper().readTree(sent.getValue().getPayload()).path("action").asText());verifyNoInteractions(other);
        assertEquals(1,handler.clientDetails().stream().filter(c->c.sessionId().equals("admin")).findFirst().orElseThrow().messagesReceived());
        handler.handleTextMessage(admin,new TextMessage("{\"action\":\"SYSTEM_DISCONNECT\",\"payload\":{\"sessionId\":\"guest\"}}"));
        verify(client).close(new CloseStatus(4006,"Disconnected by administrator"));verify(matchmaker).disconnect("guest");
        assertEquals(2,handler.connectionCount());assertTrue(handler.clientDetails().stream().noneMatch(c->c.sessionId().equals("guest")));verify(other,never()).close(any());
        handler.handleTextMessage(admin,new TextMessage("{\"action\":\"SYSTEM_DISCONNECT\",\"payload\":{\"sessionId\":\"admin\"}}"));verify(admin,never()).close(any());
    }
    @Test void anomalyAlertsReflectIdleAndMissingPongWithoutChangingState() throws Exception {
        var handler=new SystemSocketHandler(new ObjectMapper(),users,learning,matchmaker,arenaSocket,mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        handler.afterConnectionEstablished(socket("guest"));
        var states=(java.util.Map<?,?>)org.springframework.test.util.ReflectionTestUtils.getField(handler,"userSessions");
        var state=(UserSession)states.get("guest");long now=System.currentTimeMillis();
        org.springframework.test.util.ReflectionTestUtils.setField(state,"lastPongAt",now-40_000);
        org.springframework.test.util.ReflectionTestUtils.setField(state,"lastInteractionAt",now-180_000);
        assertTrue(handler.systemAlerts().stream().anyMatch(a->a.key().equals("pong-guest")));
        assertTrue(handler.systemAlerts().stream().anyMatch(a->a.key().equals("idle-guest")));
        state.pong();state.touch();assertTrue(handler.systemAlerts().stream().noneMatch(a->a.sessionId().equals("guest")));
    }

    @Test void workspacePushIsChangedOnlyRevokesAccessAndReleasesOnDisconnect() throws Exception {
        var workspaces=mock(com.grammarquest.service.SocketWorkspaceService.class);
        var handler=new SystemSocketHandler(new ObjectMapper(),users,learning,matchmaker,arenaSocket,mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        org.springframework.test.util.ReflectionTestUtils.setField(handler,"workspaces",workspaces);
        var client=socket("admin");handler.afterConnectionEstablished(client);
        when(workspaces.snapshot("admin","REPORTS")).thenReturn(java.util.Map.of("reports",java.util.List.of()));
        handler.handleTextMessage(client,new TextMessage("{\"action\":\"ADMIN_REPORTS_WATCH\",\"requestId\":\"r1\"}"));
        clearInvocations(client);handler.pushWorkspaces();verify(client,never()).sendMessage(any());
        when(workspaces.snapshot("admin","REPORTS")).thenReturn(java.util.Map.of("reports",java.util.List.of(7)));
        handler.pushWorkspaces();handler.pushWorkspaces();
        var sent=ArgumentCaptor.forClass(TextMessage.class);verify(client).sendMessage(sent.capture());
        assertEquals("WORKSPACE_UPDATE",new ObjectMapper().readTree(sent.getValue().getPayload()).path("action").asText());
        when(workspaces.snapshot("admin","REPORTS")).thenThrow(new com.grammarquest.exception.ApiException(org.springframework.http.HttpStatus.FORBIDDEN,"ADMIN_ONLY","Denied"));
        clearInvocations(client);handler.pushWorkspaces();handler.pushWorkspaces();verify(client).sendMessage(sent.capture());
        assertEquals("WORKSPACE_ERROR",new ObjectMapper().readTree(sent.getValue().getPayload()).path("action").asText());
        doReturn(java.util.Map.of("reports",java.util.List.of())).when(workspaces).snapshot("admin","REPORTS");
        handler.handleTextMessage(client,new TextMessage("{\"action\":\"ADMIN_REPORTS_WATCH\"}"));
        handler.handleTextMessage(client,new TextMessage("{\"action\":\"WORKSPACE_UNWATCH\"}"));
        clearInvocations(workspaces);handler.pushWorkspaces();verifyNoInteractions(workspaces);
        handler.handleTextMessage(client,new TextMessage("{\"action\":\"ADMIN_REPORTS_WATCH\"}"));
        handler.afterConnectionClosed(client,CloseStatus.NORMAL);clearInvocations(workspaces);handler.pushWorkspaces();verifyNoInteractions(workspaces);
    }

    @Test void profilesSyncAcrossTabsRolesChangeAndLockClosesAllTabs() throws Exception {
        var handler=new SystemSocketHandler(new ObjectMapper(),users,learning,matchmaker,arenaSocket,mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var a=socket("guest");var b=socket("guest");when(b.getId()).thenReturn("second-tab");handler.afterConnectionEstablished(a);handler.afterConnectionEstablished(b);
        var user=users.findByUsernameIgnoreCase("guest").orElseThrow();when(users.findAllById(any())).thenReturn(java.util.List.of(user));
        handler.pushAccountUpdates();clearInvocations(a,b);user.totalXp=1250;
        handler.pushAccountUpdates();handler.pushAccountUpdates();
        var sent=ArgumentCaptor.forClass(TextMessage.class);verify(a).sendMessage(sent.capture());verify(b).sendMessage(any());
        assertEquals(2,new ObjectMapper().readTree(sent.getValue().getPayload()).path("payload").path("level").asInt());
        user.role="TEACHER";handler.pushAccountUpdates();verify(matchmaker).disconnect("guest");
        clearInvocations(a,b);user.locked=true;handler.pushAccountUpdates();
        verify(a).close(new CloseStatus(4003,"Account locked"));verify(b).close(new CloseStatus(4003,"Account locked"));assertEquals(0,handler.connectionCount());
    }
    @Test void reportNotificationIsPrivateAndReachesAllTargetTabs() throws Exception {
        var handler=new SystemSocketHandler(new ObjectMapper(),users,learning,matchmaker,arenaSocket,mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var a=socket("guest");var b=socket("guest");var admin=socket("admin");when(b.getId()).thenReturn("second-tab");
        handler.afterConnectionEstablished(a);handler.afterConnectionEstablished(b);handler.afterConnectionEstablished(admin);
        handler.reportReceived(new com.grammarquest.service.RealtimeNotifier.Reported(users.findByUsernameIgnoreCase("guest").orElseThrow().id,999L,"USER",7));
        var sent=ArgumentCaptor.forClass(TextMessage.class);verify(a).sendMessage(sent.capture());verify(b).sendMessage(any());
        var message=new ObjectMapper().readTree(sent.getValue().getPayload());assertEquals("REPORT_RECEIVED",message.path("action").asText());assertFalse(message.path("payload").has("reporterId"));
        verify(admin).sendMessage(sent.capture());assertEquals("REPORT_CREATED",new ObjectMapper().readTree(sent.getValue().getPayload()).path("action").asText());
    }
    @Test void classSnapshotsPushChangesAndRevokeAccessWithoutResettingAfk() throws Exception {
        var json=new ObjectMapper();var classes=mock(com.grammarquest.service.SocketClassroomService.class);
        var handler=new SystemSocketHandler(json,users,learning,matchmaker,arenaSocket,mock(com.grammarquest.service.LiveExamService.class),classes,mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var client=socket("guest");handler.afterConnectionEstablished(client);
        when(classes.id(any(),eq("classId"))).thenReturn(1L);
        when(classes.snapshot("guest",1L,null)).thenReturn(java.util.Map.of("classroom",java.util.Map.of("id",1L,"name","Original"),"messages",java.util.List.of()));
        handler.handleTextMessage(client,new TextMessage("{\"action\":\"CLASS_OPEN\",\"payload\":{\"classId\":1}}"));
        long interaction=handler.clientDetails().getFirst().lastInteractionAt();clearInvocations(client);
        when(classes.snapshot("guest",1L,null)).thenReturn(java.util.Map.of("classroom",java.util.Map.of("id",1L,"name","Renamed"),"messages",java.util.List.of(java.util.Map.of("body","Hello"))));
        handler.pushClassroomUpdates();handler.pushClassroomUpdates();
        var sent=ArgumentCaptor.forClass(TextMessage.class);verify(client).sendMessage(sent.capture());
        assertEquals("CLASS_UPDATE",json.readTree(sent.getValue().getPayload()).path("action").asText());
        assertEquals("Renamed",json.readTree(sent.getValue().getPayload()).path("payload").path("classroom").path("name").asText());
        assertEquals(interaction,handler.clientDetails().getFirst().lastInteractionAt());
        when(classes.snapshot("guest",1L,null)).thenThrow(new com.grammarquest.exception.ApiException(org.springframework.http.HttpStatus.FORBIDDEN,"FORBIDDEN","Removed"));
        clearInvocations(client);handler.pushClassroomUpdates();handler.pushClassroomUpdates();
        verify(client).sendMessage(sent.capture());assertEquals("CLASS_ERROR",json.readTree(sent.getValue().getPayload()).path("action").asText());
        handler.handleTextMessage(client,new TextMessage("{\"action\":\"CLASS_UNWATCH\"}"));clearInvocations(classes);
        handler.pushClassroomUpdates();verifyNoInteractions(classes);
    }
    @Test void examPushReplacesSnapshotWithoutTouchingIdleAndReleasesOnUnwatch() throws Exception {
        var json=new ObjectMapper();var exams=mock(com.grammarquest.service.LiveExamService.class);
        var handler=new SystemSocketHandler(json,users,learning,matchmaker,arenaSocket,exams,mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var client=socket("guest");handler.afterConnectionEstablished(client);
        var data=new java.util.LinkedHashMap<String,Object>();data.put("id",7L);data.put("owner",false);data.put("version",1L);data.put("questions",json.readTree("[{\"id\":\"q1\",\"prompt\":\"Old prompt\"}]"));
        when(exams.action(eq("guest"),eq("EXAM_OPEN"),any())).thenReturn(data);
        handler.handleTextMessage(client,new TextMessage("{\"action\":\"EXAM_OPEN\",\"payload\":{\"examId\":7},\"requestId\":\"r1\"}"));
        assertEquals(7L,handler.clientDetails().getFirst().activeExamId());
        assertEquals(1,handler.clientDetails().getFirst().allocatedExamQuestions());
        long interaction=handler.clientDetails().getFirst().lastInteractionAt();
        var next=new java.util.LinkedHashMap<>(data);next.put("version",2L);next.put("questions",json.readTree("[{\"id\":\"q1\",\"prompt\":\"Updated live\"}]"));
        when(exams.view("guest",7L)).thenReturn(next);clearInvocations(client);
        handler.pushExamUpdates();handler.pushExamUpdates();
        var sent=ArgumentCaptor.forClass(TextMessage.class);verify(client).sendMessage(sent.capture());
        assertEquals("EXAM_UPDATE",json.readTree(sent.getValue().getPayload()).path("action").asText());
        assertEquals("Updated live",json.readTree(sent.getValue().getPayload()).path("payload").path("questions").get(0).path("prompt").asText());
        assertEquals(interaction,handler.clientDetails().getFirst().lastInteractionAt());
        handler.handleTextMessage(client,new TextMessage("{\"action\":\"EXAM_UNWATCH\"}"));
        assertNull(handler.clientDetails().getFirst().activeExamId());clearInvocations(client);
        handler.pushExamUpdates();verify(client,never()).sendMessage(any());
        assertTrue(handler.networkEvents().stream().anyMatch(e->e.message().contains("Thu hồi snapshot kiểm tra")));
    }
    @Test
    void arenaPushIsPersonalizedAndStopsAfterUnsubscribe() throws Exception {
        var handler=new SystemSocketHandler(new ObjectMapper(),users,learning,matchmaker,arenaSocket,mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var alice=socket("guest");var bob=socket("admin");
        handler.afterConnectionEstablished(alice);handler.afterConnectionEstablished(bob);
        var open=new ObjectMapper().readTree("{\"roomId\":7}");
        when(arenaSocket.action(eq("guest"),eq("ARENA_OPEN"),any())).thenReturn(java.util.Map.of("id",7L));
        when(arenaSocket.action(eq("admin"),eq("ARENA_OPEN"),any())).thenReturn(java.util.Map.of("id",7L));
        handler.handleTextMessage(alice,new TextMessage("{\"action\":\"ARENA_OPEN\",\"payload\":"+open+"}"));
        handler.handleTextMessage(bob,new TextMessage("{\"action\":\"ARENA_OPEN\",\"payload\":"+open+"}"));
        when(arenaSocket.room("guest",7L)).thenReturn(java.util.Map.of("id",7L,"stateVersion",1L,"status","IN_PROGRESS","myAnswer","A"));
        when(arenaSocket.room("admin",7L)).thenReturn(java.util.Map.of("id",7L,"stateVersion",1L,"status","IN_PROGRESS","myAnswer","B"));
        when(arenaSocket.messages(anyString(),eq(7L))).thenReturn(java.util.List.of());
        clearInvocations(alice,bob);
        handler.pushArenaUpdates();
        var sent=ArgumentCaptor.forClass(TextMessage.class);
        verify(alice,times(2)).sendMessage(sent.capture());
        assertEquals("A",new ObjectMapper().readTree(sent.getAllValues().get(0).getPayload()).path("payload").path("myAnswer").asText());
        verify(bob,times(2)).sendMessage(any());
        handler.pushArenaUpdates();
        verify(alice,times(2)).sendMessage(any()); // Không đẩy lại snapshot cùng version.
        handler.handleTextMessage(alice,new TextMessage("{\"action\":\"ARENA_UNWATCH\"}"));
        clearInvocations(alice);
        handler.pushArenaUpdates();
        verify(alice,never()).sendMessage(any());
    }
    private final com.grammarquest.service.SocketArenaService arenaSocket=mock(com.grammarquest.service.SocketArenaService.class);
    private final com.grammarquest.service.ArenaMatchmaker matchmaker=mock(com.grammarquest.service.ArenaMatchmaker.class);
    @Test
    void idleReminderIsPrivateAndSentOnceUntilNextInteraction() throws Exception {
        var handler=new SystemSocketHandler(new ObjectMapper(),users,learning,matchmaker,arenaSocket,mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var client=socket("guest");
        handler.afterConnectionEstablished(client);
        long last=handler.clientDetails().get(0).lastInteractionAt();
        handler.remindIdleClients(last+119_999);
        verify(client,never()).sendMessage(any());
        handler.remindIdleClients(last+120_000);
        handler.remindIdleClients(last+150_000);
        var sent=ArgumentCaptor.forClass(TextMessage.class);
        verify(client).sendMessage(sent.capture());
        assertEquals("IDLE_REMINDER",new ObjectMapper().readTree(sent.getValue().getPayload()).path("action").asText());
        assertEquals(last,handler.clientDetails().get(0).lastInteractionAt());
        handler.handleTextMessage(client,new TextMessage("{\"action\":\"CLIENT_INTERACTION\"}"));
        handler.remindIdleClients(handler.clientDetails().get(0).lastInteractionAt()+120_000);
        verify(client,times(2)).sendMessage(any());
        var other=socket("admin");
        handler.afterConnectionEstablished(other);
        handler.remindIdleClients(System.currentTimeMillis()+180_000);
        verify(other,never()).sendMessage(any());
    }
    @Test
    void afkTimeoutClosesSocketAndReleasesResources() throws Exception {
        var handler=new SystemSocketHandler(new ObjectMapper(),users,learning,matchmaker,arenaSocket,mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var client=socket("guest");
        handler.afterConnectionEstablished(client);
        handler.maintainConnections(System.currentTimeMillis()+901_000);
        verify(client).close(new CloseStatus(4001,"Idle timeout"));
        assertTrue(handler.clientDetails().isEmpty());
        assertEquals(0,handler.connectionCount());
        assertTrue(handler.networkEvents().stream().anyMatch(e->e.level().equals("WARNING")&&e.message().contains("15 phút")));
    }

    @Test
    void missingPongIsDifferentFromAfkAndDoesNotResetInteractionTime() throws Exception {
        var handler=new SystemSocketHandler(new ObjectMapper(),users,learning,matchmaker,arenaSocket,mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var client=socket("guest");
        handler.afterConnectionEstablished(client);
        long interaction=handler.clientDetails().get(0).lastInteractionAt();
        handler.handlePongMessage(client,new PongMessage());
        assertEquals(interaction,handler.clientDetails().get(0).lastInteractionAt());
        handler.maintainConnections(System.currentTimeMillis()+91_000);
        verify(client).close(new CloseStatus(4002,"Heartbeat timeout"));
        assertTrue(handler.clientDetails().isEmpty());
    }

    @Test
    void networkLogHasBoundedMemory() {
        var events=new NetworkEventLog();
        for(int i=0;i<250;i++) events.add("INFO","event "+i);
        assertEquals(200,events.snapshot().size());
        assertEquals(51,events.snapshot().getFirst().id());
        assertEquals(250,events.snapshot().getLast().id());
    }
    private final com.grammarquest.service.SocketLearningService learning = mock(com.grammarquest.service.SocketLearningService.class);
    private final UserRepository users = mock(UserRepository.class);
    @Test
    void onlyAdminsReceiveTelemetryAndDisconnectReleasesMemory() throws Exception {
        var json = new ObjectMapper();
        var handler = new SystemSocketHandler(json, users, learning, matchmaker, arenaSocket, mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var admin = socket("admin");
        var guest = socket("guest");
        handler.afterConnectionEstablished(admin);
        handler.afterConnectionEstablished(guest);
        handler.handleTextMessage(admin, new TextMessage("{\"action\":\"AUTH\",\"payload\":{\"role\":\"ADMIN\"}}"));
        new ServerMonitorService(handler, json).broadcastStats();
        var sent = ArgumentCaptor.forClass(TextMessage.class);
        verify(admin).sendMessage(sent.capture());
        verify(guest, never()).sendMessage(any());
        var body = json.readTree(sent.getValue().getPayload());
        assertEquals("STATS_UPDATE", body.path("action").asText());
        assertEquals(2, body.path("data").path("connections").asInt());
        assertEquals("admin", body.path("data").path("accounts").get(0).path("username").asText());
        assertTrue(body.path("data").path("ram").asDouble() >= 0);
        handler.afterConnectionClosed(admin, CloseStatus.NORMAL);
        handler.afterConnectionClosed(admin, CloseStatus.NORMAL);
        assertEquals(1, handler.connectionCount());
        handler.handleTransportError(guest, new IllegalStateException("network lost"));
        assertEquals(0, handler.connectionCount());
        verify(guest).close(CloseStatus.SERVER_ERROR);
    }

    @Test
    void roleCanBeDowngradedAndInvalidJsonReleasesSession() throws Exception {
        var handler = new SystemSocketHandler(new ObjectMapper(), users, learning, matchmaker, arenaSocket, mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var client = socket("client");
        handler.afterConnectionEstablished(client);
        handler.handleTextMessage(client, new TextMessage("{\"action\":\"AUTH\",\"payload\":{\"role\":\"ADMIN\"}}"));
        handler.handleTextMessage(client, new TextMessage("{\"action\":\"AUTH\",\"payload\":{\"role\":\"GUEST\"}}"));
        handler.broadcastToAdmins("{}");
        verify(client, never()).sendMessage(any());
        handler.handleTextMessage(client, new TextMessage("invalid json"));
        assertEquals(0, handler.connectionCount());
        verify(client).close(CloseStatus.BAD_DATA);
    }

    private WebSocketSession socket(String id) {
        var user = new User(id, id, "unused");
        user.id = id.equals("admin") ? 1L : 2L;
        user.role = id.equals("admin") ? "ADMIN" : "LEARNER";
        when(users.findByUsernameIgnoreCase(id)).thenReturn(Optional.of(user));
        var session = mock(WebSocketSession.class);
        when(session.getPrincipal()).thenReturn(() -> id);
        when(session.getId()).thenReturn(id);
        when(session.isOpen()).thenReturn(true);
        return session;
    }

    @Test
    void multipleTabsCountOnceAndLearnerCannotSubscribeAsAdmin() throws Exception {
        var handler = new SystemSocketHandler(new ObjectMapper(), users, learning, matchmaker, arenaSocket, mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var first = socket("guest");
        var second = socket("guest");
        when(second.getId()).thenReturn("second-tab");
        handler.afterConnectionEstablished(first);
        handler.afterConnectionEstablished(second);
        assertEquals(2, handler.connectionCount());
        assertEquals(1, handler.onlineAccounts().size());
        assertEquals(2L, handler.onlineAccounts().get(0).id());
        handler.handleTextMessage(first, new TextMessage("{\"action\":\"AUTH\",\"payload\":{\"role\":\"ADMIN\"}}"));
        handler.broadcastToAdmins("{}");
        verify(first, never()).sendMessage(any());
        handler.afterConnectionClosed(first, CloseStatus.NORMAL);
        assertEquals(1, handler.onlineAccounts().size());
        handler.afterConnectionClosed(second, CloseStatus.NORMAL);
        assertTrue(handler.onlineAccounts().isEmpty());
    }

    @Test
    void anonymousSocketIsRejected() throws Exception {
        var handler = new SystemSocketHandler(new ObjectMapper(), users, learning, matchmaker, arenaSocket, mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn("anonymous");
        when(session.isOpen()).thenReturn(true);
        handler.afterConnectionEstablished(session);
        verify(session).close(CloseStatus.POLICY_VIOLATION);
        assertEquals(0, handler.connectionCount());
    }

    @Test
    void learningRepliesOnlyToRequesterAndUpdatesActivity() throws Exception {
        var handler = new SystemSocketHandler(new ObjectMapper(), users, learning, matchmaker, arenaSocket, mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var client = socket("guest");
        var other = socket("admin");
        handler.afterConnectionEstablished(client);
        handler.afterConnectionEstablished(other);
        when(learning.roadmap("guest")).thenReturn(java.util.List.of());
        handler.handleTextMessage(client,new TextMessage("{\"action\":\"GET_ROADMAP\",\"requestId\":\"r1\"}"));
        assertEquals("VIEWING_ROADMAP",handler.currentActivity("guest"));
        var lesson = new com.grammarquest.service.LearningService.LessonView(12L,"topic","Topic",1,
            "Title","Summary","Theory TEXT",0,"BEGINNER","AVAILABLE",false);
        when(learning.theory("guest",12L)).thenReturn(lesson);
        handler.handleTextMessage(client,new TextMessage("{\"action\":\"VIEW_LESSON_THEORY\",\"requestId\":\"r2\",\"payload\":{\"lessonId\":12}}"));
        assertEquals("READING_LESSON_12",handler.currentActivity("guest"));
        var sent=ArgumentCaptor.forClass(TextMessage.class);
        verify(client,times(2)).sendMessage(sent.capture());
        var reply=new ObjectMapper().readTree(sent.getAllValues().get(1).getPayload());
        assertEquals("LESSON_THEORY_DATA",reply.path("action").asText());
        assertEquals("r2",reply.path("requestId").asText());
        assertEquals("Theory TEXT",reply.path("payload").path("theory").asText());
        verify(other,never()).sendMessage(any());
        handler.afterConnectionClosed(client,CloseStatus.NORMAL);
        assertNull(handler.currentActivity("guest"));
    }

    @Test
    void lockedLessonReturnsErrorWithoutUpdatingActivity() throws Exception {
        var handler=new SystemSocketHandler(new ObjectMapper(),users,learning,matchmaker,arenaSocket,mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var client=socket("guest");
        handler.afterConnectionEstablished(client);
        when(learning.theory("guest",12L)).thenThrow(new com.grammarquest.exception.ApiException(
            org.springframework.http.HttpStatus.FORBIDDEN,"LESSON_LOCKED","Bài học chưa mở khóa"));
        handler.handleTextMessage(client,new TextMessage("{\"action\":\"VIEW_LESSON_THEORY\",\"requestId\":\"locked\",\"payload\":{\"lessonId\":12}}"));
        var sent=ArgumentCaptor.forClass(TextMessage.class);
        verify(client).sendMessage(sent.capture());
        var reply=new ObjectMapper().readTree(sent.getValue().getPayload());
        assertEquals("ERROR",reply.path("action").asText());
        assertEquals("LESSON_LOCKED",reply.path("payload").path("code").asText());
        assertEquals("CONNECTED",handler.currentActivity("guest"));
    }

    @Test
    void activityDetailsAreSeparatePerTabAndInteractionDoesNotChangeLocation() throws Exception {
        var handler=new SystemSocketHandler(new ObjectMapper(),users,learning,matchmaker,arenaSocket,mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var client=socket("guest");
        var second=socket("guest");
        when(second.getId()).thenReturn("second-tab");
        handler.afterConnectionEstablished(client);
        handler.afterConnectionEstablished(second);
        when(learning.activity("guest","/attempts/9","")).thenReturn(
            new com.grammarquest.service.SocketLearningService.Activity("LESSON_BOSS","Câu điều kiện","Loại 1"));
        handler.handleTextMessage(client,new TextMessage("{\"action\":\"CLIENT_ACTIVITY\",\"payload\":{\"path\":\"/attempts/9\"}}"));
        handler.handleTextMessage(client,new TextMessage("{\"action\":\"CLIENT_INTERACTION\"}"));
        var details=handler.clientDetails();
        var active=details.stream().filter(d->d.sessionId().equals("guest")).findFirst().orElseThrow();
        assertEquals("LESSON_BOSS",active.currentActivity());
        assertEquals("Câu điều kiện",active.topic());
        assertEquals("Loại 1",active.lesson());
        assertEquals("/attempts/9",active.page());
        assertTrue(active.lastInteractionAt()<=System.currentTimeMillis());
        assertTrue(active.idleSeconds()>=0);
        assertEquals("CONNECTED",handler.currentActivity("second-tab"));
        assertEquals(1,handler.onlineAccounts().size());
        assertEquals(2,details.size());
    }

    @Test
    void socketAttemptAllocatesRamAndCompletionReleasesIt() throws Exception {
        var handler=new SystemSocketHandler(new ObjectMapper(),users,learning,matchmaker,arenaSocket,mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var client=socket("guest");
        handler.afterConnectionEstablished(client);
        var question=new com.grammarquest.service.LearningService.QuestionView(1,"MCQ","Question",java.util.List.of("a","b","c","d"),null,null,null,null);
        var running=new com.grammarquest.service.LearningService.AttemptView(9L,"LESSON_BOSS","IN_PROGRESS",12L,1,1,0,100,0,java.util.List.of(question));
        var done=new com.grammarquest.service.LearningService.AttemptView(9L,"LESSON_BOSS","WON",12L,1,1,1,0,50,java.util.List.of(question));
        when(learning.start("guest","LESSON_BOSS",12L)).thenReturn(running);
        when(learning.activity(eq("guest"),anyString(),eq(""))).thenReturn(new com.grammarquest.service.SocketLearningService.Activity("LESSON_BOSS","Topic","Lesson"));
        handler.handleTextMessage(client,new TextMessage("{\"action\":\"START_ATTEMPT\",\"requestId\":\"start\",\"payload\":{\"kind\":\"LESSON_BOSS\",\"lessonId\":12}}"));
        assertEquals(9L,handler.clientDetails().get(0).activeAttemptId());
        assertEquals(1,handler.clientDetails().get(0).allocatedQuestions());
        when(learning.answer("guest",9L,1,"A")).thenReturn(new com.grammarquest.service.LearningService.AnswerView(1,true,"A","Explanation",1,0,true,true,50));
        when(learning.attempt("guest",9L)).thenReturn(done);
        handler.handleTextMessage(client,new TextMessage("{\"action\":\"SUBMIT_ANSWER\",\"requestId\":\"answer\",\"payload\":{\"attemptId\":9,\"ordinalNo\":1,\"option\":\"A\"}}"));
        assertNull(handler.clientDetails().get(0).activeAttemptId());
        assertEquals(0,handler.clientDetails().get(0).allocatedQuestions());
        var sent=ArgumentCaptor.forClass(TextMessage.class);
        verify(client,times(2)).sendMessage(sent.capture());
        var result=new ObjectMapper().readTree(sent.getAllValues().get(1).getPayload());
        assertEquals("ANSWER_RESULT",result.path("action").asText());
        assertTrue(result.path("payload").path("finished").asBoolean());
    }

    @Test
    void loadingSomeoneElsesAttemptReturnsErrorWithoutAllocatingRam() throws Exception {
        var handler=new SystemSocketHandler(new ObjectMapper(),users,learning,matchmaker,arenaSocket,mock(com.grammarquest.service.LiveExamService.class),mock(com.grammarquest.service.SocketClassroomService.class),mock(com.grammarquest.service.LearnerReportService.class),mock(com.grammarquest.security.AnswerRateLimiter.class),mock(com.grammarquest.service.ArenaSnapshotStore.class));
        var client=socket("guest");
        handler.afterConnectionEstablished(client);
        when(learning.attempt("guest",99L)).thenThrow(new com.grammarquest.exception.ApiException(
            org.springframework.http.HttpStatus.FORBIDDEN,"FORBIDDEN","Không thể xem lượt làm này"));
        handler.handleTextMessage(client,new TextMessage("{\"action\":\"GET_ATTEMPT\",\"requestId\":\"other\",\"payload\":{\"attemptId\":99}}"));
        assertNull(handler.clientDetails().get(0).activeAttemptId());
        var sent=ArgumentCaptor.forClass(TextMessage.class);
        verify(client).sendMessage(sent.capture());
        assertEquals("FORBIDDEN",new ObjectMapper().readTree(sent.getValue().getPayload()).path("payload").path("code").asText());
    }
}
