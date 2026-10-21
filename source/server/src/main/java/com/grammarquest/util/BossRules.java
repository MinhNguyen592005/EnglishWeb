package com.grammarquest.util;

public final class BossRules {
    private BossRules() {}
    public static int questionCount(String kind) { return kind.equals("CHAPTER_BOSS") ? 10 : kind.equals("LESSON_BOSS") ? 5 : 10; }
    public static int requiredCorrect(String kind) { return kind.equals("CHAPTER_BOSS") ? 8 : kind.equals("LESSON_BOSS") ? 5 : 0; }
    public static double hp(String kind, int correctCount) {
        return kind.equals("PRACTICE") ? 0 : Math.max(0,100-correctCount*(kind.equals("CHAPTER_BOSS")?12.5:20));
    }
    public static int firstWinXp(String kind) { return kind.equals("CHAPTER_BOSS") ? 150 : kind.equals("LESSON_BOSS") ? 50 : 0; }
}
