package com.grammarquest.controller;

import com.grammarquest.service.NotificationService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    private final NotificationService notifications;

    public NotificationController(NotificationService notifications) {
        this.notifications = notifications;
    }

    @GetMapping
    public NotificationService.Inbox inbox(
        Authentication auth,
        @RequestParam(required = false) Long beforeId
    ) {
        return notifications.inbox(auth.getName(), beforeId);
    }

    @PatchMapping("/{id}/read")
    public NotificationService.Item read(Authentication auth, @PathVariable long id) {
        return notifications.read(auth.getName(), id);
    }

    @PatchMapping("/read-all")
    public java.util.Map<String, Boolean> readAll(Authentication auth) {
        notifications.readAll(auth.getName());
        return java.util.Map.of("ok", true);
    }
}
