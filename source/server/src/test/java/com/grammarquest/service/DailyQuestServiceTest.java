package com.grammarquest.service;

import com.grammarquest.entity.DailyQuest;
import com.grammarquest.entity.User;
import com.grammarquest.entity.UserDailyQuest;
import com.grammarquest.entity.UserQuestStreak;
import com.grammarquest.entity.XpLedger;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.DailyQuestRepository;
import com.grammarquest.repository.UserDailyQuestRepository;
import com.grammarquest.repository.UserQuestStreakRepository;
import com.grammarquest.repository.UserRepository;
import com.grammarquest.repository.XpLedgerRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DailyQuestServiceTest {
    @Mock DailyQuestRepository dailyQuests;
    @Mock UserDailyQuestRepository userQuests;
    @Mock UserQuestStreakRepository streaks;
    @Mock UserRepository users;
    @Mock XpLedgerRepository xp;

    DailyQuestService service;
    User user;
    DailyQuest qEasy;
    DailyQuest qMed;
    DailyQuest qHard;

    @BeforeEach
    void setup() {
        service = new DailyQuestService(dailyQuests, userQuests, streaks, users, xp);
        user = new User("nam", "Hoang Nam", "hash");
        user.id = 10L;
        user.totalXp = 500;

        qEasy = new DailyQuest("PRACTICE_1", "EASY", "Luyện tập 1", "Desc", "PRACTICE", "PRACTICE_COUNT", 1, 30, "BookOpen");
        qEasy.id = 1;
        qMed = new DailyQuest("CORRECT_15", "MEDIUM", "Đúng 15 câu", "Desc", "PRACTICE", "CORRECT_COUNT", 15, 50, "CheckCircle2");
        qMed.id = 2;
        qHard = new DailyQuest("ARENA_WIN_1", "HARD", "Thắng 1 PvP", "Desc", "ARENA", "ARENA_WIN", 1, 70, "Trophy");
        qHard.id = 3;
    }

    @Test
    void ensuresThreeQuestsAllocatedDaily() {
        when(userQuests.findByUserIdAndQuestDate(eq(10L), any(LocalDate.class))).thenReturn(Collections.emptyList());
        when(dailyQuests.findByTierAndActiveTrue("EASY")).thenReturn(List.of(qEasy));
        when(dailyQuests.findByTierAndActiveTrue("MEDIUM")).thenReturn(List.of(qMed));
        when(dailyQuests.findByTierAndActiveTrue("HARD")).thenReturn(List.of(qHard));
        when(userQuests.save(any(UserDailyQuest.class))).thenAnswer(inv -> inv.getArgument(0));

        List<UserDailyQuest> created = service.ensureTodayQuests(10L, LocalDate.now());
        assertEquals(3, created.size());
        verify(userQuests, times(3)).save(any(UserDailyQuest.class));
    }

    @Test
    void recordsProgressAndMarksCompleted() {
        UserDailyQuest udq = new UserDailyQuest(10L, 2, LocalDate.now());
        udq.id = 101L;
        udq.currentProgress = 14;

        when(userQuests.findByUserIdAndQuestDate(eq(10L), any(LocalDate.class))).thenReturn(List.of(udq));
        when(dailyQuests.findAll()).thenReturn(List.of(qMed));
        when(userQuests.save(any(UserDailyQuest.class))).thenAnswer(inv -> inv.getArgument(0));

        service.recordProgress(10L, "CORRECT_COUNT", 1);
        assertEquals(15, udq.currentProgress);
        assertTrue(udq.completed);
        verify(userQuests).save(udq);
    }

    @Test
    void claimsRewardAddsXpIdempotently() {
        UserDailyQuest udq = new UserDailyQuest(10L, 1, LocalDate.now());
        udq.id = 100L;
        udq.completed = true;
        udq.claimed = false;

        when(users.findByUsernameIgnoreCase("nam")).thenReturn(Optional.of(user));
        when(userQuests.findWithLockById(100L)).thenReturn(Optional.of(udq));
        when(dailyQuests.findById(1)).thenReturn(Optional.of(qEasy));
        when(users.findWithLockById(10L)).thenReturn(Optional.of(user));
        when(xp.existsByUserIdAndRewardKey(10L, "DAILY_QUEST:100")).thenReturn(false);

        var result = service.claimQuestReward("nam", 100L);
        assertTrue(udq.claimed);
        assertEquals(530, user.totalXp);
        assertEquals(530, result.profile().totalXp());
        verify(xp).save(any(XpLedger.class));
        verify(userQuests).save(udq);
    }

    @Test
    void claimDailyMilestoneUpdatesStreakAndBonusXp() {
        UserDailyQuest u1 = new UserDailyQuest(10L, 1, LocalDate.now()); u1.completed = true;
        UserDailyQuest u2 = new UserDailyQuest(10L, 2, LocalDate.now()); u2.completed = true;
        UserDailyQuest u3 = new UserDailyQuest(10L, 3, LocalDate.now()); u3.completed = true;

        UserQuestStreak streak = new UserQuestStreak(10L);
        streak.currentStreak = 2;
        streak.lastCompletedDate = LocalDate.now().minusDays(1);

        when(users.findByUsernameIgnoreCase("nam")).thenReturn(Optional.of(user));
        when(userQuests.findByUserIdAndQuestDate(eq(10L), any(LocalDate.class))).thenReturn(List.of(u1, u2, u3));
        when(streaks.findById(10L)).thenReturn(Optional.of(streak));
        when(users.findWithLockById(10L)).thenReturn(Optional.of(user));
        when(xp.existsByUserIdAndRewardKey(eq(10L), startsWith("DAILY_MILESTONE:"))).thenReturn(false);

        var result = service.claimDailyMilestone("nam");
        assertEquals(3, streak.currentStreak);
        assertEquals(3, streak.longestStreak);
        assertEquals(LocalDate.now(), streak.lastCompletedDate);
        assertEquals(600, user.totalXp);
        assertEquals(600, result.profile().totalXp());
        verify(streaks).save(streak);
    }
}
