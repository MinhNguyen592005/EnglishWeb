package com.grammarquest.controller;

import static org.mockito.Mockito.*;

import com.grammarquest.repository.UserRepository;
import com.grammarquest.service.RealtimeNotifier;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class ArenaClockTest {

    @Test
    void serverAdvancesExpiredRoundWithoutClientRequests() {
        var db = mock(JdbcTemplate.class);
        var notifier = mock(RealtimeNotifier.class);
        Map<String, Object> room = new HashMap<>();
        room.put("id", 7L);
        room.put("status", "IN_PROGRESS");
        room.put("current_round", 1);
        room.put("question_limit", 10);
        room.put("host_score", 0);
        room.put("guest_score", 0);
        room.put("round_deadline_at", Timestamp.from(Instant.now().minusSeconds(1)));
        when(db.queryForList("select * from arena_rooms where id=? for update", 7L)).thenReturn(
            List.of(room)
        );
        Map<String, Object> round = new HashMap<>();
        round.put("correct_option", "A");
        round.put("host_answer", null);
        round.put("guest_answer", null);
        when(
            db.queryForMap(
                "select correct_option,host_answer,guest_answer from arena_rounds where room_id=? and round_no=?",
                7L,
                1
            )
        ).thenReturn(round);
        new ArenaController(db, mock(UserRepository.class), notifier).advance(7L);
        verify(db).update(
            "update arena_rounds set closed=true where room_id=? and round_no=?",
            7L,
            1
        );
        verify(db).update(
            eq(
                "update arena_rooms set host_score=?,guest_score=?,current_round=?,round_deadline_at=?,state_version=state_version+1 where id=?"
            ),
            eq(0),
            eq(0),
            eq(2),
            any(Timestamp.class),
            eq(7L)
        );
        verify(notifier).arena(7L);
    }
}
