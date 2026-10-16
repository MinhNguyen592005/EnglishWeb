package com.grammarquest.domain;

import jakarta.persistence.*;

@Entity @Table(name="questions")
public class Question {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    @Column(name="lesson_id") public Long lessonId;
    @Column(name="owner_id") public Long ownerId;
    @Column(name="teacher_active") public boolean teacherActive = true;
    public String prompt;
    @Column(name="option_a") public String optionA;
    @Column(name="option_b") public String optionB;
    @Column(name="option_c") public String optionC;
    @Column(name="option_d") public String optionD;
    @Column(name="correct_option", columnDefinition="char(1)") public String correctOption;
    @Column(name="question_type") public String questionType = "MCQ";
    @Column(name="accepted_answer") public String acceptedAnswer;
    @Column(columnDefinition="TEXT") public String explanation;
    public boolean published;
    protected Question() {}
}
