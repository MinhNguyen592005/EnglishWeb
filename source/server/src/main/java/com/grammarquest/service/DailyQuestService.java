package com.grammarquest.service;

import com.grammarquest.controller.AuthController;
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
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

@Service
public class DailyQuestService {
    private final DailyQuestRepository dailyQuests;
    private final UserDailyQuestRepository userQuests;
    private final UserQuestStreakRepository streaks;
    private final UserRepository users;
    private final XpLedgerRepository xp;

    public DailyQuestService(DailyQuestRepository dailyQuests, UserDailyQuestRepository userQuests,
                             UserQuestStreakRepository streaks, UserRepository users, XpLedgerRepository xp) {
        this.dailyQuests = dailyQuests;
        this.userQuests = userQuests;
        this.streaks = streaks;
        this.users = users;
        this.xp = xp;
    }

    public record QuestView(Long id, String code, String tier, String title, String description,
                            String category, String targetType, int targetCount, int currentProgress,
                            int rewardXp, String icon, boolean completed, boolean claimed) {}

    public record MilestoneView(int totalQuests, int completedQuests, boolean allCompleted,
                                boolean claimed, int rewardXp) {}

    public record StreakView(int currentStreak, int longestStreak, boolean completedToday) {}

    public record DailyQuestOverview(List<QuestView> quests, MilestoneView milestone, StreakView streak) {}

    public record QuestClaimResult(QuestView quest, AuthController.Profile profile) {}

    public record MilestoneClaimResult(MilestoneView milestone, StreakView streak, AuthController.Profile profile) {}

