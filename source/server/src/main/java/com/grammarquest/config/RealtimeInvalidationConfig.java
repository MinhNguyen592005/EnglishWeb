package com.grammarquest.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Notify open views after successful REST mutations; data is reloaded with normal authorization. */
@Configuration
public class RealtimeInvalidationConfig implements WebMvcConfigurer {
    public record Changed(String username) {}
    private final ApplicationEventPublisher events;

    public RealtimeInvalidationConfig(ApplicationEventPublisher events) {
        this.events = events;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
            @Override
            public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                        Object handler, Exception exception) {
                if (exception != null || response.getStatus() >= 300 ||
                    !java.util.Set.of("POST", "PUT", "PATCH", "DELETE").contains(request.getMethod()) ||
                    request.getUserPrincipal() == null) return;
                String path = request.getRequestURI();
                if (path.contains("/auth/")) return;
                boolean personal = path.contains("/daily-quests") || path.contains("/cosmetics");
                events.publishEvent(new Changed(personal ? request.getUserPrincipal().getName() : "*"));
            }
        }).addPathPatterns("/api/v1/**");
    }
}
