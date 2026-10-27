package com.grammarquest.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity @Table(name="users")
public class User {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    @Column(nullable=false, unique=true) public String username;
    @Column(name="display_name", nullable=false) public String displayName;
    @Column(name="password_hash", nullable=false) public String passwordHash;
    @Column(nullable=false) public String role = "LEARNER";
    @Column(nullable=false) public boolean locked = false;
    @Column(name="total_xp", nullable=false) public long totalXp = 0;
    @Column(name="placement_eligible", nullable=false) public boolean placementEligible = false;
    @Column(name="pvp_elo", nullable=false) public int pvpElo = 1000;
    @Column(name="pvp_peak_elo", nullable=false) public int pvpPeakElo = 1000;
    @Column(name="pvp_wins", nullable=false) public int pvpWins = 0;
    @Column(name="pvp_losses", nullable=false) public int pvpLosses = 0;
    @Column(name="pvp_draws", nullable=false) public int pvpDraws = 0;
    @Column(name="pvp_win_streak", nullable=false) public int pvpWinStreak = 0;
    @Column(name="pvp_best_win_streak", nullable=false) public int pvpBestWinStreak = 0;
    @Column(name="pvp_decline_count", nullable=false) public int pvpDeclineCount = 0;
    @Column(name="pvp_ban_until") public Instant pvpBanUntil = null;
    @Column(name="equipped_frame", nullable=false) public String equippedFrame = "FRAME_DEFAULT";
    @Column(name="equipped_badge") public String equippedBadge = null;
    protected User() {}
    public User(String username, String displayName, String passwordHash) {
        this.username=username; this.displayName=displayName; this.passwordHash=passwordHash;
    }
}
