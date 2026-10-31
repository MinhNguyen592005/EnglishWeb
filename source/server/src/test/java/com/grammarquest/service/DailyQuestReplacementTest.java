package com.grammarquest.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.grammarquest.entity.*;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.*;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DailyQuestReplacementTest {

    DailyQuestRepository definitions = mock(DailyQuestRepository.class);
    UserDailyQuestRepository assignments = mock(UserDailyQuestRepository.class);
    UserRepository users = mock(UserRepository.class);
    UserQuestStreakRepository streaks = mock(UserQuestStreakRepository.class);
    DailyQuestService service = new DailyQuestService(
        definitions,
        assignments,
        streaks,
        users,
        mock(XpLedgerRepository.class)
    );
    UserDailyQuest quest = new UserDailyQuest(1L, 10, LocalDate.now());

    DailyQuest definition(int id) {
        DailyQuest value = new DailyQuest(
            "Q" + id,
            "EASY",
            "Task",
            "Task",
            "PRACTICE",
            "PRACTICE_COUNT",
            1,
            30,
            "BookOpen"
        );
        value.id = id;
        return value;
    }

    @BeforeEach
    void setup() {
        User user = mock(User.class);
        user.id = 1L;
        quest.id = 5L;
        when(users.findByUsernameIgnoreCase("learner")).thenReturn(Optional.of(user));
        when(assignments.findWithLockById(5L)).thenReturn(Optional.of(quest));
        when(definitions.findById(10)).thenReturn(Optional.of(definition(10)));
        when(assignments.findByUserIdAndQuestDate(1L, LocalDate.now())).thenReturn(List.of(quest));
    }

    @Test
    void replacesWithDifferentQuestAndResetsProgress() {
        DailyQuest replacement = definition(11);
        when(definitions.findByTierAndActiveTrue("EASY")).thenReturn(
            List.of(definition(10), replacement)
        );
        when(definitions.findAll()).thenReturn(List.of(definition(10), replacement));
        when(streaks.findById(1L)).thenReturn(Optional.of(new UserQuestStreak(1L)));
        quest.currentProgress = 1;
        service.replaceQuest("learner", 5L);
        assertEquals(11, quest.questId);
        assertEquals(0, quest.currentProgress);
        assertFalse(quest.claimed);
        verify(assignments).saveAndFlush(quest);
    }

    @Test
    void rejectsCompletedClaimedExpiredAndOtherUsersQuests() {
        quest.completed = true;
        assertThrows(ApiException.class, () -> service.replaceQuest("learner", 5L));
        quest.completed = false;
        quest.claimed = true;
        assertThrows(ApiException.class, () -> service.replaceQuest("learner", 5L));
        quest.claimed = false;
        quest.questDate = LocalDate.now().minusDays(1);
        assertThrows(ApiException.class, () -> service.replaceQuest("learner", 5L));
        quest.questDate = LocalDate.now();
        quest.userId = 2L;
        assertThrows(ApiException.class, () -> service.replaceQuest("learner", 5L));
        verify(assignments, never()).saveAndFlush(any());
    }

    @Test
    void rejectsUnavailableOrAlreadyAssignedAlternatives() {
        DailyQuest retired = definition(11);
        retired.active = false;
        when(definitions.findByTierAndActiveTrue("EASY")).thenReturn(
            List.of(definition(10), retired)
        );
        assertThrows(ApiException.class, () -> service.replaceQuest("learner", 5L));
        assertEquals(10, quest.questId);
        verify(assignments, never()).saveAndFlush(any());
    }
}