    @Transactional
    public DailyQuestOverview getOverview(String username) {
        User user = users.findByUsernameIgnoreCase(username)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "Không tìm thấy người dùng"));
        LocalDate today = LocalDate.now();
        List<UserDailyQuest> userDailyQuests = ensureTodayQuests(user.id, today);

        Map<Integer, DailyQuest> questMap = new HashMap<>();
        for (DailyQuest dq : dailyQuests.findAll()) {
            questMap.put(dq.id, dq);
        }

        List<QuestView> views = new ArrayList<>();
        int completedCount = 0;
        for (UserDailyQuest udq : userDailyQuests) {
            DailyQuest dq = questMap.get(udq.questId);
            if (dq != null) {
                views.add(toQuestView(udq, dq));
                if (udq.completed) completedCount++;
            }
        }

        UserQuestStreak streak = getOrInitStreak(user.id, today);
        boolean milestoneClaimed = today.equals(streak.milestoneClaimedDate);
        boolean allCompleted = !views.isEmpty() && completedCount == views.size();

        MilestoneView milestone = new MilestoneView(views.size(), completedCount, allCompleted, milestoneClaimed, 100);
        StreakView streakView = new StreakView(streak.currentStreak, streak.longestStreak, milestoneClaimed);

        return new DailyQuestOverview(views, milestone, streakView);
    }

    @Transactional
    public StreakView getStreak(String username) {
        User user = users.findByUsernameIgnoreCase(username)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "Không tìm thấy người dùng"));
        LocalDate today = LocalDate.now();
        UserQuestStreak streak = getOrInitStreak(user.id, today);
        boolean milestoneClaimed = today.equals(streak.milestoneClaimedDate);
        return new StreakView(streak.currentStreak, streak.longestStreak, milestoneClaimed);
    }

    @Transactional
    public void recordProgress(Long userId, String targetType, int increment) {
        if (userId == null || increment <= 0) return;
        LocalDate today = LocalDate.now();
        List<UserDailyQuest> userDailyQuests = ensureTodayQuests(userId, today);
        if (userDailyQuests.isEmpty()) return;

        Map<Integer, DailyQuest> questMap = new HashMap<>();
        for (DailyQuest dq : dailyQuests.findAll()) {
            questMap.put(dq.id, dq);
        }

        for (UserDailyQuest udq : userDailyQuests) {
            DailyQuest dq = questMap.get(udq.questId);
            if (dq != null && dq.targetType.equals(targetType) && !udq.completed) {
                if ("STREAK_CORRECT".equals(targetType)) {
                    udq.currentProgress = Math.max(udq.currentProgress, increment);
                } else {
                    udq.currentProgress += increment;
                }
                if (udq.currentProgress >= dq.targetCount) {
                    udq.currentProgress = dq.targetCount;
                    udq.completed = true;
                }
                userQuests.save(udq);
            }
        }
    }

    @Transactional
    public QuestClaimResult claimQuestReward(String username, Long userQuestId) {
        User user = users.findByUsernameIgnoreCase(username)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "Không tìm thấy người dùng"));
        UserDailyQuest udq = userQuests.findWithLockById(userQuestId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "QUEST_NOT_FOUND", "Không tìm thấy nhiệm vụ"));

        if (!udq.userId.equals(user.id)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Không có quyền nhận nhiệm vụ này");
        }
        if (!udq.completed) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "QUEST_INCOMPLETE", "Nhiệm vụ chưa hoàn thành");
        }
        if (udq.claimed) {
            throw new ApiException(HttpStatus.CONFLICT, "ALREADY_CLAIMED", "Phần thưởng đã được nhận");
        }

        DailyQuest dq = dailyQuests.findById(udq.questId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "QUEST_NOT_FOUND", "Định nghĩa nhiệm vụ không tồn tại"));

        String rewardKey = "DAILY_QUEST:" + udq.id;
        User lockedUser = users.findWithLockById(user.id).orElseThrow();
        if (!xp.existsByUserIdAndRewardKey(lockedUser.id, rewardKey)) {
            xp.save(new XpLedger(lockedUser.id, rewardKey, dq.rewardXp));
            lockedUser.totalXp += dq.rewardXp;
            users.save(lockedUser);
        }

        udq.claimed = true;
        udq.claimedAt = Instant.now();
        userQuests.save(udq);

        return new QuestClaimResult(toQuestView(udq, dq), AuthController.Profile.from(lockedUser));
    }

    @Transactional
    public MilestoneClaimResult claimDailyMilestone(String username) {
        User user = users.findByUsernameIgnoreCase(username)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "Không tìm thấy người dùng"));
        LocalDate today = LocalDate.now();
        List<UserDailyQuest> todayQuests = userQuests.findByUserIdAndQuestDate(user.id, today);

        if (todayQuests.size() < 3 || todayQuests.stream().anyMatch(q -> !q.completed)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "MILESTONE_NOT_READY", "Cần hoàn thành trọn vẹn cả 3 nhiệm vụ hôm nay trước khi mở rương");
        }

        UserQuestStreak streak = getOrInitStreak(user.id, today);
        if (today.equals(streak.milestoneClaimedDate)) {
            throw new ApiException(HttpStatus.CONFLICT, "ALREADY_CLAIMED", "Bạn đã mở Rương Tinh Tú hôm nay rồi");
        }

        String rewardKey = "DAILY_MILESTONE:" + today;
        User lockedUser = users.findWithLockById(user.id).orElseThrow();
        int rewardXp = 100;

        if (!xp.existsByUserIdAndRewardKey(lockedUser.id, rewardKey)) {
            xp.save(new XpLedger(lockedUser.id, rewardKey, rewardXp));
            lockedUser.totalXp += rewardXp;
            users.save(lockedUser);
        }

        LocalDate yesterday = today.minusDays(1);
        if (yesterday.equals(streak.lastCompletedDate)) {
            streak.currentStreak += 1;
        } else {
            streak.currentStreak = 1;
        }

        if (streak.currentStreak > streak.longestStreak) {
            streak.longestStreak = streak.currentStreak;
        }

        streak.lastCompletedDate = today;
        streak.milestoneClaimedDate = today;
        streaks.save(streak);

        MilestoneView milestone = new MilestoneView(todayQuests.size(), todayQuests.size(), true, true, 100);
        StreakView streakView = new StreakView(streak.currentStreak, streak.longestStreak, true);

        return new MilestoneClaimResult(milestone, streakView, AuthController.Profile.from(lockedUser));
    }

    private UserQuestStreak getOrInitStreak(Long userId, LocalDate today) {
        UserQuestStreak streak = streaks.findById(userId).orElseGet(() -> streaks.save(new UserQuestStreak(userId)));
        if (streak.lastCompletedDate != null && streak.lastCompletedDate.isBefore(today.minusDays(1))) {
            streak.currentStreak = 0;
            streaks.save(streak);
        }
        return streak;
    }

    public List<UserDailyQuest> ensureTodayQuests(Long userId, LocalDate today) {
        List<UserDailyQuest> existing = userQuests.findByUserIdAndQuestDate(userId, today);
        if (!existing.isEmpty()) return existing;

        List<DailyQuest> easy = new ArrayList<>(dailyQuests.findByTierAndActiveTrue("EASY"));
        List<DailyQuest> medium = new ArrayList<>(dailyQuests.findByTierAndActiveTrue("MEDIUM"));
        List<DailyQuest> hard = new ArrayList<>(dailyQuests.findByTierAndActiveTrue("HARD"));

        List<DailyQuest> chosen = new ArrayList<>();
        if (!easy.isEmpty()) {
            Collections.shuffle(easy);
            chosen.add(easy.get(0));
        }
        if (!medium.isEmpty()) {
            Collections.shuffle(medium);
            chosen.add(medium.get(0));
        }
        if (!hard.isEmpty()) {
            Collections.shuffle(hard);
            chosen.add(hard.get(0));
        }

        if (chosen.size() < 3) {
            List<DailyQuest> allActive = new ArrayList<>(dailyQuests.findByActiveTrue());
            Collections.shuffle(allActive);
            for (DailyQuest dq : allActive) {
                if (chosen.stream().noneMatch(c -> c.id.equals(dq.id))) {
                    chosen.add(dq);
                    if (chosen.size() == 3) break;
                }
            }
        }

        List<UserDailyQuest> created = new ArrayList<>();
        for (DailyQuest dq : chosen) {
            created.add(userQuests.save(new UserDailyQuest(userId, dq.id, today)));
        }
        return created;
    }

    private QuestView toQuestView(UserDailyQuest udq, DailyQuest dq) {
        return new QuestView(
                udq.id,
                dq.code,
                dq.tier,
                dq.title,
                dq.description,
                dq.category,
                dq.targetType,
                dq.targetCount,
                udq.currentProgress,
                dq.rewardXp,
                dq.icon,
                udq.completed,
                udq.claimed
        );
    }
}
