package com.grammarquest.security;

import org.junit.jupiter.api.*;
import org.springframework.mock.web.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import static org.mockito.Mockito.*;

class BehaviorMonitoringFilterTest {
    @AfterEach void clear(){SecurityContextHolder.clearContext();}
    @Test void failedLoginUsesPeerAddressAndNeverClientSuppliedIdentity()throws Exception{
        var monitor=mock(BehaviorMonitor.class);var filter=new BehaviorMonitoringFilter(monitor,mock(com.grammarquest.repository.UserRepository.class),new com.fasterxml.jackson.databind.ObjectMapper());
        var request=new MockHttpServletRequest("POST","/api/v1/auth/login");request.setServletPath("/api/v1/auth/login");
        request.setRemoteAddr("10.0.0.2");request.addHeader("X-Forwarded-For","attacker-controlled");
        request.setContent("{\"username\":\"victim\"}".getBytes());
        filter.doFilter(request,new MockHttpServletResponse(),(req,res)->((jakarta.servlet.http.HttpServletResponse)res).setStatus(401));
        verify(monitor).observe(BehaviorMonitor.Rule.LOGIN_FAILURES,null,"10.0.0.2",null);
        verify(monitor).observe(BehaviorMonitor.Rule.REQUEST_BURST,null,"10.0.0.2",null);
        verifyNoMoreInteractions(monitor);
    }
    @Test void forbiddenChatCountsAgainstAuthenticatedAccount()throws Exception{
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("alice","",java.util.List.of()));
        var monitor=mock(BehaviorMonitor.class);var request=new MockHttpServletRequest("POST","/api/v1/classes/1/messages");
        request.setServletPath("/api/v1/classes/1/messages");request.setRemoteAddr("10.0.0.2");
        var users=mock(com.grammarquest.repository.UserRepository.class);
        when(users.findByUsernameIgnoreCase("alice")).thenReturn(java.util.Optional.of(new com.grammarquest.entity.User("alice","Alice","hash")));
        new BehaviorMonitoringFilter(monitor,users,new com.fasterxml.jackson.databind.ObjectMapper()).doFilter(request,new MockHttpServletResponse(),(req,res)->((jakarta.servlet.http.HttpServletResponse)res).setStatus(403));
        verify(monitor).observe(BehaviorMonitor.Rule.CHAT_SPAM,"alice","10.0.0.2",null);
        verify(monitor).observe(BehaviorMonitor.Rule.ACCESS_DENIED,"alice","10.0.0.2",null);
    }
    @Test void lockedAccountCannotReuseHttpSessionForAnyApi()throws Exception{
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("alice","",java.util.List.of()));
        var user=new com.grammarquest.entity.User("alice","Alice","hash");user.locked=true;
        var users=mock(com.grammarquest.repository.UserRepository.class);when(users.findByUsernameIgnoreCase("alice")).thenReturn(java.util.Optional.of(user));
        var request=new MockHttpServletRequest("GET","/api/v1/daily-quests");request.setServletPath("/api/v1/daily-quests");
        var session=new MockHttpSession();request.setSession(session);var response=new MockHttpServletResponse();
        var chain=mock(jakarta.servlet.FilterChain.class);
        new BehaviorMonitoringFilter(mock(BehaviorMonitor.class),users,new com.fasterxml.jackson.databind.ObjectMapper()).doFilter(request,response,chain);
        org.junit.jupiter.api.Assertions.assertEquals(403,response.getStatus());
        org.junit.jupiter.api.Assertions.assertTrue(response.getContentAsString().contains("ACCOUNT_LOCKED"));
        org.junit.jupiter.api.Assertions.assertTrue(session.isInvalid());verifyNoInteractions(chain);
    }
}
