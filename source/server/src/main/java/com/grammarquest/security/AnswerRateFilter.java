package com.grammarquest.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.grammarquest.exception.ApiException;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.Map;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public class AnswerRateFilter extends OncePerRequestFilter {

    private final AnswerRateLimiter limiter;
    private final ObjectMapper json;

    public AnswerRateFilter(AnswerRateLimiter limiter, ObjectMapper json) {
        this.limiter = limiter;
        this.json = json;
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain chain
    ) throws IOException, ServletException {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (
            "POST".equals(request.getMethod()) &&
            request
                .getServletPath()
                .matches("/api/v1/(attempts/[0-9]+|arena/rooms/[0-9]+)/answers") &&
            auth != null &&
            auth.isAuthenticated() &&
            !(auth instanceof AnonymousAuthenticationToken)
        ) {
            try {
                limiter.check(auth.getName());
            } catch (ApiException ex) {
                response.setStatus(429);
                response.setHeader("Retry-After", "10");
                response.setContentType("application/json;charset=UTF-8");
                json.writeValue(
                    response.getWriter(),
                    Map.of("code", ex.code, "message", ex.getMessage())
                );
                return;
            }
        }
        chain.doFilter(request, response);
    }
}
