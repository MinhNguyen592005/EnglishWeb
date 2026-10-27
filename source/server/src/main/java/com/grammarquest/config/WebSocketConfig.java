package com.grammarquest.config;

import com.grammarquest.websocket.SystemSocketHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocket
@EnableScheduling
public class WebSocketConfig implements WebSocketConfigurer {
    @org.springframework.beans.factory.annotation.Value("${app.allowed-origin}")
    private String allowedOrigin;
    private final SystemSocketHandler handler;
    private final com.grammarquest.security.SocketSessionRegistry sessions;
    public WebSocketConfig(SystemSocketHandler handler,com.grammarquest.security.SocketSessionRegistry sessions) { this.handler = handler;this.sessions=sessions; }
    @Bean
    org.springframework.boot.web.servlet.ServletListenerRegistrationBean<com.grammarquest.security.SocketSessionRegistry> sessionListener(){return new org.springframework.boot.web.servlet.ServletListenerRegistrationBean<>(sessions);}

    @Bean
    org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean socketContainer() {
        var container=new org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean();
        container.setMaxTextMessageBufferSize(131072); // Đề tối đa 30 câu, kể cả văn bản Unicode UTF-8.
        return container;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(sessions.decorate(handler), "/api/ws-system").setAllowedOrigins(allowedOrigin.split("\\s*,\\s*")).addInterceptors(sessions.handshake());

    }

    // Security chain riêng cho raw WebSocket; binding HTTP session dùng chung với STOMP.
    @Bean
    @Order(1)
    SecurityFilterChain systemSocketSecurity(HttpSecurity http) throws Exception {
        return http.securityMatcher("/api/ws-system")
            .cors(cors -> cors.disable())
            .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
            .build();
    }
}
