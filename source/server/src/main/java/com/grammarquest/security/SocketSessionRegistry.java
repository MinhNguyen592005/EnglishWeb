package com.grammarquest.security;

import jakarta.servlet.http.*;
import org.springframework.stereotype.Component;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.http.server.*;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Gắn cả raw WebSocket và STOMP vào đúng HTTP session đã xác thực. */
@Component
public class SocketSessionRegistry implements HttpSessionListener,HttpSessionIdListener {
    private static final String KEY=SocketSessionRegistry.class.getName();
    private record Binding(HttpSession session,String id,String username) {}
    private final ConcurrentHashMap<String,WebSocketSession> sockets=new ConcurrentHashMap<>();
    @org.springframework.beans.factory.annotation.Autowired
    private ServerCapacity capacity;
    private final ApplicationEventPublisher events;
    public record Revoked(String socketId,int code,String reason) {}
    public SocketSessionRegistry(ApplicationEventPublisher events){this.events=events;}
    public HandshakeInterceptor handshake(){return new HandshakeInterceptor(){
        public boolean beforeHandshake(ServerHttpRequest request,ServerHttpResponse response,WebSocketHandler handler,Map<String,Object> attributes){
            if(!(request instanceof ServletServerHttpRequest servlet)||request.getPrincipal()==null)return false;
            HttpSession session=servlet.getServletRequest().getSession(false);if(session==null)return false;
            attributes.put(KEY,new Binding(session,session.getId(),request.getPrincipal().getName()));return true;
        }
        public void afterHandshake(ServerHttpRequest request,ServerHttpResponse response,WebSocketHandler handler,Exception error){}
    };}
    private boolean valid(WebSocketSession socket){
        if(!(socket.getAttributes().get(KEY) instanceof Binding b))return false;
        try{
            Object context=b.session().getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
            return b.id().equals(b.session().getId())&&context instanceof SecurityContext security&&security.getAuthentication()!=null&&security.getAuthentication().isAuthenticated()&&b.username().equals(security.getAuthentication().getName());
        }catch(IllegalStateException expired){return false;}
    }
    public WebSocketHandler decorate(WebSocketHandler delegate){return new WebSocketHandlerDecorator(delegate){
        @Override public void afterConnectionEstablished(WebSocketSession socket)throws Exception{
            if(!valid(socket)){socket.close(new CloseStatus(4004,"Session ended"));return;}
            if(capacity!=null&&!capacity.register(socket.getId(),socket.getPrincipal().getName())){socket.close(new CloseStatus(1013,"Server capacity reached"));return;}
            sockets.put(socket.getId(),socket);
            if(!valid(socket)){revoke(socket,4004,"Session ended");return;}
            try{super.afterConnectionEstablished(socket);}catch(Exception ex){sockets.remove(socket.getId());if(capacity!=null)capacity.unregister(socket.getId());throw ex;}
        }
        @Override public void handleMessage(WebSocketSession socket,WebSocketMessage<?> message)throws Exception{
            if(!valid(socket)){revoke(socket,4004,"Session ended");return;}super.handleMessage(socket,message);
        }
        @Override public void afterConnectionClosed(WebSocketSession socket,CloseStatus status)throws Exception{
            sockets.remove(socket.getId());if(capacity!=null)capacity.unregister(socket.getId());super.afterConnectionClosed(socket,status);
        }
    };}
    private void revoke(WebSocketSession socket,int code,String reason){
        if(sockets.remove(socket.getId(),socket)){
            if(capacity!=null)capacity.unregister(socket.getId());
            // Raw handler thu hồi RAM ngay; STOMP thu hồi qua afterConnectionClosed.
            events.publishEvent(new Revoked(socket.getId(),code,reason));
            try{socket.close(new CloseStatus(code,reason));}catch(Exception ignored){}
        }
    }
    private void revokeSession(String id){sockets.values().forEach(socket->{if(socket.getAttributes().get(KEY) instanceof Binding b&&b.id().equals(id))revoke(socket,4004,"Session ended");});}
    @Override public void sessionDestroyed(HttpSessionEvent event){revokeSession(event.getSession().getId());}
    @Override public void sessionIdChanged(HttpSessionEvent event,String oldId){revokeSession(oldId);}
    @org.springframework.context.event.EventListener
    public void throttled(AnswerRateLimiter.Limited event){sockets.values().forEach(socket->{if(socket.getPrincipal()!=null&&event.username().equalsIgnoreCase(socket.getPrincipal().getName()))revoke(socket,4005,"Answer rate exceeded");});}
    public int size(){return sockets.size();}
}
