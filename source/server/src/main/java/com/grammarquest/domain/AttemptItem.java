package com.grammarquest.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity @Table(name="attempt_items")
public class AttemptItem {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    @Column(name="attempt_id") public Long attemptId;
    @Column(name="ordinal_no") public int ordinalNo;
    @Column(name="question_id") public Long questionId;
    public String prompt;
    @Column(name="option_a") public String optionA;
    @Column(name="option_b") public String optionB;
    @Column(name="option_c") public String optionC;
    @Column(name="option_d") public String optionD;
    @Column(name="correct_option", columnDefinition="char(1)") public String correctOption;
    @Column(name="question_type") public String questionType = "MCQ";
    @Column(name="accepted_answer") public String acceptedAnswer;
    @Column(name="text_answer") public String textAnswer;
    @Column(columnDefinition="TEXT") public String explanation;
    @Column(columnDefinition="char(1)") public String answer;
    @Column(name="answered_at") public Instant answeredAt;
    protected AttemptItem() {}
    public AttemptItem(Long attemptId, int ordinalNo, Question q) {
        this.attemptId=attemptId; this.ordinalNo=ordinalNo; this.questionId=q.id;
        this.prompt=q.prompt; this.optionA=q.optionA; this.optionB=q.optionB;
        this.optionC=q.optionC; this.optionD=q.optionD;
        this.correctOption=q.correctOption; this.questionType=q.questionType;
        this.acceptedAnswer=q.acceptedAnswer; this.explanation=q.explanation;
    }
}
