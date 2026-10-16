package com.grammarquest.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.*;
import org.springframework.stereotype.Component;
import org.springframework.core.annotation.Order;
import org.springframework.core.Ordered;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.UUID;

@Component @Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        String provided=request.getHeader("X-Request-Id");
        String id=provided!=null && provided.matches("[A-Za-z0-9-]{1,64}") ? provided : UUID.randomUUID().toString();
        request.setAttribute("requestId",id);
        response.setHeader("X-Request-Id",id);
        chain.doFilter(request,response);
    }
}
