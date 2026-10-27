package com.grammarquest.controller;

import com.grammarquest.controller.ArenaChatController;
import com.grammarquest.controller.ArenaController;
import com.grammarquest.controller.ClassroomController;
import com.grammarquest.exception.ApiException;
import java.security.Principal;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;

@Controller
public class RealtimeActions {

    private final com.grammarquest.security.ServerCapacity capacity;
    private final ArenaController arena;
    private final ArenaChatController arenaChat;
    private final ClassroomController classrooms;
    private final SimpMessagingTemplate broker;

    public RealtimeActions(
        ArenaController arena,
        ArenaChatController arenaChat,
        ClassroomController classrooms,
        SimpMessagingTemplate broker,
        com.grammarquest.security.ServerCapacity capacity
    ) {
        this.capacity = capacity;
        this.arena = arena;
        this.arenaChat = arenaChat;
        this.classrooms = classrooms;
        this.broker = broker;
    }

    public record ArenaAction(
        String requestId,
        String action,
        Long roomId,
        String code,
        Boolean ready,
        Integer roundNo,
        String option,
        String body
    ) {}

    public record ClassMessage(String requestId, Long classId, String body) {}

    private Authentication auth(Principal principal) {
        if (principal == null) throw new ApiException(
            HttpStatus.UNAUTHORIZED,
            "UNAUTHENTICATED",
            "Vui lòng đăng nhập"
        );
        return new UsernamePasswordAuthenticationToken(principal.getName(), null, List.of());
    }

    private String require(String value, String name, int max) {
        if (value == null || value.isBlank() || value.length() > max) throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "INVALID_" + name.toUpperCase(),
            name + " không hợp lệ"
        );
        return value;
    }

    private long roomId(Long id) {
        if (id == null || id <= 0) throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "INVALID_ROOM",
            "Mã phòng không hợp lệ"
        );
        return id;
    }

    private void ack(Principal principal, String requestId, Object data, Exception error) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("requestId", requestId);
        payload.put("ok", error == null);
        if (error == null) payload.put("data", data);
        else {
            payload.put("code", error instanceof ApiException api ? api.code : "ACTION_FAILED");
            payload.put(
                "message",
                error instanceof ApiException
                    ? error.getMessage()
                    : "Không thể thực hiện hành động. Vui lòng thử lại."
            );
        }
        broker.convertAndSendToUser(principal.getName(), "/queue/actions", payload);
    }

    @MessageMapping("/arena/action")
    public void arena(Principal principal, @Payload ArenaAction action) {
        if (principal == null) return;
        String requestId = action == null ? null : action.requestId();
        if (!capacity.tryEnter()) {
            ack(
                principal,
                requestId,
                null,
                new ApiException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "SERVER_BUSY",
                    "Máy chủ đang bận. Vui lòng thử lại sau vài giây."
                )
            );
            return;
        }
        try {
            if (action == null || action.action() == null) throw new ApiException(
                HttpStatus.BAD_REQUEST,
                "INVALID_ACTION",
                "Thiếu hành động"
            );
            Authentication user = auth(principal);
            Object result = switch (action.action()) {
                case "CREATE" -> arena.create(user);
                case "JOIN" -> arena.join(
                    user,
                    new ArenaController.Join(require(action.code(), "code", 12))
                );
                case "CONFIRM" -> arena.confirm(user, roomId(action.roomId()));
                case "DECLINE" -> arena.decline(user, roomId(action.roomId()));
                case "READY" -> arena.ready(
                    user,
                    roomId(action.roomId()),
                    new ArenaController.Ready(Boolean.TRUE.equals(action.ready()))
                );
                case "START" -> arena.start(user, roomId(action.roomId()));
                case "ANSWER" -> arena.answer(
                    user,
                    roomId(action.roomId()),
                    new ArenaController.Answer(
                        action.roundNo() == null ? 0 : action.roundNo(),
                        require(action.option(), "option", 1)
                    )
                );
                case "LEAVE" -> arena.leave(user, roomId(action.roomId()));
                case "CHAT" -> arenaChat.send(
                    user,
                    roomId(action.roomId()),
                    new ArenaChatController.NewMessage(require(action.body(), "body", 1000))
                );
                default -> throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_ACTION",
                    "Hành động không hợp lệ"
                );
            };
            ack(principal, requestId, result, null);
        } catch (Exception error) {
            ack(principal, requestId, null, error);
        } finally {
            capacity.leave();
        }
    }

    @MessageMapping("/classes/message")
    public void classMessage(Principal principal, @Payload ClassMessage message) {
        if (principal == null) return;
        String requestId = message == null ? null : message.requestId();
        if (!capacity.tryEnter()) {
            ack(
                principal,
                requestId,
                null,
                new ApiException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "SERVER_BUSY",
                    "Máy chủ đang bận. Vui lòng thử lại sau vài giây."
                )
            );
            return;
        }
        try {
            if (
                message == null || message.classId() == null || message.classId() <= 0
            ) throw new ApiException(
                HttpStatus.BAD_REQUEST,
                "INVALID_CLASS",
                "Lớp học không hợp lệ"
            );
            Object result = classrooms.message(
                auth(principal),
                message.classId(),
                new ClassroomController.Message(require(message.body(), "body", 1000))
            );
            ack(principal, requestId, result, null);
        } catch (Exception error) {
            ack(principal, requestId, null, error);
        } finally {
            capacity.leave();
        }
    }
}
