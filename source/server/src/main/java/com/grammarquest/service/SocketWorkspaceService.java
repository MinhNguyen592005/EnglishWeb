package com.grammarquest.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.grammarquest.controller.AdminController;
import com.grammarquest.controller.TeacherDashboardController;
import com.grammarquest.exception.ApiException;
import jakarta.validation.Validator;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Service;

/** Adapter socket: tái sử dụng kiểm tra quyền DB và transaction của controller proxy. */
@Service
public class SocketWorkspaceService {

    private final AdminController admin;
    private final TeacherDashboardController teacher;
    private final Validator validator;

    public SocketWorkspaceService(
        AdminController admin,
        TeacherDashboardController teacher,
        Validator validator
    ) {
        this.admin = admin;
        this.teacher = teacher;
        this.validator = validator;
    }

    public Object snapshot(String username, String kind) {
        var auth = new UsernamePasswordAuthenticationToken(username, null, List.of());
        return switch (kind) {
            case "TEACHER" -> teacher.overview(auth);
            case "REPORTS" -> Map.of(
                "reports",
                admin.reports(auth),
                "overview",
                admin.overview(auth)
            );
            default -> throw new IllegalArgumentException("Unknown workspace");
        };
    }

    public Object decide(String username, JsonNode p) {
        var id = p.path("reportId");
        if (
            !id.isIntegralNumber() ||
            !id.canConvertToLong() ||
            id.asLong() < 1 ||
            !p.path("action").isTextual() ||
            !p.path("source").isTextual() ||
            !Set.of("CLASS", "ARENA", "USER").contains(p.path("source").asText()) ||
            (!p.path("note").isMissingNode() && !p.path("note").isTextual())
        ) throw invalid();
        var body = new AdminController.Decision(
            p.path("action").asText(),
            p.path("note").asText(""),
            p.path("source").asText()
        );
        if (!validator.validate(body).isEmpty()) throw invalid();
        return admin.decide(
            new UsernamePasswordAuthenticationToken(username, null, List.of()),
            id.asLong(),
            body
        );
    }

    private ApiException invalid() {
        return new ApiException(
            HttpStatus.BAD_REQUEST,
            "INVALID_REPORT_DECISION",
            "Dữ liệu xử lý báo cáo không hợp lệ"
        );
    }
}
