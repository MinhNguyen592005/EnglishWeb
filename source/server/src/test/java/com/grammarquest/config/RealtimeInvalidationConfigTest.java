package com.grammarquest.config;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;

class RealtimeInvalidationConfigTest {
    @Test
    void onlySuccessfulAuthenticatedMutationsInvalidateReaders() throws Exception {
        var events = mock(ApplicationEventPublisher.class);
        var captured = new java.util.ArrayList<HandlerInterceptor>();
        var registry = new InterceptorRegistry() {
            @Override
            public org.springframework.web.servlet.config.annotation.InterceptorRegistration addInterceptor(HandlerInterceptor interceptor) {
                captured.add(interceptor);
                return super.addInterceptor(interceptor);
            }
        };
        new RealtimeInvalidationConfig(events).addInterceptors(registry);
        var interceptor = captured.getFirst();
        var request = new MockHttpServletRequest("POST", "/api/v1/classes");
        request.setUserPrincipal(() -> "teacher");
        var response = new MockHttpServletResponse();
        interceptor.afterCompletion(request, response, new Object(), null);
        verify(events).publishEvent(new RealtimeInvalidationConfig.Changed("*"));
        reset(events);
        request.setRequestURI("/api/v1/daily-quests/1/claim");
        interceptor.afterCompletion(request, response, new Object(), null);
        verify(events).publishEvent(new RealtimeInvalidationConfig.Changed("teacher"));
        reset(events);
        response.setStatus(403);
        interceptor.afterCompletion(request, response, new Object(), null);
        response.setStatus(200);
        request.setMethod("GET");
        interceptor.afterCompletion(request, response, new Object(), null);
        request.setMethod("POST");
        request.setRequestURI("/api/v1/auth/login");
        interceptor.afterCompletion(request, response, new Object(), null);
        request.setRequestURI("/api/v1/classes");
        request.setUserPrincipal(null);
        interceptor.afterCompletion(request, response, new Object(), null);
        verifyNoInteractions(events);
    }
}
