package com.grammarquest.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class RealtimeConfig implements WebSocketMessageBrokerConfigurer {

    private final com.grammarquest.security.SocketSessionRegistry sessions;
    private final com.grammarquest.security.AnswerRateLimiter limiter;
    private final com.fasterxml.jackson.databind.ObjectMapper json;

    public RealtimeConfig(
        com.grammarquest.security.SocketSessionRegistry sessions,
        com.grammarquest.security.AnswerRateLimiter limiter,
        com.fasterxml.jackson.databind.ObjectMapper json
    ) {
        this.sessions = sessions;
        this.limiter = limiter;
        this.json = json;
    }

    @Override
    public void configureWebSocketTransport(
        org.springframework.web.socket.config.annotation.WebSocketTransportRegistration registration
    ) {
        registration.addDecoratorFactory(sessions::decorate);
    }

    @Value("${app.allowed-origin}")
    private String origin;

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry
            .addEndpoint("/ws")
            .setAllowedOrigins(origin.split("\\s*,\\s*"))
            .addInterceptors(sessions.handshake());
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/queue");
        registry.setUserDestinationPrefix("/user");
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(
            new ChannelInterceptor() {
                @Override
                public Message<?> preSend(Message<?> message, MessageChannel channel) {
                    var h = StompHeaderAccessor.wrap(message);
                    StompCommand command = h.getCommand();
                    if (command == StompCommand.CONNECT || command == StompCommand.SUBSCRIBE) {
                        if (h.getUser() == null) throw new IllegalArgumentException(
                            "Authentication required"
                        );
                        if (
                            command == StompCommand.SUBSCRIBE &&
                            !"/user/queue/arena".equals(h.getDestination()) &&
                            !"/user/queue/classes".equals(h.getDestination()) &&
                            !"/user/queue/actions".equals(h.getDestination())
                        ) throw new IllegalArgumentException("Subscription denied");
                    }
                    if (
                        command == StompCommand.SEND &&
                        (h.getUser() == null ||
                            (!"/app/arena/action".equals(h.getDestination()) &&
                                !"/app/classes/message".equals(h.getDestination())))
                    ) throw new IllegalArgumentException("SEND destination denied");
                    if (
                        command == StompCommand.SEND &&
                        "/app/arena/action".equals(h.getDestination())
                    ) {
                        try {
                            var body = json.readTree(
                                message.getPayload() instanceof byte[] bytes
                                    ? new String(bytes, java.nio.charset.StandardCharsets.UTF_8)
                                    : message.getPayload().toString()
                            );
                            if ("ANSWER".equals(body.path("action").asText())) limiter.check(
                                h.getUser().getName()
                            );
                        } catch (com.fasterxml.jackson.core.JsonProcessingException ex) {
                            throw new IllegalArgumentException("Invalid JSON", ex);
                        }
                    }
                    return message;
                }
            }
        );
    }
}
