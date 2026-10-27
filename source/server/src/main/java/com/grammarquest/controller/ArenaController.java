package com.grammarquest.controller;

import com.grammarquest.entity.*;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.*;
import com.grammarquest.service.RealtimeNotifier;
import com.grammarquest.util.PvpRankRules;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/arena")
public class ArenaController {

    private final JdbcTemplate db;
    private final UserRepository users;
    private final RealtimeNotifier notifier;
    private final com.grammarquest.service.DailyQuestService dailyQuestService;

    public ArenaController(JdbcTemplate db, UserRepository users, RealtimeNotifier notifier) {
        this(db, users, notifier, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public ArenaController(
        JdbcTemplate db,
        UserRepository users,
        RealtimeNotifier notifier,
        com.grammarquest.service.DailyQuestService dailyQuestService
    ) {
        this.db = db;
        this.users = users;
        this.notifier = notifier;
        this.dailyQuestService = dailyQuestService;
    }

    public record Join(@NotBlank String code) {}

    public record Ready(boolean ready) {}

    public record Answer(int roundNo, @NotBlank String option) {}

    public record EquipCosmetic(@NotBlank String code) {}

    private User current(Authentication a) {
        User u = users.findByUsernameIgnoreCase(a.getName()).orElseThrow();
        if (u.locked) throw new ApiException(
            HttpStatus.FORBIDDEN,
            "ACCOUNT_LOCKED",
            "Tài khoản đã bị khóa"
        );
        if (u.role.equals("ADMIN")) throw new ApiException(
            HttpStatus.FORBIDDEN,
            "ADMIN_ONLY_MANAGEMENT",
            "Quản trị viên chỉ sử dụng chức năng quản trị"
        );
        if (!u.role.equals("LEARNER")) throw new ApiException(
            HttpStatus.FORBIDDEN,
            "LEARNER_ONLY",
            "Chỉ học viên được tham gia đấu trường"
        );
        return u;
    }

    private ApiException bad(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message);
    }

    private Map<String, Object> locked(long id) {
        var rows = db.queryForList("select * from arena_rooms where id=? for update", id);
        if (rows.isEmpty()) throw new ApiException(
            HttpStatus.NOT_FOUND,
            "ROOM_NOT_FOUND",
            "Không tìm thấy phòng đấu"
        );
        return rows.getFirst();
    }

    private void participant(Map<String, Object> room, User u) {
        if (
            !Objects.equals(((Number) room.get("host_id")).longValue(), u.id) &&
            !Objects.equals(
                room.get("guest_id") == null ? null : ((Number) room.get("guest_id")).longValue(),
                u.id
            )
        ) throw new ApiException(
            HttpStatus.FORBIDDEN,
            "ARENA_FORBIDDEN",
            "Bạn không thuộc phòng đấu này"
        );
    }

    private boolean host(Map<String, Object> r, User u) {
        return ((Number) r.get("host_id")).longValue() == u.id;
    }

    private void noActive(long userId) {
        Integer n = db.queryForObject(
            "select count(*) from arena_rooms where (host_id=? or guest_id=?) and status in ('CONFIRMING','WAITING','IN_PROGRESS')",
            Integer.class,
            userId,
            userId
        );
        if (n != null && n > 0) throw bad("ALREADY_IN_ROOM", "Bạn đang ở một phòng đấu khác");
    }

    private String generateRoomCode() {
        String code;
        do {
            code = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        } while (
            Objects.requireNonNullElse(
                db.queryForObject(
                    "select count(*) from arena_rooms where code=?",
                    Integer.class,
                    code
                ),
                0
            ) > 0
        );
        return code;
    }

    @GetMapping("/mine")
    @Transactional
    public Map<String, Object> mine(Authentication a) {
        User u = current(a);
        var ids = db.queryForList(
            "select id from arena_rooms where (host_id=? or guest_id=?) and status in ('CONFIRMING','WAITING','IN_PROGRESS') order by id desc limit 1",
            Long.class,
            u.id,
            u.id
        );
        return ids.isEmpty() ? Map.of() : get(a, ids.getFirst());
    }

    @GetMapping("/history")
    public List<Map<String, Object>> history(Authentication a) {
        User u = current(a);
        return db.queryForList(
            "select r.id,r.code,r.status,r.host_id as hostId,r.guest_id as guestId," +
                "h.display_name as hostName,g.display_name as guestName," +
                "r.host_score as hostScore,r.guest_score as guestScore,r.winner_id as winnerId," +
                "r.host_elo_before as hostEloBefore,r.guest_elo_before as guestEloBefore," +
                "r.host_elo_change as hostEloChange,r.guest_elo_change as guestEloChange," +
                "r.result_type as resultType,r.created_at as createdAt " +
                "from arena_rooms r join users h on h.id=r.host_id left join users g on g.id=r.guest_id " +
                "where (r.host_id=? or r.guest_id=?) and r.status='FINISHED' order by r.id desc limit 50",
            u.id,
            u.id
        );
    }

    @GetMapping("/leaderboard")
    @Transactional(readOnly = true)
    public Map<String, Object> leaderboard(Authentication a) {
        User u = current(a);
        var rows = db.queryForList(
            "select u.id as userId, u.username, u.display_name as displayName, " +
                "u.pvp_elo as elo, u.pvp_peak_elo as peakElo, " +
                "u.pvp_wins as wins, u.pvp_losses as losses, u.pvp_draws as draws, " +
                "u.pvp_win_streak as winStreak, u.pvp_best_win_streak as bestWinStreak, " +
                "u.equipped_frame as equippedFrame, u.equipped_badge as equippedBadge, " +
                "c.name as equippedBadgeName, c.css_class as equippedBadgeCss, f.css_class as equippedFrameCss " +
                "from users u " +
                "left join pvp_cosmetics c on c.code = u.equipped_badge " +
                "left join pvp_cosmetics f on f.code = u.equipped_frame " +
                "where u.role='LEARNER' and u.locked=false " +
                "order by u.pvp_elo desc, u.pvp_wins desc, u.id asc limit 50"
        );
        List<Map<String, Object>> leaders = new ArrayList<>();
        int rankPos = 1;
        for (var row : rows) {
            var item = new LinkedHashMap<String, Object>(row);
            int elo = ((Number) row.get("elo")).intValue();
            int wins = ((Number) row.get("wins")).intValue();
            int losses = ((Number) row.get("losses")).intValue();
            int draws = ((Number) row.get("draws")).intValue();
            int total = wins + losses + draws;
            var tier = PvpRankRules.fromElo(elo);
            item.put("rank", rankPos++);
            item.put("rankTier", tier.code());
            item.put("rankTitle", tier.title());
            item.put("rankColorClass", tier.colorClass());
            item.put("totalMatches", total);
            item.put("winRate", total > 0 ? Math.round((wins * 100.0) / total) : 0);
            leaders.add(item);
        }

        Integer higherCount = db.queryForObject(
            "select count(*) from users where role='LEARNER' and locked=false and " +
                "(pvp_elo > ? or (pvp_elo = ? and pvp_wins > ?) or (pvp_elo = ? and pvp_wins = ? and id < ?))",
            Integer.class,
            u.pvpElo,
            u.pvpElo,
            u.pvpWins,
            u.pvpElo,
            u.pvpWins,
            u.id
        );
        int myRank = (higherCount == null ? 0 : higherCount) + 1;
        var myTier = PvpRankRules.fromElo(u.pvpElo);
        int myTotal = u.pvpWins + u.pvpLosses + u.pvpDraws;
        Instant now = Instant.now();
        long banRem =
            u.pvpBanUntil != null && u.pvpBanUntil.isAfter(now)
                ? Math.max(1, Duration.between(now, u.pvpBanUntil).getSeconds())
                : 0;

        Map<String, Object> myStats = new LinkedHashMap<>();
        myStats.put("userId", u.id);
        myStats.put("username", u.username);
        myStats.put("displayName", u.displayName);
        myStats.put("rank", myRank);
        myStats.put("elo", u.pvpElo);
        myStats.put("peakElo", u.pvpPeakElo);
        myStats.put("rankTier", myTier.code());
        myStats.put("rankTitle", myTier.title());
        myStats.put("rankColorClass", myTier.colorClass());
        myStats.put("minElo", myTier.minElo());
        myStats.put("nextElo", myTier.nextElo());
        myStats.put("wins", u.pvpWins);
        myStats.put("losses", u.pvpLosses);
        myStats.put("draws", u.pvpDraws);
        myStats.put("totalMatches", myTotal);
        myStats.put("winRate", myTotal > 0 ? Math.round((u.pvpWins * 100.0) / myTotal) : 0);
        myStats.put("winStreak", u.pvpWinStreak);
        myStats.put("bestWinStreak", u.pvpBestWinStreak);
        myStats.put("declineCount", u.pvpDeclineCount);
        myStats.put("maxDeclines", PvpRankRules.MAX_DECLINE_COUNT);
        myStats.put("banUntil", banRem > 0 ? u.pvpBanUntil.toString() : null);
        myStats.put("banRemainingSeconds", banRem);
        myStats.put("equippedFrame", u.equippedFrame != null ? u.equippedFrame : "FRAME_DEFAULT");
        myStats.put("equippedBadge", u.equippedBadge);

        return Map.of("tiers", PvpRankRules.TIERS, "myStats", myStats, "leaders", leaders);
    }

    @GetMapping("/cosmetics")
    @Transactional
    public Map<String, Object> cosmetics(Authentication a) {
        User u = current(a);
        User lockedUser = users.findWithLockById(u.id).orElse(u);
        syncUserCosmetics(lockedUser);
        return buildCosmeticsView(lockedUser);
    }

    @PostMapping("/cosmetics/equip")
    @Transactional
    public Map<String, Object> equipCosmetic(
        Authentication a,
        @Valid @RequestBody EquipCosmetic body
    ) {
        User u = current(a);
        User lockedUser = users.findWithLockById(u.id).orElseThrow();
        syncUserCosmetics(lockedUser);
        String code = body.code().trim().toUpperCase();
        var rows = db.queryForList("select code, type from pvp_cosmetics where code=?", code);
        if (rows.isEmpty()) throw new ApiException(
            HttpStatus.NOT_FOUND,
            "COSMETIC_NOT_FOUND",
            "Không tìm thấy vật phẩm trang trí"
        );
        Integer unlocked = db.queryForObject(
            "select count(*) from user_cosmetics where user_id=? and cosmetic_code=?",
            Integer.class,
            lockedUser.id,
            code
        );
        if (unlocked == null || unlocked == 0) {
            throw new ApiException(
                HttpStatus.FORBIDDEN,
                "COSMETIC_LOCKED",
                "Bạn chưa mở khóa vật phẩm trang trí này"
            );
        }
        String type = String.valueOf(rows.getFirst().get("type"));
        if ("FRAME".equals(type)) {
            lockedUser.equippedFrame = code;
        } else if ("BADGE".equals(type)) {
            lockedUser.equippedBadge = code;
        }
        users.save(lockedUser);
        return buildCosmeticsView(lockedUser);
    }

    private void syncUserCosmetics(User u) {
        if (u == null || u.id == null) return;
        try {
            var defs = db.queryForList(
                "select code, type, unlock_type, unlock_threshold from pvp_cosmetics order by sort_order asc"
            );
            if (defs == null || defs.isEmpty()) return;
            int peakElo = Math.max(u.pvpElo, u.pvpPeakElo);
            int bestStreak = Math.max(u.pvpWinStreak, u.pvpBestWinStreak);
            int totalMatches = u.pvpWins + u.pvpLosses + u.pvpDraws;
            for (var d : defs) {
                String code = String.valueOf(d.get("code"));
                String unlockType = String.valueOf(d.get("unlock_type"));
                int threshold = ((Number) d.get("unlock_threshold")).intValue();
                boolean eligible = switch (unlockType) {
                    case "DEFAULT" -> true;
                    case "ELO_PEAK" -> peakElo >= threshold;
                    case "PVP_WINS" -> u.pvpWins >= threshold;
                    case "WIN_STREAK" -> bestStreak >= threshold;
                    case "MATCHES_PLAYED" -> totalMatches >= threshold;
                    default -> false;
                };
                if (eligible) {
                    db.update(
                        "insert ignore into user_cosmetics(user_id, cosmetic_code) values(?, ?)",
                        u.id,
                        code
                    );
                }
            }
            if (u.equippedFrame == null || u.equippedFrame.isBlank()) {
                u.equippedFrame = "FRAME_DEFAULT";
                users.save(u);
            }
            if (u.equippedBadge == null) {
                u.equippedBadge = "BADGE_BRONZE";
                users.save(u);
            }
        } catch (RuntimeException ignored) {
            // Bỏ qua trong môi trường mock JdbcTemplate không có bảng pvp_cosmetics
        }
    }

    private Map<String, Object> buildCosmeticsView(User u) {
        var defs = db.queryForList("select * from pvp_cosmetics order by sort_order asc");
        var unlockedRows = db.queryForList(
            "select cosmetic_code, unlocked_at from user_cosmetics where user_id=?",
            u.id
        );
        Map<String, Object> unlockedMap = new HashMap<>();
        for (var r : unlockedRows) {
            unlockedMap.put(String.valueOf(r.get("cosmetic_code")), r.get("unlocked_at"));
        }
        int peakElo = Math.max(u.pvpElo, u.pvpPeakElo);
        int bestStreak = Math.max(u.pvpWinStreak, u.pvpBestWinStreak);
        int totalMatches = u.pvpWins + u.pvpLosses + u.pvpDraws;

        List<Map<String, Object>> items = new ArrayList<>();
        for (var d : defs) {
            String code = String.valueOf(d.get("code"));
            String type = String.valueOf(d.get("type"));
            String unlockType = String.valueOf(d.get("unlock_type"));
            int threshold = ((Number) d.get("unlock_threshold")).intValue();
            int progress = switch (unlockType) {
                case "DEFAULT" -> 1;
                case "ELO_PEAK" -> peakElo;
                case "PVP_WINS" -> u.pvpWins;
                case "WIN_STREAK" -> bestStreak;
                case "MATCHES_PLAYED" -> totalMatches;
                default -> 0;
            };
            boolean isUnlocked = unlockedMap.containsKey(code);
            boolean isEquipped =
                ("FRAME".equals(type) && code.equals(u.equippedFrame)) ||
                ("BADGE".equals(type) && code.equals(u.equippedBadge));
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("code", code);
            item.put("type", type);
            item.put("name", d.get("name"));
            item.put("description", d.get("description"));
            item.put("unlockType", unlockType);
            item.put("unlockThreshold", threshold);
            item.put("currentProgress", progress);
            item.put("rankTier", d.get("rank_tier"));
            item.put("cssClass", d.get("css_class"));
            item.put("icon", d.get("icon"));
            item.put("unlocked", isUnlocked);
            item.put("equipped", isEquipped);
            item.put("unlockedAt", unlockedMap.get(code));
            items.add(item);
        }
        return Map.of(
            "equippedFrame",
            u.equippedFrame != null ? u.equippedFrame : "FRAME_DEFAULT",
            "equippedBadge",
            u.equippedBadge != null ? u.equippedBadge : "BADGE_BRONZE",
            "items",
            items,
            "profile",
            AuthController.Profile.from(u)
        );
    }

    /** Tạo phòng ghép cặp tự động ở trạng thái CONFIRMING (chờ 2 người chơi xác nhận tham gia trong 15 giây). */
    @Transactional
    public Map<String, Object> createMatched(Authentication authA, Authentication authB) {
        User a = current(authA);
        User b = current(authB);
        noActive(a.id);
        noActive(b.id);
        String code = generateRoomCode();
        Instant confirmDeadline = Instant.now().plusSeconds(PvpRankRules.CONFIRM_TIMEOUT_SECONDS);
        var key = new GeneratedKeyHolder();
        db.update(c -> {
            var ps = c.prepareStatement(
                "insert into arena_rooms(code,host_id,guest_id,status,host_ready,guest_ready,is_matchmade,confirm_deadline_at,host_elo_before,guest_elo_before) values(?,?,?,'CONFIRMING',false,false,true,?,?,?)",
                Statement.RETURN_GENERATED_KEYS
            );
            ps.setString(1, code);
            ps.setLong(2, a.id);
            ps.setLong(3, b.id);
            ps.setTimestamp(4, Timestamp.from(confirmDeadline));
            ps.setInt(5, a.pvpElo);
            ps.setInt(6, b.pvpElo);
            return ps;
        }, key);
        long id = Objects.requireNonNull(key.getKey()).longValue();
        notifier.arena(id);
        return snapshot(locked(id), a);
    }

    @PostMapping("/rooms")
    @Transactional
    public Map<String, Object> create(Authentication a) {
        User u = current(a);
        users.findWithLockById(u.id).orElseThrow();
        noActive(u.id);
        String code = generateRoomCode();
        var key = new GeneratedKeyHolder();
        String value = code;
        db.update(c -> {
            var ps = c.prepareStatement(
                "insert into arena_rooms(code,host_id) values(?,?)",
                Statement.RETURN_GENERATED_KEYS
            );
            ps.setString(1, value);
            ps.setLong(2, u.id);
            return ps;
        }, key);
        long id = Objects.requireNonNull(key.getKey()).longValue();
        try {
            db.update("update arena_rooms set host_elo_before=? where id=?", u.pvpElo, id);
        } catch (RuntimeException ignored) {}
        notifier.arena(id);
        return snapshot(locked(id), u);
    }

    @PostMapping("/join")
    @Transactional
    public Map<String, Object> join(Authentication a, @Valid @RequestBody Join body) {
        User u = current(a);
        users.findWithLockById(u.id).orElseThrow();
        var ids = db.queryForList(
            "select id from arena_rooms where code=?",
            Long.class,
            body.code().trim().toUpperCase()
        );
        if (ids.isEmpty()) throw new ApiException(
            HttpStatus.NOT_FOUND,
            "ROOM_NOT_FOUND",
            "Mã phòng không tồn tại"
        );
        Map<String, Object> r = locked(ids.getFirst());
        if (
            host(r, u) ||
            Objects.equals(
                r.get("guest_id") == null ? null : ((Number) r.get("guest_id")).longValue(),
                u.id
            )
        ) return snapshot(r, u);
        noActive(u.id);
        if (!"WAITING".equals(r.get("status")) || r.get("guest_id") != null) throw bad(
            "ROOM_FULL",
            "Phòng đã đủ người hoặc đã bắt đầu"
        );
        db.update(
            "update arena_rooms set guest_id=?,guest_ready=false,state_version=state_version+1 where id=?",
            u.id,
            ids.getFirst()
        );
        try {
            db.update(
                "update arena_rooms set guest_elo_before=? where id=?",
                u.pvpElo,
                ids.getFirst()
            );
        } catch (RuntimeException ignored) {}
        notifier.arena(ids.getFirst());
        return snapshot(locked(ids.getFirst()), u);
    }

    @GetMapping("/rooms/{id}")
    @Transactional
    public Map<String, Object> get(Authentication a, @PathVariable long id) {
        User u = current(a);
        Map<String, Object> r = locked(id);
        participant(r, u);
        if ("CONFIRMING".equals(r.get("status"))) {
            settleConfirmTimeout(r);
            return snapshot(locked(id), u);
        }
        r = presence(r, u);
        settle(r);
        return snapshot(locked(id), u);
    }

    /** Xác nhận tham gia trận đấu khi ghép cặp thành công. */
    @PostMapping("/rooms/{id}/confirm")
    @Transactional
    public Map<String, Object> confirm(Authentication a, @PathVariable long id) {
        User u = current(a);
        Map<String, Object> r = locked(id);
        participant(r, u);
        if ("CONFIRMING".equals(r.get("status"))) {
            settleConfirmTimeout(r);
            r = locked(id);
            if (!"CONFIRMING".equals(r.get("status"))) {
                return snapshot(r, u);
            }
            boolean isHost = host(r, u);
            db.update(
                "update arena_rooms set " +
                    (isHost ? "host_ready" : "guest_ready") +
                    "=true, state_version=state_version+1 where id=?",
                id
            );
            resetDeclineCount(u.id);
            r = locked(id);
            if (
                Boolean.TRUE.equals(r.get("host_ready")) &&
                Boolean.TRUE.equals(r.get("guest_ready"))
            ) {
                beginMatchQuestionsAndClocks(id, PvpRankRules.START_COUNTDOWN_SECONDS);
            }
            notifier.arena(id);
            return snapshot(locked(id), u);
        }
        if ("WAITING".equals(r.get("status"))) {
            return ready(a, id, new Ready(true));
        }
        return snapshot(r, u);
    }

    /** Từ chối xác nhận tham gia trận đấu (tính số lần từ chối và cấm ghép trận tạm thời nếu vi phạm quá giới hạn). */
    @PostMapping("/rooms/{id}/decline")
    @Transactional
    public Map<String, Object> decline(Authentication a, @PathVariable long id) {
        User u = current(a);
        Map<String, Object> r = locked(id);
        participant(r, u);
        if ("CONFIRMING".equals(r.get("status"))) {
            db.update(
                "update arena_rooms set status='CANCELLED', cancel_reason='DECLINED', confirm_deadline_at=null, state_version=state_version+1 where id=?",
                id
            );
            recordDeclinePenalty(u.id);
            notifier.arena(id);
            return snapshot(locked(id), u);
        }
        if ("WAITING".equals(r.get("status"))) {
            return leave(a, id);
        }
        throw bad("ROOM_STARTED", "Trận đấu đã bắt đầu, không thể từ chối xác nhận");
    }

    private void resetDeclineCount(long userId) {
        users.findWithLockById(userId).ifPresent(user -> {
            if (user.pvpDeclineCount > 0 || user.pvpBanUntil != null) {
                user.pvpDeclineCount = 0;
                user.pvpBanUntil = null;
                users.save(user);
            }
        });
    }

    private void recordDeclinePenalty(long userId) {
        users.findWithLockById(userId).ifPresent(user -> {
            Instant now = Instant.now();
            int nextCount =
                user.pvpBanUntil != null &&
                user.pvpBanUntil.isBefore(now) &&
                user.pvpDeclineCount >= PvpRankRules.MAX_DECLINE_COUNT
                    ? 1
                    : user.pvpDeclineCount + 1;
            user.pvpDeclineCount = nextCount;
            if (nextCount >= PvpRankRules.MAX_DECLINE_COUNT) {
                user.pvpBanUntil = now.plusSeconds(PvpRankRules.TEMP_BAN_SECONDS);
            }
            users.save(user);
        });
    }

    private void settleConfirmTimeout(Map<String, Object> r) {
        if (!"CONFIRMING".equals(r.get("status"))) return;
        Timestamp deadline = (Timestamp) r.get("confirm_deadline_at");
        if (deadline == null || deadline.toInstant().isAfter(Instant.now())) return;
        long id = ((Number) r.get("id")).longValue();
        long hostId = ((Number) r.get("host_id")).longValue();
        Long guestId = r.get("guest_id") == null ? null : ((Number) r.get("guest_id")).longValue();
        boolean hostConfirmed = Boolean.TRUE.equals(r.get("host_ready"));
        boolean guestConfirmed = Boolean.TRUE.equals(r.get("guest_ready"));
        db.update(
            "update arena_rooms set status='CANCELLED', cancel_reason='CONFIRM_TIMEOUT', confirm_deadline_at=null, state_version=state_version+1 where id=?",
            id
        );
        if (!hostConfirmed) recordDeclinePenalty(hostId);
        if (guestId != null && !guestConfirmed) recordDeclinePenalty(guestId);
        notifier.arena(id);
    }

    @PostMapping("/rooms/{id}/ready")
    @Transactional
    public Map<String, Object> ready(
        Authentication a,
        @PathVariable long id,
        @Valid @RequestBody Ready body
    ) {
        User u = current(a);
        Map<String, Object> r = locked(id);
        participant(r, u);
        if ("CONFIRMING".equals(r.get("status"))) {
            return body.ready() ? confirm(a, id) : decline(a, id);
        }
        if (!"WAITING".equals(r.get("status"))) throw bad("ROOM_STARTED", "Trận đấu đã bắt đầu");
        db.update(
            "update arena_rooms set " +
                (host(r, u) ? "host_ready" : "guest_ready") +
                "=?,state_version=state_version+1 where id=?",
            body.ready(),
            id
        );
        notifier.arena(id);
        return snapshot(locked(id), u);
    }

    @PostMapping("/rooms/{id}/start")
    @Transactional
    public Map<String, Object> start(Authentication a, @PathVariable long id) {
        User u = current(a);
        Map<String, Object> r = locked(id);
        if (!host(r, u)) throw new ApiException(
            HttpStatus.FORBIDDEN,
            "HOST_ONLY",
            "Chỉ chủ phòng được bắt đầu"
        );
        if (
            !"WAITING".equals(r.get("status")) ||
            r.get("guest_id") == null ||
            !Boolean.TRUE.equals(r.get("host_ready")) ||
            !Boolean.TRUE.equals(r.get("guest_ready"))
        ) throw bad("NOT_READY", "Cần hai người chơi cùng sẵn sàng");
        beginMatchQuestionsAndClocks(id, 0);
        notifier.arena(id);
        return snapshot(locked(id), u);
    }

    private void beginMatchQuestionsAndClocks(long id, int countdownSeconds) {
        var ids = db.queryForList(
            "select id from questions where published=true and (question_type is null or question_type='MCQ') order by rand() limit 10",
            Long.class
        );
        if (ids.size() < 10) throw bad(
            "QUESTION_BANK_INCOMPLETE",
            "Cần ít nhất 10 câu hỏi để thi đấu"
        );
        for (int i = 0; i < 10; i++) db.update(
            "insert into arena_rounds(room_id,round_no,question_id,prompt,option_a,option_b,option_c,option_d,correct_option,explanation) select ?,?,id,prompt,option_a,option_b,option_c,option_d,correct_option,explanation from questions where id=?",
            id,
            i + 1,
            ids.get(i)
        );
        Instant now = Instant.now();
        Instant roundStart = now.plusSeconds(Math.max(0, countdownSeconds));
        Instant roundDeadline = roundStart.plusSeconds(PvpRankRules.ROUND_TIME_LIMIT_SECONDS);
        Instant matchDeadline = roundStart.plusSeconds(PvpRankRules.MATCH_TIME_LIMIT_SECONDS);
        db.update(
            "update arena_rounds set started_at=? where room_id=? and round_no=1",
            Timestamp.from(roundStart),
            id
        );
        db.update(
            "update arena_rooms set status='IN_PROGRESS',current_round=1,round_deadline_at=?,host_seen_at=?,guest_seen_at=?,state_version=state_version+1 where id=?",
            Timestamp.from(roundDeadline),
            Timestamp.from(now),
            Timestamp.from(now),
            id
        );
        try {
            db.update(
                "update arena_rooms set confirm_deadline_at=null, countdown_until=?, match_deadline_at=? where id=?",
                countdownSeconds > 0 ? Timestamp.from(roundStart) : null,
                Timestamp.from(matchDeadline),
                id
            );
        } catch (RuntimeException ignored) {}
    }

    @PostMapping("/rooms/{id}/answers")
    @Transactional
    public Map<String, Object> answer(
        Authentication a,
        @PathVariable long id,
        @Valid @RequestBody Answer body
    ) {
        User u = current(a);
        Map<String, Object> r = locked(id);
        participant(r, u);
        r = presence(r, u);
        if ("IN_PROGRESS".equals(r.get("status")) && r.get("pause_started_at") != null) throw bad(
            "MATCH_PAUSED",
            "Trận đang tạm dừng để chờ người chơi kết nối lại"
        );
        Timestamp countdownUntil = (Timestamp) r.get("countdown_until");
        if (countdownUntil != null && countdownUntil.toInstant().isAfter(Instant.now())) {
            throw bad(
                "COUNTDOWN_ACTIVE",
                "Trận đấu đang đếm ngược bắt đầu, vui lòng chờ kết thúc đếm ngược"
            );
        }
        if (body.roundNo() != ((Number) r.get("current_round")).intValue()) throw bad(
            "STALE_ROUND",
            "Câu hỏi đã chuyển vòng"
        );
        settle(r);
        r = locked(id);
        if (!"IN_PROGRESS".equals(r.get("status"))) throw bad(
            "MATCH_FINISHED",
            "Trận đấu đã kết thúc"
        );
        if (body.roundNo() != ((Number) r.get("current_round")).intValue()) throw bad(
            "STALE_ROUND",
            "Câu hỏi đã hết giờ"
        );
        String option = body.option().toUpperCase();
        if (!option.matches("[ABCD]")) throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "INVALID_OPTION",
            "Đáp án phải là A, B, C hoặc D"
        );
        String field = host(r, u) ? "host" : "guest";
        int round = ((Number) r.get("current_round")).intValue();
        var old = db.queryForMap(
            "select host_answer,guest_answer from arena_rounds where room_id=? and round_no=?",
            id,
            round
        );
        if (old.get(field + "_answer") != null) {
            if (!option.equals(old.get(field + "_answer"))) throw bad(
                "ALREADY_ANSWERED",
                "Bạn đã trả lời vòng này"
            );
            return snapshot(r, u);
        }
        db.update(
            "update arena_rounds set " +
                field +
                "_answer=?," +
                field +
                "_answered_at=? where room_id=? and round_no=?",
            option,
            Timestamp.from(Instant.now()),
            id,
            round
        );
        db.update("update arena_rooms set state_version=state_version+1 where id=?", id);
        notifier.arena(id);
        settle(locked(id));
        return snapshot(locked(id), u);
    }

