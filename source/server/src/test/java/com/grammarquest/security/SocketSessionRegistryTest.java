package com.grammarquest.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import jakarta.servlet.http.HttpSessionEvent;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.server.*;
import org.springframework.mock.web.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.socket.*;

class SocketSessionRegistryTest {

    @Test
    void expiryRevokesSocketAndMessagesRequireLiveSession() throws Exception {
        var events = mock(ApplicationEventPublisher.class);
        var registry = new SocketSessionRegistry(events);
        var http = new MockHttpSession();
        var auth = new UsernamePasswordAuthenticationToken("alice", null, List.of());
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(auth);
        http.setAttribute(
            HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,
            context
        );
        var request = new MockHttpServletRequest();
        request.setSession(http);
        request.setUserPrincipal(auth);
        Map<String, Object> attrs = new HashMap<>();
        var delegate = mock(WebSocketHandler.class);
        assertTrue(
            registry
                .handshake()
                .beforeHandshake(
                    new ServletServerHttpRequest(request),
                    new ServletServerHttpResponse(new MockHttpServletResponse()),
                    delegate,
                    attrs
                )
        );
        var socket = mock(WebSocketSession.class);
        when(socket.getId()).thenReturn("s1");
        when(socket.getAttributes()).thenReturn(attrs);
        when(socket.getPrincipal()).thenReturn(auth);
        var bound = registry.decorate(delegate);
        bound.afterConnectionEstablished(socket);
        assertEquals(1, registry.size());
        http.invalidate();
        registry.sessionDestroyed(new HttpSessionEvent(http));
        verify(socket).close(new CloseStatus(4004, "Session ended"));
        assertEquals(0, registry.size());
        bound.handleMessage(socket, new TextMessage("test"));
        verify(delegate, never()).handleMessage(any(), any());
    }
}
