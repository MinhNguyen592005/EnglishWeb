package com.grammarquest.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.Map;
import org.springframework.web.filter.OncePerRequestFilter;

public class CapacityFilter extends OncePerRequestFilter {
    private final ServerCapacity capacity;
    private final ObjectMapper json;
    public CapacityFilter(ServerCapacity capacity,ObjectMapper json){this.capacity=capacity;this.json=json;}
    @Override protected boolean shouldNotFilter(HttpServletRequest request){return !request.getServletPath().startsWith("/api/v1/");}
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)throws ServletException,IOException {
        if(!capacity.tryEnter()){
            response.setStatus(503);response.setHeader("Retry-After","3");response.setContentType("application/json;charset=UTF-8");
            json.writeValue(response.getWriter(),Map.of("code","SERVER_BUSY","message","Máy chủ đang bận. Vui lòng thử lại sau vài giây.","retryAfterSeconds",3));return;
        }
        try{chain.doFilter(request,response);}finally{capacity.leave();}
    }
}
