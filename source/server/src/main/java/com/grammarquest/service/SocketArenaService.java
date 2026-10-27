package com.grammarquest.service;

import com.grammarquest.controller.ArenaChatController;
import com.grammarquest.controller.ArenaController;
import com.grammarquest.exception.ApiException;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Service;

@Service
public class SocketArenaService {

    private final ArenaController arena;
    private final ArenaChatController chat;
    private final JdbcTemplate db;

    public SocketArenaService(ArenaController arena, ArenaChatController chat, JdbcTemplate db) {
        this.arena = arena;
        this.chat = chat;
        this.db = db;
    }

    private org.springframework.security.core.Authentication auth(String name) {
        return new UsernamePasswordAuthenticationToken(name, null, List.of());
    }

    private String text(com.fasterxml.jackson.databind.JsonNode node, String key, int max) {
        var value = node.path(key);
        if (
            !value.isTextual() || value.asText().isBlank() || value.asText().length() > max
        ) throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "INVALID_PAYLOAD",
            "Thông tin " + key + " không hợp lệ"
        );
        return value.asText();
    }

    private long id(com.fasterxml.jackson.databind.JsonNode node, String key) {
        var value = node.path(key);
        if (
            !value.isIntegralNumber() || !value.canConvertToLong() || value.asLong() < 1
        ) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_ID", "ID không hợp lệ");
        return value.asLong();
    }

    public Object action(
        String username,
        String action,
        com.fasterxml.jackson.databind.JsonNode body
    ) {
        var user = auth(username);
        return switch (action) {
            case "ARENA_OPEN" -> body.hasNonNull("roomId")
                ? arena.get(user, id(body, "roomId"))
                : arena.mine(user);
            case "ARENA_HISTORY" -> arena.history(user);
            case "ARENA_LEADERBOARD" -> arena.leaderboard(user);
            case "ARENA_COSMETICS" -> arena.cosmetics(user);
            case "ARENA_EQUIP_COSMETIC" -> arena.equipCosmetic(
                user,
                new ArenaController.EquipCosmetic(text(body, "code", 50))
            );
            case "ARENA_CREATE" -> arena.create(user);
            case "ARENA_JOIN" -> arena.join(user, new ArenaController.Join(text(body, "code", 12)));
            case "ARENA_CONFIRM" -> arena.confirm(user, id(body, "roomId"));
            case "ARENA_DECLINE" -> arena.decline(user, id(body, "roomId"));
            case "ARENA_READY" -> {
                if (!body.path("ready").isBoolean()) throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_READY",
                    "Trạng thái sẵn sàng không hợp lệ"
                );
                yield arena.ready(
                    user,
                    id(body, "roomId"),
                    new ArenaController.Ready(body.path("ready").asBoolean())
                );
            }
            case "ARENA_START" -> arena.start(user, id(body, "roomId"));
            case "ARENA_ANSWER" -> {
                long round = id(body, "roundNo");
                if (round > 10) throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_ROUND",
                    "Vòng không hợp lệ"
                );
                yield arena.answer(
                    user,
                    id(body, "roundNo" != null ? "roomId" : "roomId"),
                    new ArenaController.Answer((int) round, text(body, "option", 1))
                );
            }
            case "ARENA_LEAVE" -> arena.leave(user, id(body, "roomId"));
            case "ARENA_MESSAGES" -> chat.list(user, id(body, "roomId"));
            case "ARENA_CHAT" -> chat.send(
                user,
                id(body, "roomId"),
                new ArenaChatController.NewMessage(text(body, "body", 1000))
            );
            case "ARENA_REPORT" -> chat.report(
                user,
                id(body, "roomId"),
                id(body, "messageId"),
                new ArenaChatController.Report(text(body, "reason", 500))
            );
            default -> throw new ApiException(
                HttpStatus.BAD_REQUEST,
                "UNKNOWN_ACTION",
                "Action PvP không hợp lệ"
            );
        };
    }

    public Map<String, Object> room(String username, long id) {
        return arena.get(auth(username), id);
    }

    public List<Map<String, Object>> messages(String username, long id) {
        return chat.list(auth(username), id);
    }

    public void advance() {
        db.queryForList(
            "select id from arena_rooms where status in ('CONFIRMING','IN_PROGRESS')",
            Long.class
        ).forEach(id -> {
            try {
                arena.advance(id);
            } catch (RuntimeException ex) {
                org.slf4j.LoggerFactory.getLogger(getClass()).warn(
                    "Cannot advance arena {}",
                    id,
                    ex
                );
            }
        });
    }
}