    @PostMapping("/rooms/{id}/leave")
    @Transactional
    public Map<String, Object> leave(Authentication a, @PathVariable long id) {
        User u = current(a);
        Map<String, Object> r = locked(id);
        participant(r, u);
        if ("CONFIRMING".equals(r.get("status"))) {
            return decline(a, id);
        }
        if ("WAITING".equals(r.get("status"))) {
            if (host(r, u) && r.get("guest_id") != null) db.update(
                "update arena_rooms set host_id=guest_id,guest_id=null,host_ready=guest_ready,guest_ready=false,state_version=state_version+1 where id=?",
                id
            );
            else if (host(r, u)) db.update(
                "update arena_rooms set status='CANCELLED',state_version=state_version+1 where id=?",
                id
            );
            else db.update(
                "update arena_rooms set guest_id=null,guest_ready=false,state_version=state_version+1 where id=?",
                id
            );
        } else if ("IN_PROGRESS".equals(r.get("status"))) {
            long winner = host(r, u)
                ? ((Number) r.get("guest_id")).longValue()
                : ((Number) r.get("host_id")).longValue();
            int hostScore = ((Number) r.get("host_score")).intValue();
            int guestScore = ((Number) r.get("guest_score")).intValue();
            finishMatchWithElo(r, hostScore, guestScore, winner, "FORFEIT");
        }
        notifier.arena(id);
        return snapshot(locked(id), u);
    }

