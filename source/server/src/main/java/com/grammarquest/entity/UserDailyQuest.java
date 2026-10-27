package com.grammarquest.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "user_daily_quests")
public class UserDailyQuest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(name = "user_id", nullable = false)
    public Long userId;

    @Column(name = "quest_id", nullable = false)
    public Integer questId;

    @Column(name = "quest_date", nullable = false)
    public LocalDate questDate;

    @Column(name = "current_progress", nullable = false)
    public int currentProgress = 0;

    @Column(nullable = false)
    public boolean completed = false;

    @Column(nullable = false)
    public boolean claimed = false;

    @Column(name = "claimed_at")
    public Instant claimedAt;

    protected UserDailyQuest() {}

    public UserDailyQuest(Long userId, Integer questId, LocalDate questDate) {
        this.userId = userId;
        this.questId = questId;
        this.questDate = questDate;
        this.currentProgress = 0;
        this.completed = false;
        this.claimed = false;
    }
}
