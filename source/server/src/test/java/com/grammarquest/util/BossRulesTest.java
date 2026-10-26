package com.grammarquest.util;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class BossRulesTest {
    @Test void lessonBossRequiresPerfectFiveAndHpNeverBelowZero() {
        assertEquals(5,BossRules.questionCount("LESSON_BOSS"));
        assertEquals(5,BossRules.requiredCorrect("LESSON_BOSS"));
        assertEquals(20,BossRules.hp("LESSON_BOSS",4));
        assertEquals(0,BossRules.hp("LESSON_BOSS",5));
        assertEquals(0,BossRules.hp("LESSON_BOSS",6));
        assertEquals(20,BossRules.firstWinXp("LESSON_BOSS"));
    }
    @Test void chapterBossNeedsEightOfTenDespiteZeroHpAtEight() {
        assertEquals(10,BossRules.questionCount("CHAPTER_BOSS"));
        assertEquals(8,BossRules.requiredCorrect("CHAPTER_BOSS"));
        assertEquals(12.5,BossRules.hp("CHAPTER_BOSS",7));
        assertEquals(0,BossRules.hp("CHAPTER_BOSS",8));
        assertEquals(0,BossRules.hp("CHAPTER_BOSS",10));
        assertEquals(150,BossRules.firstWinXp("CHAPTER_BOSS"));
    }
    @Test void practiceDoesNotAwardXp() { assertEquals(0,BossRules.firstWinXp("PRACTICE")); }
}
