package com.grammarquest.service;

import com.grammarquest.entity.User;
import com.grammarquest.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class StudyRewardServiceTest {
    final JdbcTemplate db=mock(JdbcTemplate.class);
    final UserRepository users=mock(UserRepository.class);
    final User user=new User("alice","Alice","unused");
    final StudyRewardService rewards=new StudyRewardService(db,users);
    StudyRewardServiceTest(){
        user.id=7L;user.totalXp=100;
        when(users.findWithLockById(7L)).thenReturn(Optional.of(user));
        when(db.queryForObject("select total_xp from users where id=? for update",Long.class,7L)).thenReturn(100L);
    }
    @Test void firstPassRewardsAreOncePerReferenceAcrossDifferentAttempts(){
        when(db.queryForList("select id from xp_ledger where user_id=? and reward_key=? for update",Long.class,7L,"STUDY_FIRST:LESSON:1.1")).thenReturn(java.util.List.of(),java.util.List.of(1L));
        assertEquals(20,rewards.award(7L,"LESSON","1.1",1));
        assertEquals(120,user.totalXp);
        assertEquals(0,rewards.award(7L,"LESSON","1.1",2));
        assertEquals(120,user.totalXp);
        verify(users,times(1)).save(user);
        var order=inOrder(users,db);
        order.verify(users).findWithLockById(7L);
        order.verify(db).queryForObject("select total_xp from users where id=? for update",Long.class,7L);
    }
    @Test void legacyAndCourseReviewsShareThirtyXpDailyCap(){
        when(db.queryForList(startsWith("select amount from xp_ledger"),eq(Integer.class),eq(7L),anyString())).thenReturn(java.util.List.of(),java.util.List.of(10),java.util.List.of(10,10),java.util.List.of(10,10,10));
        assertEquals(10,rewards.award(7L,"MODULE_REVIEW","m1",1));
        assertEquals(10,rewards.award(7L,"PRACTICE","",2));
        assertEquals(10,rewards.award(7L,"LEVEL_REVIEW","1",3));
        assertEquals(0,rewards.award(7L,"MODULE_REVIEW","m2",4));
        verify(users,times(3)).save(user);
    }
    @Test void repeatedReviewAttemptCannotEarnTwice(){
        when(db.queryForList(startsWith("select amount from xp_ledger"),eq(Integer.class),eq(7L),anyString())).thenReturn(java.util.List.of(),java.util.List.of(10));
        when(db.queryForList(eq("select id from xp_ledger where user_id=? and reward_key=? for update"),eq(Long.class),eq(7L),anyString())).thenReturn(java.util.List.of(),java.util.List.of(1L));
        assertEquals(10,rewards.award(7L,"LEVEL_REVIEW","1",42));
        assertEquals(0,rewards.award(7L,"LEVEL_REVIEW","1",42));
        verify(users,times(1)).save(user);
    }
}