    private void finishMatchWithElo(
        Map<String, Object> r,
        int hostScore,
        int guestScore,
        Long winnerId,
        String resultType
    ) {
        long id = ((Number) r.get("id")).longValue();
        long hostId = ((Number) r.get("host_id")).longValue();
        Long guestId = r.get("guest_id") == null ? null : ((Number) r.get("guest_id")).longValue();
        db.update(
            "update arena_rooms set status='FINISHED',host_score=?,guest_score=?,winner_id=?,round_deadline_at=null,pause_started_at=null,paused_user_id=null,state_version=state_version+1 where id=?",
            hostScore,
            guestScore,
            winnerId,
            id
        );

        if (guestId != null && !Boolean.TRUE.equals(r.get("elo_settled"))) {
            long firstId = Math.min(hostId, guestId);
            long secondId = Math.max(hostId, guestId);
            users.findWithLockById(firstId);
            users.findWithLockById(secondId);
            User hostUser = users.findById(hostId).orElse(null);
            User guestUser = users.findById(guestId).orElse(null);
            if (hostUser != null && guestUser != null) {
                int hostEloBefore = hostUser.pvpElo;
                int guestEloBefore = guestUser.pvpElo;
                double hostActual = winnerId == null ? 0.5 : winnerId == hostId ? 1.0 : 0.0;
                double guestActual = 1.0 - hostActual;
                int hostDelta = PvpRankRules.calculateEloChange(
                    hostEloBefore,
                    guestEloBefore,
                    hostActual
                );
                int guestDelta = PvpRankRules.calculateEloChange(
                    guestEloBefore,
                    hostEloBefore,
                    guestActual
                );

                hostUser.pvpElo = PvpRankRules.applyEloChange(hostEloBefore, hostDelta);
                hostUser.pvpPeakElo = Math.max(hostUser.pvpPeakElo, hostUser.pvpElo);
                guestUser.pvpElo = PvpRankRules.applyEloChange(guestEloBefore, guestDelta);
                guestUser.pvpPeakElo = Math.max(guestUser.pvpPeakElo, guestUser.pvpElo);

                if (winnerId == null) {
                    hostUser.pvpDraws++;
                    hostUser.pvpWinStreak = 0;
                    guestUser.pvpDraws++;
                    guestUser.pvpWinStreak = 0;
                } else if (winnerId == hostId) {
                    hostUser.pvpWins++;
                    hostUser.pvpWinStreak++;
                    hostUser.pvpBestWinStreak = Math.max(
                        hostUser.pvpBestWinStreak,
                        hostUser.pvpWinStreak
                    );
                    guestUser.pvpLosses++;
                    guestUser.pvpWinStreak = 0;
                } else {
                    guestUser.pvpWins++;
                    guestUser.pvpWinStreak++;
                    guestUser.pvpBestWinStreak = Math.max(
                        guestUser.pvpBestWinStreak,
                        guestUser.pvpWinStreak
                    );
                    hostUser.pvpLosses++;
                    hostUser.pvpWinStreak = 0;
                }
                users.save(hostUser);
                users.save(guestUser);
                syncUserCosmetics(hostUser);
                syncUserCosmetics(guestUser);

                try {
                    db.update(
                        "update arena_rooms set host_elo_before=?,guest_elo_before=?,host_elo_change=?,guest_elo_change=?,result_type=?,elo_settled=true where id=?",
                        hostEloBefore,
                        guestEloBefore,
                        hostDelta,
                        guestDelta,
                        resultType,
                        id
                    );
                } catch (RuntimeException ignored) {}
            }
        }
        if (dailyQuestService != null) {
            dailyQuestService.recordProgress(hostId, "ARENA_PLAY", 1);
            if (guestId != null) dailyQuestService.recordProgress(guestId, "ARENA_PLAY", 1);
            if (winnerId != null) dailyQuestService.recordProgress(winnerId, "ARENA_WIN", 1);
        }
    }

