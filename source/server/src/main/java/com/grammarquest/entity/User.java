package com.grammarquest.entity;

import jakarta.persistence.*;

@Entity @Table(name="users")
public class User {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    @Column(nullable=false, unique=true) public String username;
    @Column(name="display_name", nullable=false) public String displayName;
    @Column(name="password_hash", nullable=false) public String passwordHash;
    @Column(nullable=false) public String role = "LEARNER";
    @Column(nullable=false) public boolean locked = false;
    @Column(name="total_xp", nullable=false) public long totalXp = 0;
    protected User() {}
    public User(String username, String displayName, String passwordHash) {
        this.username=username; this.displayName=displayName; this.passwordHash=passwordHash;
    }
}
