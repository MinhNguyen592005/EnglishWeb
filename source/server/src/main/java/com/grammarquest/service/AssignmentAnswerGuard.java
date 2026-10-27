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
        var deadlines=db.query("select submit_deadline_at from assignment_attempts where attempt_id=? for update",(rs,n)->rs.getTimestamp(1),attemptId);
        if(!deadlines.isEmpty()) {
            Timestamp deadline=deadlines.getFirst();
            if(deadline!=null&&Instant.now().isAfter(deadline.toInstant()))
                throw new ApiException(HttpStatus.CONFLICT,"ASSIGNMENT_TIME_OVER","Đã hết 15 phút làm nhiệm vụ này");
            var rules=db.queryForList("select ass.status,ass.due_at as dueAt,case when m.user_id is null then 0 else 1 end as memberCount from assignment_attempts aa join assignments ass on ass.id=aa.assignment_id join attempts a on a.id=aa.attempt_id left join class_members m on m.class_id=ass.class_id and m.user_id=a.user_id where aa.attempt_id=? for update",attemptId);
            if(!rules.isEmpty()) {
                var rule=rules.getFirst();
                if(((Number)rule.get("memberCount")).intValue()==0)
                    throw new ApiException(HttpStatus.FORBIDDEN,"CLASS_ACCESS_REVOKED","Bạn không còn là thành viên lớp học");
                if(!"PUBLISHED".equals(rule.get("status"))||!((Timestamp)rule.get("dueAt")).toInstant().isAfter(Instant.now()))
                    throw new ApiException(HttpStatus.CONFLICT,"ASSIGNMENT_CLOSED","Giáo viên đã đóng nhiệm vụ hoặc đã quá hạn nộp");
            }
        }
    }
}
