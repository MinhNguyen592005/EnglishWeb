package com.grammarquest.service;

import com.grammarquest.repository.UserRepository;
import com.grammarquest.entity.User;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.time.ZoneId;

/** All rewards serialize on the account, including the shared daily review cap. */
@Service
public class StudyRewardService {
    public static final ZoneId STUDY_ZONE = ZoneId.of("Asia/Bangkok");
    private final JdbcTemplate db;
    private final UserRepository users;
    public StudyRewardService(JdbcTemplate db, UserRepository users) { this.db=db; this.users=users; }

    @Transactional
    public int award(long userId, String kind, String reference, long attemptId) {
        var user=users.findWithLockById(userId).orElseThrow();
        long balance=db.queryForObject("select total_xp from users where id=? for update",Long.class,userId);
        boolean review=kind.endsWith("REVIEW")||kind.equals("PRACTICE");
        int amount=switch(kind) {
            case "LESSON", "LESSON_BOSS" -> 20;
            case "MODULE_TEST" -> 50;
            case "LEVEL_TEST", "CHAPTER_BOSS" -> 150;
            default -> review?10:0;
        };
        if(amount==0)return 0;
        LocalDate day=LocalDate.now(STUDY_ZONE);
        String key=review?"STUDY_REVIEW:"+day+":"+kind+":"+attemptId
            :"STUDY_FIRST:"+kind+":"+reference;
        if(alreadyAwarded(userId,key))return 0;
        if(review) {
            int used=db.queryForList("select amount from xp_ledger where user_id=? and reward_key like ? for update",Integer.class,userId,"STUDY_REVIEW:"+day+":%").stream().mapToInt(Integer::intValue).sum();
            amount=Math.min(amount,Math.max(0,30-used));
        }
        if(amount==0)return 0;
        return credit(user,key,amount,balance);
    }

    /** Preserve legacy reward keys, while reading the balance after the account lock. */
    @Transactional
    public int awardFirstWin(long userId,String rewardKey,int amount) {
        if(amount<=0)return 0;
        var user=users.findWithLockById(userId).orElseThrow();
        long balance=db.queryForObject("select total_xp from users where id=? for update",Long.class,userId);
        if(alreadyAwarded(userId,rewardKey))return 0;
        return credit(user,rewardKey,amount,balance);
    }

    private boolean alreadyAwarded(long userId,String key){
        // Locking reads also see commits newer than an enclosing transaction's read snapshot.
        return !db.queryForList("select id from xp_ledger where user_id=? and reward_key=? for update",Long.class,userId,key).isEmpty();
    }
    private int credit(User user,String key,int amount,long balance){
        long userId=user.id;
        db.update("insert into xp_ledger(user_id,reward_key,amount) values(?,?,?)",userId,key,amount);
        user.totalXp=balance+amount;
        users.save(user);
        return amount;
    }
}
