package com.grammarquest.controller;

import com.grammarquest.service.AssignmentAnswerGuard;
import com.grammarquest.service.LearningService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController @RequestMapping("/api/v1")
public class LearningController {
    private final LearningService learning;
    private final AssignmentAnswerGuard assignmentGuard;
    public LearningController(LearningService learning, AssignmentAnswerGuard assignmentGuard) { this.learning=learning; this.assignmentGuard=assignmentGuard; }
    public record Start(@NotBlank String kind, Long lessonId) {}
    public record Answer(@Min(1) int ordinalNo, @NotBlank String option) {}
    @GetMapping("/lessons") public List<LearningService.LessonView> lessons(Authentication a) { return learning.listLessons(a.getName()); }
    @GetMapping("/topics") public List<LearningService.TopicView> topics(Authentication a) { return learning.listTopics(a.getName()); }
    @GetMapping("/lessons/{id}") public LearningService.LessonView lesson(Authentication a, @PathVariable Long id) { return learning.lesson(a.getName(),id); }
    @PostMapping("/attempts") public LearningService.AttemptView start(Authentication a,@Valid @RequestBody Start body) {
        return learning.start(a.getName(),body.kind(),body.lessonId());
    }
    @GetMapping("/attempts/{id}") public LearningService.AttemptView attempt(Authentication a,@PathVariable Long id) { return learning.get(a.getName(),id); }
    @PostMapping("/attempts/{id}/answers") public LearningService.AnswerView answer(Authentication a,@PathVariable Long id,@Valid @RequestBody Answer body) {
        return learning.answer(a.getName(),id,body.ordinalNo(),body.option());
    }
    @GetMapping("/attempts") public List<LearningService.AttemptView> history(Authentication a) { return learning.history(a.getName()); }
}