    private Map<String, Object> presence(Map<String, Object> r, User u) {
        if (!"IN_PROGRESS".equals(r.get("status"))) return r;
        long id = ((Number) r.get("id")).longValue();
        Instant now = Instant.now();
        Timestamp pause = (Timestamp) r.get("pause_started_at");
        Long pausedId =
            r.get("paused_user_id") == null ? null : ((Number) r.get("paused_user_id")).longValue();
        if (pause != null && now.isAfter(pause.toInstant().plusSeconds(30))) {
            long winner = Objects.equals(pausedId, ((Number) r.get("host_id")).longValue())
                ? ((Number) r.get("guest_id")).longValue()
                : ((Number) r.get("host_id")).longValue();
            int hostScore = ((Number) r.get("host_score")).intValue();
            int guestScore = ((Number) r.get("guest_score")).intValue();
            finishMatchWithElo(r, hostScore, guestScore, winner, "TIMEOUT_FORFEIT");
            notifier.arena(id);
            return locked(id);
        }
        boolean isHost = host(r, u);
        db.update(
            "update arena_rooms set " +
                (isHost ? "host_seen_at" : "guest_seen_at") +
                "=? where id=?",
            Timestamp.from(now),
            id
        );
        if (pause != null) {
            if (Objects.equals(pausedId, u.id)) {
                Duration pausedDuration = Duration.between(pause.toInstant(), now);
                Instant next = ((Timestamp) r.get("round_deadline_at"))
                    .toInstant()
                    .plus(pausedDuration);
                db.update(
                    "update arena_rooms set round_deadline_at=?,pause_started_at=null,paused_user_id=null,state_version=state_version+1 where id=?",
                    Timestamp.from(next),
                    id
                );
                Timestamp matchDeadline = (Timestamp) r.get("match_deadline_at");
                if (matchDeadline != null) {
                    try {
                        db.update(
                            "update arena_rooms set match_deadline_at=? where id=?",
                            Timestamp.from(matchDeadline.toInstant().plus(pausedDuration)),
                            id
                        );
                    } catch (RuntimeException ignored) {}
                }
                notifier.arena(id);
            }
            return locked(id);
        }
        Timestamp other = (Timestamp) r.get(isHost ? "guest_seen_at" : "host_seen_at");
        if (other != null && other.toInstant().plusSeconds(8).isBefore(now)) {
            Instant since = other.toInstant().plusSeconds(8);
            long absent = ((Number) r.get(isHost ? "guest_id" : "host_id")).longValue();
            if (now.isAfter(since.plusSeconds(30))) {
                int hostScore = ((Number) r.get("host_score")).intValue();
                int guestScore = ((Number) r.get("guest_score")).intValue();
                finishMatchWithElo(r, hostScore, guestScore, u.id, "TIMEOUT_FORFEIT");
            } else {
                db.update(
                    "update arena_rooms set pause_started_at=?,paused_user_id=?,state_version=state_version+1 where id=?",
                    Timestamp.from(since),
                    absent,
                    id
                );
            }
            notifier.arena(id);
        }
        return locked(id);
    }

