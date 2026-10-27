package com.grammarquest.util;

import java.util.List;

public final class PvpRankRules {

    public static final int DEFAULT_ELO = 1000;
    public static final int MIN_ELO = 100;
    public static final int K_FACTOR = 32;

    public static final int MAX_DECLINE_COUNT = 3;
    public static final int TEMP_BAN_SECONDS = 300; // 5 phút cấm ghép trận tạm thời
    public static final int CONFIRM_TIMEOUT_SECONDS = 15; // 15 giây xác nhận tham gia trận
    public static final int START_COUNTDOWN_SECONDS = 5; // 5 giây đếm ngược bắt đầu trận
    public static final int ROUND_TIME_LIMIT_SECONDS = 20; // 20 giây mỗi câu hỏi
    public static final int MATCH_TIME_LIMIT_SECONDS = 180; // 180 giây (3 phút) giới hạn toàn trận

    public record RankTier(
        String code,
        String title,
        int minElo,
        Integer nextElo,
        String colorClass
    ) {}

    public static final List<RankTier> TIERS = List.of(
        new RankTier("BRONZE", "Đồng", 0, 1100, "rank-bronze"),
        new RankTier("SILVER", "Bạc", 1100, 1300, "rank-silver"),
        new RankTier("GOLD", "Vàng", 1300, 1500, "rank-gold"),
        new RankTier("PLATINUM", "Bạch Kim", 1500, 1700, "rank-platinum"),
        new RankTier("DIAMOND", "Kim Cương", 1700, 2000, "rank-diamond"),
        new RankTier("MASTER", "Cao Thủ", 2000, null, "rank-master")
    );

    private PvpRankRules() {}

    public static RankTier fromElo(int elo) {
        if (elo >= 2000) return TIERS.get(5);
        if (elo >= 1700) return TIERS.get(4);
        if (elo >= 1500) return TIERS.get(3);
        if (elo >= 1300) return TIERS.get(2);
        if (elo >= 1100) return TIERS.get(1);
        return TIERS.get(0);
    }

    /**
     * Tính độ thay đổi ELO dựa trên kết quả trận đấu (1.0 = Thắng, 0.5 = Hòa, 0.0 = Thua)
     * và trình độ ELO của đối thủ.
     */
    public static int calculateEloChange(int playerElo, int opponentElo, double actualScore) {
        double expected = 1.0 / (1.0 + Math.pow(10.0, (opponentElo - playerElo) / 400.0));
        int delta = (int) Math.round(K_FACTOR * (actualScore - expected));
        if (actualScore == 1.0 && delta < 1) return 1;
        if (actualScore == 0.0 && delta > -1) return -1;
        return delta;
    }

    public static int applyEloChange(int currentElo, int delta) {
        return Math.max(MIN_ELO, currentElo + delta);
    }
}
