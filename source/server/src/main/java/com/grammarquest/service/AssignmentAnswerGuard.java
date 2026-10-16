package com.grammarquest.service;

import com.grammarquest.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import java.sql.Timestamp;
import java.time.Instant;

@Component
public class AssignmentAnswerGuard {
    private final JdbcTemplate db;
    public AssignmentAnswerGuard(JdbcTemplate db) { this.db=db; }
    public void check(long attemptId) {
        var deadlines=db.query("select submit_deadline_at from assignment_attempts where attempt_id=?",(rs,n)->rs.getTimestamp(1),attemptId);
        if(!deadlines.isEmpty()) {
            Timestamp deadline=deadlines.getFirst();
            if(deadline!=null&&Instant.now().isAfter(deadline.toInstant()))
                throw new ApiException(HttpStatus.CONFLICT,"ASSIGNMENT_TIME_OVER","Đã hết 15 phút làm nhiệm vụ này");
        }
    }
}
