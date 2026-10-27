package com.grammarquest.service;

import com.grammarquest.exception.ApiException;
import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class AssignmentAnswerGuard {

    private final JdbcTemplate db;

    public AssignmentAnswerGuard(JdbcTemplate db) {
        this.db = db;
    }

    public void check(long attemptId) {
        var deadlines = db.query(
            "select submit_deadline_at from assignment_attempts where attempt_id=?",
            (rs, n) -> rs.getTimestamp(1),
            attemptId
        );
        if (!deadlines.isEmpty()) {
            Timestamp deadline = deadlines.getFirst();
            if (
                deadline != null && Instant.now().isAfter(deadline.toInstant())
            ) throw new ApiException(
                HttpStatus.CONFLICT,
                "ASSIGNMENT_TIME_OVER",
                "Đã hết 15 phút làm nhiệm vụ này"
            );
            var rules = db.queryForList(
                "select ass.status,ass.due_at as dueAt,(select count(*) from class_members m where m.class_id=ass.class_id and m.user_id=a.user_id) as memberCount from assignment_attempts aa join assignments ass on ass.id=aa.assignment_id join attempts a on a.id=aa.attempt_id where aa.attempt_id=?",
                attemptId
            );
            if (!rules.isEmpty()) {
                var rule = rules.getFirst();
                if (((Number) rule.get("memberCount")).intValue() == 0) throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "CLASS_ACCESS_REVOKED",
                    "Bạn không còn là thành viên lớp học"
                );
                if (
                    !"PUBLISHED".equals(rule.get("status")) ||
                    !((Timestamp) rule.get("dueAt")).toInstant().isAfter(Instant.now())
                ) throw new ApiException(
                    HttpStatus.CONFLICT,
                    "ASSIGNMENT_CLOSED",
                    "Giáo viên đã đóng nhiệm vụ hoặc đã quá hạn nộp"
                );
            }
        }
    }
}