    private void settle(Map<String, Object> r) {
        if (!"IN_PROGRESS".equals(r.get("status")) || r.get("pause_started_at") != null) return;
        Instant now = Instant.now();
        Timestamp countdownUntil = (Timestamp) r.get("countdown_until");
        if (countdownUntil != null && countdownUntil.toInstant().isAfter(now)) return;

        long id = ((Number) r.get("id")).longValue();
        int no = ((Number) r.get("current_round")).intValue();
        var round = db.queryForMap(
            "select correct_option,host_answer,guest_answer from arena_rounds where room_id=? and round_no=?",
            id,
            no
        );
        Timestamp matchDeadline = (Timestamp) r.get("match_deadline_at");
        boolean matchExpired = matchDeadline != null && !matchDeadline.toInstant().isAfter(now);
        boolean bothAnswered =
            round.get("host_answer") != null && round.get("guest_answer") != null;
        boolean roundExpired = !((Timestamp) r.get("round_deadline_at")).toInstant().isAfter(now);
        if (!bothAnswered && !roundExpired && !matchExpired) return;

        int hs = Objects.equals(round.get("host_answer"), round.get("correct_option")) ? 1 : 0;
        int gs = Objects.equals(round.get("guest_answer"), round.get("correct_option")) ? 1 : 0;
        db.update("update arena_rounds set closed=true where room_id=? and round_no=?", id, no);
        int hostScore = ((Number) r.get("host_score")).intValue() + hs;
        int guestScore = ((Number) r.get("guest_score")).intValue() + gs;
        if (no >= ((Number) r.get("question_limit")).intValue() || matchExpired) {
            Long winner = null;
            String resultType = "DRAW";
            if (hostScore != guestScore) {
                winner =
                    hostScore > guestScore
                        ? ((Number) r.get("host_id")).longValue()
                        : ((Number) r.get("guest_id")).longValue();
                resultType = matchExpired ? "MATCH_TIME_LIMIT" : "SCORE";
            } else {
                var speed = db.queryForMap(
                    "select coalesce(sum(case when host_answer=correct_option then timestampdiff(microsecond,started_at,host_answered_at) else 0 end),0) as hostTime,coalesce(sum(case when guest_answer=correct_option then timestampdiff(microsecond,started_at,guest_answered_at) else 0 end),0) as guestTime from arena_rounds where room_id=?",
                    id
                );
                long h = ((Number) speed.get("hostTime")).longValue(),
                    g = ((Number) speed.get("guestTime")).longValue();
                if (h != g) {
                    winner =
                        h < g
                            ? ((Number) r.get("host_id")).longValue()
                            : ((Number) r.get("guest_id")).longValue();
                    resultType = "SPEED_TIEBREAKER";
                }
            }
            finishMatchWithElo(r, hostScore, guestScore, winner, resultType);
        } else {
            Instant next = Instant.now();
            db.update(
                "update arena_rounds set started_at=? where room_id=? and round_no=?",
                Timestamp.from(next),
                id,
                no + 1
            );
            db.update(
                "update arena_rooms set host_score=?,guest_score=?,current_round=?,round_deadline_at=?,state_version=state_version+1 where id=?",
                hostScore,
                guestScore,
                no + 1,
                Timestamp.from(next.plusSeconds(PvpRankRules.ROUND_TIME_LIMIT_SECONDS)),
                id
            );
        }
        notifier.arena(id);
    }

