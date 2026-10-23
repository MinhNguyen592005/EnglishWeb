package com.grammarquest.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "daily_quests")
public class DailyQuest {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Integer id;

    @Column(nullable = false, unique = true)
    public String code;

    @Column(nullable = false)
    public String tier;

    @Column(nullable = false)
    public String title;

    @Column(nullable = false)
    public String description;

    @Column(nullable = false)
    public String category;

    @Column(name = "target_type", nullable = false)
    public String targetType;

    @Column(name = "target_count", nullable = false)
    public int targetCount;

    @Column(name = "reward_xp", nullable = false)
    public int rewardXp;

    @Column(nullable = false)
    public String icon;

    @Column(nullable = false)
    public boolean active = true;

    protected DailyQuest() {}

    public DailyQuest(String code, String tier, String title, String description, String category,
                      String targetType, int targetCount, int rewardXp, String icon) {
        this.code = code;
        this.tier = tier;
        this.title = title;
        this.description = description;
        this.category = category;
        this.targetType = targetType;
        this.targetCount = targetCount;
        this.rewardXp = rewardXp;
        this.icon = icon;
        this.active = true;
    }
}
