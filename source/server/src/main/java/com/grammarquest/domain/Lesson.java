package com.grammarquest.domain;

import jakarta.persistence.*;

@Entity @Table(name="lessons")
public class Lesson {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    @Column(name="topic_slug") public String topicSlug;
    @Column(name="ordinal_no") public int ordinalNo;
    public String title;
    public String summary;
    @Column(nullable=false) public String difficulty = "BEGINNER";
    @Column(columnDefinition="TEXT") public String theory;
    public boolean published;
    protected Lesson() {}
}
