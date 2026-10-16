package com.grammarquest.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity @Table(name="attempts")
public class Attempt {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    @Column(name="user_id") public Long userId;
    @Column(name="lesson_id") public Long lessonId;
    public String kind;
    public String status;
    @Column(name="required_correct") public int requiredCorrect;
    @Column(name="total_questions") public int totalQuestions;
    @Column(name="correct_count") public int correctCount;
    @Column(name="awarded_xp") public int awardedXp;
    @Column(name="created_at", insertable=false, updatable=false) public Instant createdAt;
    @Column(name="completed_at") public Instant completedAt;
    protected Attempt() {}
    public Attempt(Long userId, Long lessonId, String kind, int total, int required) {
        this.userId=userId; this.lessonId=lessonId; this.kind=kind; this.totalQuestions=total;
        this.requiredCorrect=required; this.status="IN_PROGRESS";
    }
}
