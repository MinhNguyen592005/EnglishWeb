package com.grammarquest.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.grammarquest.service.StudyManagementService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/study-management")
public class StudyManagementController {

    private final StudyManagementService service;

    public StudyManagementController(StudyManagementService service) {
        this.service = service;
    }

    public record Create(String moduleId, @Min(1) @Max(5) int levelId, Integer restoreVersion) {}

    public record Save(@Min(1) int expectedVersion, @NotNull JsonNode payload) {}

    public record Action(@Min(1) int expectedVersion, @Size(max = 1000) String note) {}

    @GetMapping
    public Object workspace(Authentication auth) {
        return service.workspace(auth.getName());
    }

    @GetMapping("/modules/{id}")
    public Object module(Authentication auth, @PathVariable String id) {
        return service.module(auth.getName(), id);
    }

    @GetMapping("/modules/{id}/history")
    public Object history(Authentication auth, @PathVariable String id) {
        return service.history(auth.getName(), id);
    }

    @PostMapping("/drafts")
    public Object create(Authentication auth, @Valid @RequestBody Create body) {
        return service.create(
            auth.getName(),
            body.moduleId(),
            body.levelId(),
            body.restoreVersion()
        );
    }

    @GetMapping("/drafts/{id}")
    public Object draft(Authentication auth, @PathVariable long id) {
        return service.draft(auth.getName(), id);
    }

    @PutMapping("/drafts/{id}")
    public Object save(Authentication auth, @PathVariable long id, @Valid @RequestBody Save body) {
        return service.save(auth.getName(), id, body.expectedVersion(), body.payload());
    }

    @PostMapping("/drafts/{id}/{action}")
    public Object action(
        Authentication auth,
        @PathVariable long id,
        @PathVariable String action,
        @Valid @RequestBody Action body
    ) {
        return service.action(auth.getName(), id, action, body.expectedVersion(), body.note());
    }
}
