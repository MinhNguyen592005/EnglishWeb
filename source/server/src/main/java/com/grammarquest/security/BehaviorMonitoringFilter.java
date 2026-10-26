package com.grammarquest.security;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;

public class BehaviorMonitoringFilter extends OncePerRequestFilter {
    private final BehaviorMonitor monitor;
    private final com.grammarquest.repository.UserRepository users;
    private final com.fasterxml.jackson.databind.ObjectMapper json;
    public BehaviorMonitoringFilter(BehaviorMonitor monitor,com.grammarquest.repository.UserRepository users,com.fasterxml.jackson.databind.ObjectMapper json){this.monitor=monitor;this.users=users;this.json=json;}
    @Override protected boolean shouldNotFilter(HttpServletRequest request){return !request.getServletPath().startsWith("/api/");}
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)throws ServletException,IOException{
        var auth=SecurityContextHolder.getContext().getAuthentication();
        String username=auth!=null&&auth.isAuthenticated()&&!(auth instanceof AnonymousAuthenticationToken)?auth.getName():null;
        // Peer address comes from the server, never an arbitrary X-Forwarded-For header.
        String address=request.getRemoteAddr();
        monitor.observe(BehaviorMonitor.Rule.REQUEST_BURST,username,address,null);
        if(username!=null){
            var user=users.findByUsernameIgnoreCase(username).orElse(null);
            if(user==null||user.locked){
                var session=request.getSession(false);if(session!=null)session.invalidate();
                SecurityContextHolder.clearContext();
                response.setStatus(403);response.setContentType("application/json;charset=UTF-8");
                json.writeValue(response.getWriter(),java.util.Map.of("code","ACCOUNT_LOCKED","message","Tài khoản không còn khả dụng hoặc đã bị khóa. Vui lòng liên hệ quản trị viên."));return;
            }
        }
        if("POST".equals(request.getMethod())&&request.getServletPath().matches("/api/v1/(classes/[0-9]+/messages|arena/rooms/[0-9]+/messages)"))
            monitor.observe(BehaviorMonitor.Rule.CHAT_SPAM,username,address,null);
        try{chain.doFilter(request,response);}
        finally{
            if("/api/v1/auth/login".equals(request.getServletPath())&&"POST".equals(request.getMethod())&&response.getStatus()==401)
                monitor.observe(BehaviorMonitor.Rule.LOGIN_FAILURES,null,address,null);
            else if(response.getStatus()==403)
                monitor.observe(BehaviorMonitor.Rule.ACCESS_DENIED,username,address,null);
        }
    }
}
