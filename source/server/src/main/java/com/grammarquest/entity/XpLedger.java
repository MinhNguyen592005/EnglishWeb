package com.grammarquest.entity;

import jakarta.persistence.*;

@Entity @Table(name="xp_ledger")
public class XpLedger {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    @Column(name="user_id") public Long userId;
    @Column(name="reward_key") public String rewardKey;
    public int amount;
    protected XpLedger() {}
    public XpLedger(Long userId, String rewardKey, int amount) {
        this.userId=userId; this.rewardKey=rewardKey; this.amount=amount;
    }
}