    /** Vòng đồng hồ server: hết giờ xác nhận, hết giờ câu hỏi hoặc hết giờ toàn trận vẫn tự chuyển trạng thái. */
    @Transactional
    public void advance(long id) {
        var room = locked(id);
        if ("CONFIRMING".equals(room.get("status"))) {
            settleConfirmTimeout(room);
            return;
        }
        if (!"IN_PROGRESS".equals(room.get("status"))) return;
        var pause = (Timestamp) room.get("pause_started_at");
        if (pause != null && Instant.now().isAfter(pause.toInstant().plusSeconds(30))) {
            long absent = ((Number) room.get("paused_user_id")).longValue();
            long winner =
                absent == ((Number) room.get("host_id")).longValue()
                    ? ((Number) room.get("guest_id")).longValue()
                    : ((Number) room.get("host_id")).longValue();
            int hostScore =
                room.get("host_score") == null ? 0 : ((Number) room.get("host_score")).intValue();
            int guestScore =
                room.get("guest_score") == null ? 0 : ((Number) room.get("guest_score")).intValue();
            finishMatchWithElo(room, hostScore, guestScore, winner, "TIMEOUT_FORFEIT");
            notifier.arena(id);
        } else settle(room);
    }

    private Map<String, Object> snapshot(Map<String, Object> r, User u) {
        long id = ((Number) r.get("id")).longValue();
        boolean isHost = host(r, u);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("code", r.get("code"));
        out.put("status", r.get("status"));
        out.put("stateVersion", r.get("state_version"));
        out.put("pausedUserId", r.get("paused_user_id"));
        out.put(
            "pauseExpiresAt",
            r.get("pause_started_at") == null
                ? null
                : ((Timestamp) r.get("pause_started_at")).toInstant().plusSeconds(30)
        );
        out.put("hostId", r.get("host_id"));
        out.put("guestId", r.get("guest_id"));
        out.put(
            "hostName",
            db.queryForObject(
                "select display_name from users where id=?",
                String.class,
                r.get("host_id")
            )
        );
        out.put(
            "guestName",
            r.get("guest_id") == null
                ? null
                : db.queryForObject(
                      "select display_name from users where id=?",
                      String.class,
                      r.get("guest_id")
                  )
        );
        out.put("hostReady", r.get("host_ready"));
        out.put("guestReady", r.get("guest_ready"));
        out.put("hostScore", r.get("host_score"));
        out.put("guestScore", r.get("guest_score"));
        out.put("currentRound", r.get("current_round"));
        out.put("questionLimit", r.get("question_limit"));
        out.put("deadlineAt", r.get("round_deadline_at"));
        out.put("winnerId", r.get("winner_id"));
        out.put("isHost", isHost);

        out.put("isMatchmade", Boolean.TRUE.equals(r.get("is_matchmade")));
        out.put("confirmDeadlineAt", r.get("confirm_deadline_at"));
        out.put("countdownUntil", r.get("countdown_until"));
        out.put("matchDeadlineAt", r.get("match_deadline_at"));
        out.put(
            "hostEloBefore",
            r.get("host_elo_before") != null ? r.get("host_elo_before") : 1000
        );
        out.put(
            "guestEloBefore",
            r.get("guest_elo_before") != null ? r.get("guest_elo_before") : 1000
        );
        out.put("hostEloChange", r.get("host_elo_change") != null ? r.get("host_elo_change") : 0);
        out.put(
            "guestEloChange",
            r.get("guest_elo_change") != null ? r.get("guest_elo_change") : 0
        );
        out.put("resultType", r.get("result_type"));
        out.put("cancelReason", r.get("cancel_reason"));

        try {
            long hostId = ((Number) r.get("host_id")).longValue();
            users.findById(hostId).ifPresent(hu -> {
                var tier = PvpRankRules.fromElo(hu.pvpElo);
                out.put("hostElo", hu.pvpElo);
                out.put("hostRankTier", tier.code());
                out.put("hostRankTitle", tier.title());
                out.put("hostFrame", hu.equippedFrame != null ? hu.equippedFrame : "FRAME_DEFAULT");
                out.put("hostBadge", hu.equippedBadge);
            });
            if (r.get("guest_id") != null) {
                long guestId = ((Number) r.get("guest_id")).longValue();
                users.findById(guestId).ifPresent(gu -> {
                    var tier = PvpRankRules.fromElo(gu.pvpElo);
                    out.put("guestElo", gu.pvpElo);
                    out.put("guestRankTier", tier.code());
                    out.put("guestRankTitle", tier.title());
                    out.put(
                        "guestFrame",
                        gu.equippedFrame != null ? gu.equippedFrame : "FRAME_DEFAULT"
                    );
                    out.put("guestBadge", gu.equippedBadge);
                });
            }
        } catch (RuntimeException ignored) {}

        int no = ((Number) r.get("current_round")).intValue();
        if (no > 0) {
            var q = db.queryForMap(
                "select round_no,prompt,option_a,option_b,option_c,option_d,host_answer,guest_answer from arena_rounds where room_id=? and round_no=?",
                id,
                no
            );
            if ("IN_PROGRESS".equals(r.get("status"))) {
                out.put(
                    "question",
                    Map.of(
                        "roundNo",
                        no,
                        "prompt",
                        q.get("prompt"),
                        "options",
                        List.of(
                            q.get("option_a"),
                            q.get("option_b"),
                            q.get("option_c"),
                            q.get("option_d")
                        )
                    )
                );
                out.put("myAnswer", q.get(isHost ? "host_answer" : "guest_answer"));
                out.put("opponentAnswered", q.get(isHost ? "guest_answer" : "host_answer") != null);
            }
            int previous = "FINISHED".equals(r.get("status")) ? no : no - 1;
            if (previous > 0) {
                var result = db.queryForMap(
                    "select round_no,correct_option,host_answer,guest_answer,explanation,closed from arena_rounds where room_id=? and round_no=?",
                    id,
                    previous
                );
                if (Boolean.TRUE.equals(result.get("closed"))) out.put(
                    "lastResult",
                    Map.of(
                        "roundNo",
                        previous,
                        "correctOption",
                        result.get("correct_option"),
                        "explanation",
                        result.get("explanation"),
                        "hostCorrect",
                        Objects.equals(result.get("host_answer"), result.get("correct_option")),
                        "guestCorrect",
                        Objects.equals(result.get("guest_answer"), result.get("correct_option"))
                    )
                );
            }
        }
        return out;
    }
}
