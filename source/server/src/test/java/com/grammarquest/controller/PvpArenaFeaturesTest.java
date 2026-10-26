package com.grammarquest.controller;

import com.grammarquest.entity.User;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import com.grammarquest.service.ArenaMatchFactory;
import com.grammarquest.service.ArenaMatchmaker;
import com.grammarquest.service.RealtimeNotifier;
import com.grammarquest.util.PvpRankRules;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PvpArenaFeaturesTest {
    record MatchFixture(ArenaController controller,JdbcTemplate db,UserRepository users,User host,User guest) {}
    private MatchFixture finalRound(boolean ranked,int hostScore,int guestScore,int hostElo,int guestElo){
        var db=mock(JdbcTemplate.class);var users=mock(UserRepository.class);
        var host=new User("host","Host","unused");host.id=1L;host.pvpElo=hostElo;
        var guest=new User("guest","Guest","unused");guest.id=2L;guest.pvpElo=guestElo;
        when(users.findWithLockById(1L)).thenReturn(Optional.of(host));when(users.findWithLockById(2L)).thenReturn(Optional.of(guest));
        when(users.findById(1L)).thenReturn(Optional.of(host));when(users.findById(2L)).thenReturn(Optional.of(guest));
        var room=new HashMap<String,Object>();room.put("id",99L);room.put("is_matchmade",ranked);room.put("status","IN_PROGRESS");
        room.put("host_id",1L);room.put("guest_id",2L);room.put("current_round",10);room.put("question_limit",10);
        room.put("host_score",hostScore);room.put("guest_score",guestScore);room.put("round_deadline_at",Timestamp.from(Instant.now().minusSeconds(1)));
        when(db.queryForList("select * from arena_rooms where id=? for update",99L)).thenReturn(List.of(room));
        when(db.queryForMap("select correct_option,host_answer,guest_answer from arena_rounds where room_id=? and round_no=?",99L,10))
            .thenReturn(Map.of("correct_option","A","host_answer","B","guest_answer","B"));
        return new MatchFixture(new ArenaController(db,users,mock(RealtimeNotifier.class)),db,users,host,guest);
    }
    @Test void friendlyRoomDoesNotChangeEloRankedStatsOrCosmetics(){
        var f=finalRound(false,8,3,1000,1200);f.controller.advance(99L);
        assertEquals(1000,f.host.pvpElo);assertEquals(1200,f.guest.pvpElo);
        assertEquals(0,f.host.pvpWins);assertEquals(0,f.guest.pvpLosses);
        verify(f.users,never()).save(any());
        verify(f.db).update("update arena_rooms set result_type=?,elo_settled=true where id=?","SCORE",99L);
    }
    @Test void equalCorrectAnswersDrawWithoutSpeedTiebreaker(){
        var f=finalRound(true,7,7,1000,1000);f.controller.advance(99L);
        assertEquals(1000,f.host.pvpElo);assertEquals(1000,f.guest.pvpElo);
        assertEquals(1,f.host.pvpDraws);assertEquals(1,f.guest.pvpDraws);
        verify(f.db).update("update arena_rooms set host_elo_before=?,guest_elo_before=?,host_elo_change=?,guest_elo_change=?,result_type=?,elo_settled=true where id=?",1000,1000,0,0,"DRAW",99L);
    }
    @Test void recordedLossAtEloFloorMatchesActualBalance(){
        var f=finalRound(true,0,1,100,100);f.controller.advance(99L);
        assertEquals(100,f.host.pvpElo);assertEquals(116,f.guest.pvpElo);
        verify(f.db).update("update arena_rooms set host_elo_before=?,guest_elo_before=?,host_elo_change=?,guest_elo_change=?,result_type=?,elo_settled=true where id=?",100,100,0,16,"SCORE",99L);
    }

    @Test
    void eloAndRankTiersCalculateAccuratelyAndDoNotAffectLearningXp() {
        // Kiểm tra phân hạng Đồng -> Cao Thủ
        assertEquals("BRONZE", PvpRankRules.fromElo(950).code());
        assertEquals("Đồng", PvpRankRules.fromElo(1000).title());
        assertEquals("SILVER", PvpRankRules.fromElo(1150).code());
        assertEquals("GOLD", PvpRankRules.fromElo(1350).code());
        assertEquals("PLATINUM", PvpRankRules.fromElo(1550).code());
        assertEquals("DIAMOND", PvpRankRules.fromElo(1800).code());
        assertEquals("MASTER", PvpRankRules.fromElo(2100).code());

        // Cùng ELO (1000 vs 1000): Thắng +16, Thua -16, Hòa 0
        assertEquals(16, PvpRankRules.calculateEloChange(1000, 1000, 1.0));
        assertEquals(-16, PvpRankRules.calculateEloChange(1000, 1000, 0.0));
        assertEquals(0, PvpRankRules.calculateEloChange(1000, 1000, 0.5));

        // Người ELO thấp (1000) thắng người ELO cao (1400) được cộng nhiều ELO hơn (+29)
        int underdogWin = PvpRankRules.calculateEloChange(1000, 1400, 1.0);
        int favoriteWin = PvpRankRules.calculateEloChange(1400, 1000, 1.0);
        assertTrue(underdogWin > 25, "Underdog win delta should be > 25, got " + underdogWin);
        assertTrue(favoriteWin < 10 && favoriteWin >= 1, "Favorite win delta should be small positive, got " + favoriteWin);
    }

    @Test
    void declineLimitTriggersTemporaryMatchmakingBanOnThirdViolation() {
        var db = mock(JdbcTemplate.class);
        var users = mock(UserRepository.class);
        var notifier = mock(RealtimeNotifier.class);
        var controller = new ArenaController(db, users, notifier);

        var alice = new User("alice", "Alice", "hash");
        alice.id = 1L;
        alice.totalXp = 2500; // 2500 XP học tập
        when(users.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(alice));
        when(users.findWithLockById(1L)).thenReturn(Optional.of(alice));

        Map<String, Object> confirmingRoom = new HashMap<>();
        confirmingRoom.put("id", 10L);
        confirmingRoom.put("code", "MATCH123");
        confirmingRoom.put("host_id", 1L);
        confirmingRoom.put("guest_id", 2L);
        confirmingRoom.put("status", "CONFIRMING");
        confirmingRoom.put("current_round", 0);
        confirmingRoom.put("question_limit", 10);
        confirmingRoom.put("host_score", 0);
        confirmingRoom.put("guest_score", 0);
        when(db.queryForList("select * from arena_rooms where id=? for update", 10L)).thenReturn(List.of(confirmingRoom));
        when(db.queryForObject("select display_name from users where id=?", String.class, 1L)).thenReturn("Alice");
        when(db.queryForObject("select display_name from users where id=?", String.class, 2L)).thenReturn("Bob");

        var auth = new UsernamePasswordAuthenticationToken("alice", null, List.of());

        // Lần từ chối 1 và 2: tăng bộ đếm nhưng chưa cấm
        controller.decline(auth, 10L);
        assertEquals(1, alice.pvpDeclineCount);
        assertNull(alice.pvpBanUntil);

        controller.decline(auth, 10L);
        assertEquals(2, alice.pvpDeclineCount);
        assertNull(alice.pvpBanUntil);

        // Lần từ chối thứ 3: kích hoạt cấm ghép trận tạm thời 5 phút
        controller.decline(auth, 10L);
        assertEquals(3, alice.pvpDeclineCount);
        assertNotNull(alice.pvpBanUntil);
        assertTrue(alice.pvpBanUntil.isAfter(Instant.now().plusSeconds(250)));

        // Kiểm tra ArenaMatchmaker chặn người chơi đang bị cấm tạm thời
        var matchmaker = new ArenaMatchmaker(users, db, mock(ArenaMatchFactory.class));
        var ex = assertThrows(ApiException.class, () -> matchmaker.join("alice", "sock-1"));
        assertEquals("MATCHMAKING_BANNED", ex.code);

        // Điểm EXP học tập hoàn toàn không bị thay đổi
        assertEquals(2500, alice.totalXp);
    }

    @Test
    void matchFinishUpdatesEloAndStatsWithoutAddingLearningXp() {
        var db = mock(JdbcTemplate.class);
        var users = mock(UserRepository.class);
        var notifier = mock(RealtimeNotifier.class);
        var controller = new ArenaController(db, users, notifier);

        var host = new User("host", "Host", "hash");
        host.id = 1L;
        host.totalXp = 5000;
        host.pvpElo = 1000;

        var guest = new User("guest", "Guest", "hash");
        guest.id = 2L;
        guest.totalXp = 3000;
        guest.pvpElo = 1200;

        when(users.findWithLockById(1L)).thenReturn(Optional.of(host));
        when(users.findWithLockById(2L)).thenReturn(Optional.of(guest));
        when(users.findById(1L)).thenReturn(Optional.of(host));
        when(users.findById(2L)).thenReturn(Optional.of(guest));

        Map<String, Object> room = new HashMap<>();
        room.put("id", 99L);
        room.put("is_matchmade", true);
        room.put("status", "IN_PROGRESS");
        room.put("host_id", 1L);
        room.put("guest_id", 2L);
        room.put("current_round", 10);
        room.put("question_limit", 10);
        room.put("host_score", 7);
        room.put("guest_score", 6);
        room.put("round_deadline_at", Timestamp.from(Instant.now().minusSeconds(1)));
        when(db.queryForList("select * from arena_rooms where id=? for update", 99L)).thenReturn(List.of(room));

        Map<String, Object> round = new HashMap<>();
        round.put("correct_option", "A");
        round.put("host_answer", "A");
        round.put("guest_answer", "B");
        when(db.queryForMap("select correct_option,host_answer,guest_answer from arena_rounds where room_id=? and round_no=?", 99L, 10)).thenReturn(round);

        controller.advance(99L);

        // Host (1000 ELO) thắng Guest (1200 ELO) với điểm trận 8 - 6
        assertTrue(host.pvpElo > 1020, "Host ELO should increase significantly after beating higher ELO opponent");
        assertTrue(guest.pvpElo < 1180, "Guest ELO should decrease");
        assertEquals(1, host.pvpWins);
        assertEquals(1, host.pvpWinStreak);
        assertEquals(1, guest.pvpLosses);
        assertEquals(0, guest.pvpWinStreak);

        // Tuyệt đối không cộng EXP học tập
        assertEquals(5000, host.totalXp);
        assertEquals(3000, guest.totalXp);
    }
}
