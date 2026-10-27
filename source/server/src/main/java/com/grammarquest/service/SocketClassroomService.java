package com.grammarquest.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.grammarquest.controller.ClassroomController;
import com.grammarquest.exception.ApiException;
import jakarta.validation.Validator;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/** Socket adapter: dùng lại quyền/transaction nghiệp vụ, kiểm tra DTO vì không đi qua MVC @Valid. */
@Service
public class SocketClassroomService {

    private final ClassroomController classes;
    private final LearningService learning;
    private final Validator validator;

    public SocketClassroomService(
        ClassroomController classes,
        LearningService learning,
        Validator validator
    ) {
        this.classes = classes;
        this.learning = learning;
        this.validator = validator;
    }

    private Authentication auth(String name) {
        return new UsernamePasswordAuthenticationToken(name, null, List.of());
    }

    private ApiException invalid(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_CLASS_PAYLOAD", message);
    }

    public long id(JsonNode p, String key) {
        var v = p.path(key);
        if (!v.isIntegralNumber() || !v.canConvertToLong() || v.asLong() <= 0) throw invalid(
            "ID " + key + " không hợp lệ"
        );
        return v.asLong();
    }

    private String text(JsonNode p, String key, int max, boolean optional) {
        var v = p.path(key);
        if (optional && (v.isMissingNode() || v.isNull())) return "";
        if (
            !v.isTextual() || (!optional && v.asText().isBlank()) || v.asText().length() > max
        ) throw invalid("Trường " + key + " không hợp lệ");
        return v.asText().trim();
    }

    private int percent(JsonNode p) {
        var v = p.path("passPercent");
        if (!v.isInt()) throw invalid("Ngưỡng điểm không hợp lệ");
        return v.asInt();
    }

    private Instant due(JsonNode p) {
        try {
            return Instant.parse(text(p, "dueAt", 40, false));
        } catch (java.time.format.DateTimeParseException ex) {
            throw invalid("Hạn nộp không hợp lệ");
        }
    }

    private <T> T valid(T body) {
        var violations = validator.validate(body);
        if (!violations.isEmpty()) throw invalid(
            violations.iterator().next().getPropertyPath() +
                ": " +
                violations.iterator().next().getMessage()
        );
        return body;
    }

    public Object action(String username, String action, JsonNode p) {
        var user = auth(username);
        return switch (action) {
            case "CLASS_CREATE" -> classes.create(
                user,
                valid(new ClassroomController.NewClass(text(p, "name", 120, false)))
            );
            case "CLASS_JOIN" -> classes.join(
                user,
                valid(new ClassroomController.Join(text(p, "code", 12, false)))
            );
            case "CLASS_RENAME" -> classes.rename(
                user,
                id(p, "classId"),
                valid(new ClassroomController.NewClass(text(p, "name", 120, false)))
            );
            case "CLASS_REMOVE_MEMBER" -> classes.removeMember(
                user,
                id(p, "classId"),
                id(p, "memberId")
            );
            case "CLASS_ASSIGN" -> classes.assign(
                user,
                id(p, "classId"),
                valid(
                    new ClassroomController.NewAssignment(
                        text(p, "title", 160, false),
                        id(p, "lessonId"),
                        text(p, "instructions", 1000, true),
                        percent(p),
                        due(p)
                    )
                )
            );
            case "CLASS_UPDATE_ASSIGNMENT" -> classes.updateAssignment(
                user,
                id(p, "classId"),
                id(p, "assignmentId"),
                valid(
                    new ClassroomController.AssignmentUpdate(
                        text(p, "title", 160, false),
                        text(p, "instructions", 1000, true),
                        percent(p),
                        due(p),
                        text(p, "status", 16, false)
                    )
                )
            );
            case "CLASS_START_ASSIGNMENT" -> classes.start(
                user,
                id(p, "classId"),
                id(p, "assignmentId")
            );
            case "CLASS_CHAT" -> classes.message(
                user,
                id(p, "classId"),
                valid(new ClassroomController.Message(text(p, "body", 1000, false)))
            );
            case "CLASS_REPORT" -> classes.report(
                user,
                id(p, "classId"),
                id(p, "messageId"),
                valid(new ClassroomController.Report(text(p, "reason", 500, false)))
            );
            case "CLASS_LESSONS" -> learning.listLessons(username);
            default -> throw invalid("Action lớp học không được hỗ trợ");
        };
    }

    /** Một snapshot nhất quán; quyền được kiểm tra lại mỗi lần push, bảng điểm chỉ cho chủ lớp. */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Map<String, Object> snapshot(String username, Long classId, Long assignmentId) {
        var user = auth(username);
        Map<String, Object> out = new LinkedHashMap<>();
        if (classId == null) {
            out.put("classes", classes.list(user));
            return out;
        }
        out.put("classroom", classes.detail(user, classId));
        out.put("messages", classes.messages(user, classId));
        if (assignmentId != null) {
            out.put("assignmentId", assignmentId);
            out.put("results", classes.results(user, classId, assignmentId));
        }
        return out;
    }
}
