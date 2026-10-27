package com.grammarquest.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import java.sql.Statement;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LearnerReportService {

    private final JdbcTemplate db;
    private final UserRepository users;
    private final RealtimeNotifier notifier;

    public LearnerReportService(JdbcTemplate db, UserRepository users, RealtimeNotifier notifier) {
        this.db = db;
        this.users = users;
        this.notifier = notifier;
    }

    private void require(boolean condition, String message) {
        if (!condition) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REPORT", message);
    }

    @Transactional
    public Map<String, Object> report(String username, JsonNode p) {
        var actor = users.findByUsernameIgnoreCase(username).orElseThrow();
        // Khóa tài khoản người gửi để hai tab không vượt kiểm tra trùng/rate limit cùng lúc.
        actor = users.findWithLockById(actor.id).orElseThrow();
        require(
            !actor.locked && Set.of("LEARNER", "TEACHER").contains(actor.role),
            "Không có quyền báo cáo"
        );
        var targetNode = p.path("targetId");
        var contextNode = p.path("contextId");
        require(
            targetNode.isIntegralNumber() &&
                targetNode.canConvertToLong() &&
                targetNode.asLong() > 0 &&
                contextNode.isIntegralNumber() &&
                contextNode.canConvertToLong() &&
                contextNode.asLong() > 0,
            "ID không hợp lệ"
        );
        long targetId = targetNode.asLong(),
            contextId = contextNode.asLong();
        String type = p.path("contextType").asText();
        require(targetId != actor.id, "Không thể tự báo cáo chính mình");
        require(
            users
                .findById(targetId)
                .filter(u -> "LEARNER".equals(u.role))
                .isPresent(),
            "Đối tượng phải là học sinh"
        );
        var reason = p.path("reason");
        require(
            reason.isTextual() && !reason.asText().isBlank() && reason.asText().length() <= 500,
            "Lý do phải có 1–500 ký tự"
        );
        if (type.equals("CLASS")) {
            var owners = db.queryForList(
                "select teacher_id from classrooms where id=?",
                Long.class,
                contextId
            );
            require(!owners.isEmpty(), "Lớp học không tồn tại");
            boolean owner = actor.role.equals("TEACHER") && owners.getFirst().equals(actor.id);
            require(
                owner ||
                    db.queryForObject(
                        "select count(*) from class_members where class_id=? and user_id=?",
                        Integer.class,
                        contextId,
                        actor.id
                    ) > 0,
                "Bạn không thuộc lớp này"
            );
            require(
                db.queryForObject(
                    "select count(*) from class_members where class_id=? and user_id=?",
                    Integer.class,
                    contextId,
                    targetId
                ) > 0,
                "Học sinh không thuộc lớp này"
            );
        } else if (type.equals("ARENA")) {
            require(actor.role.equals("LEARNER"), "Chỉ người tham gia trận được báo cáo");
            require(
                db.queryForObject(
                    "select count(*) from arena_rooms where id=? and ((host_id=? and guest_id=?) or (guest_id=? and host_id=?))",
                    Integer.class,
                    contextId,
                    actor.id,
                    targetId,
                    actor.id,
                    targetId
                ) > 0,
                "Hai tài khoản không cùng trận đấu"
            );
        } else throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "INVALID_REPORT",
            "Ngữ cảnh không hợp lệ"
        );
        require(
            db.queryForObject(
                "select count(*) from learner_reports where reporter_id=? and target_id=? and context_type=? and context_id=? and status='OPEN'",
                Integer.class,
                actor.id,
                targetId,
                type,
                contextId
            ) == 0,
            "Bạn đã gửi báo cáo đang chờ xử lý cho người này"
        );
        require(
            db.queryForObject(
                "select count(*) from learner_reports where reporter_id=? and created_at>date_sub(current_timestamp(6),interval 1 hour)",
                Integer.class,
                actor.id
            ) < 10,
            "Tối đa 10 báo cáo trong một giờ"
        );
        long actorId = actor.id;
        var key = new GeneratedKeyHolder();
        db.update(c -> {
            var s = c.prepareStatement(
                "insert into learner_reports(reporter_id,target_id,context_type,context_id,reason) values(?,?,?,?,?)",
                Statement.RETURN_GENERATED_KEYS
            );
            s.setLong(1, actorId);
            s.setLong(2, targetId);
            s.setString(3, type);
            s.setLong(4, contextId);
            s.setString(5, reason.asText().trim());
            return s;
        }, key);
        long id = Objects.requireNonNull(key.getKey()).longValue();
        notifier.reported(targetId, actorId, "USER", id);
        return Map.of("id", id, "status", "OPEN");
    }
}
