package com.grammarquest.entity;
import jakarta.persistence.*;
@Entity @Table(name="topics")
public class Topic {
    @Id public String slug;
    public String title;
    public String description;
    public String outcome;
    @Column(name="sort_order") public int sortOrder;
    @Column(name="planet_style") public String planetStyle;
    public boolean published;
    protected Topic() {}
}
