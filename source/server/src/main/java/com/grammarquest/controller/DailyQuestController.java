package com.grammarquest.controller;

import com.grammarquest.service.DailyQuestService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/daily-quests")
public class DailyQuestController {
    private final DailyQuestService dailyQuestService;

    public DailyQuestController(DailyQuestService dailyQuestService) {
        this.dailyQuestService = dailyQuestService;
    }

    @GetMapping
    public DailyQuestService.DailyQuestOverview overview(Authentication auth) {
        return dailyQuestService.getOverview(auth.getName());
    }

    @GetMapping("/streak")
    public DailyQuestService.StreakView streak(Authentication auth) {
        return dailyQuestService.getStreak(auth.getName());
    }

    @PostMapping("/{id}/claim")
    public DailyQuestService.QuestClaimResult claim(Authentication auth, @PathVariable Long id) {
        return dailyQuestService.claimQuestReward(auth.getName(), id);
    }

    @PostMapping("/claim-milestone")
    public DailyQuestService.MilestoneClaimResult claimMilestone(Authentication auth) {
        return dailyQuestService.claimDailyMilestone(auth.getName());
    }
}
