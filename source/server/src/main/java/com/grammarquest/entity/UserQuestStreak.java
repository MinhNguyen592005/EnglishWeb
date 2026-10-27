package com.grammarquest.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "user_quest_streaks")
public class UserQuestStreak {
    @Id
    @Column(name = "user_id")
    public Long userId;

    @Column(name = "current_streak", nullable = false)
    public int currentStreak = 0;

    @Column(name = "longest_streak", nullable = false)
    public int longestStreak = 0;

    @Column(name = "last_completed_date")
    public LocalDate lastCompletedDate;

    @Column(name = "milestone_claimed_date")
    public LocalDate milestoneClaimedDate;

    @Column(name = "updated_at", insertable = false, updatable = false)
    public Instant updatedAt;

    protected UserQuestStreak() {}

    public UserQuestStreak(Long userId) {
        this.userId = userId;
        this.currentStreak = 0;
        this.longestStreak = 0;
    }
}
