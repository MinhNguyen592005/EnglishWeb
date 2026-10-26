package com.grammarquest.service;

import com.grammarquest.repository.UserRepository;
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
        String key=review?"STUDY_REVIEW:"+LocalDate.now(STUDY_ZONE)+":"+kind+":"+attemptId
            :"STUDY_FIRST:"+kind+":"+reference;
        if(db.queryForObject("select count(*) from xp_ledger where user_id=? and reward_key=?",Integer.class,userId,key)>0)return 0;
        if(review) {
            Integer used=db.queryForObject("select coalesce(sum(amount),0) from xp_ledger where user_id=? and reward_key like ?",Integer.class,userId,"STUDY_REVIEW:"+LocalDate.now(STUDY_ZONE)+":%");
            amount=Math.min(amount,Math.max(0,30-used));
        }
        if(amount==0)return 0;
        // The account lock prevents a concurrent claim or another attempt bypassing the cap.
        db.update("insert into xp_ledger(user_id,reward_key,amount) values(?,?,?)",userId,key,amount);
        user.totalXp=balance+amount;
        users.save(user);
        return amount;
    }
}
