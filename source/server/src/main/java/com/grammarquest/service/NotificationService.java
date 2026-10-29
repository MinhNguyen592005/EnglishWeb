package com.grammarquest.service;

import com.grammarquest.entity.User;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Durable per-account inbox. Class membership is checked again on every read. */
@Service
public class NotificationService {

    public record Changed(Set<Long> userIds) {}

    public record Item(
        long id,
        String kind,
        String title,
        String message,
        Instant createdAt,
        Instant readAt,
        Long classId,
        Long assignmentId,
        Long examId,
        String className,
        String teacherName,
        String workTitle,
        Instant dueAt,
        boolean available
    ) {}

    public record Inbox(List<Item> items, long unreadCount, Long nextBeforeId) {}

    private final JdbcTemplate db;
    private final UserRepository users;
    private final ApplicationEventPublisher events;
    private static final String VISIBLE =
        " n.user_id=? and (n.class_id is null or (?='LEARNER' and exists(select 1 from class_members cm where cm.class_id=n.class_id and cm.user_id=n.user_id))) ";
    private static final String SELECT =
        "select n.*,c.name as class_name,t.display_name as teacher_name,coalesce(a.title,e.title) as work_title,coalesce(a.due_at,e.ends_at) as due_at,case when n.assignment_id is not null then a.status='PUBLISHED' and a.due_at>current_timestamp(6) when n.exam_id is not null then e.closed=false and e.ends_at>current_timestamp(6) else true end as available from account_notifications n left join classrooms c on c.id=n.class_id left join users t on t.id=c.teacher_id left join assignments a on a.id=n.assignment_id left join class_exams e on e.id=n.exam_id where ";

    public NotificationService(
        JdbcTemplate db,
        UserRepository users,
        ApplicationEventPublisher events
    ) {
        this.db = db;
        this.users = users;
        this.events = events;
    }

    private User account(String username) {
        User user = users
            .findByUsernameIgnoreCase(username)
            .orElseThrow(() ->
                new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Vui lòng đăng nhập")
            );
        if (user.locked) throw new ApiException(
            HttpStatus.FORBIDDEN,
            "ACCOUNT_LOCKED",
            "Tài khoản đã bị khóa"
        );
        return user;
    }

    private Instant instant(Object value) {
        return value == null ? null : ((Timestamp) value).toInstant();
    }

    private Long number(Object value) {
        return value == null ? null : ((Number) value).longValue();
    }

    private Item item(Map<String, Object> row) {
        Object available = row.get("available");
        return new Item(
            number(row.get("id")),
            row.get("kind").toString(),
            row.get("title").toString(),
            row.get("message").toString(),
            instant(row.get("created_at")),
            instant(row.get("read_at")),
            number(row.get("class_id")),
            number(row.get("assignment_id")),
            number(row.get("exam_id")),
            (String) row.get("class_name"),
            (String) row.get("teacher_name"),
            (String) row.get("work_title"),
            instant(row.get("due_at")),
            Boolean.TRUE.equals(available) || (available instanceof Number n && n.intValue() != 0)
        );
    }

    @Transactional(
        readOnly = true,
        isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ
    )
    public Inbox inbox(String username, Long beforeId) {
        User user = account(username);
        if (beforeId != null && beforeId <= 0) throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "INVALID_CURSOR",
            "Mốc thông báo không hợp lệ"
        );
        var rows =
            beforeId == null
                ? db.queryForList(
                      SELECT + VISIBLE + " order by n.id desc limit 21",
                      user.id,
                      user.role
                  )
                : db.queryForList(
                      SELECT + VISIBLE + " and n.id<? order by n.id desc limit 21",
                      user.id,
                      user.role,
                      beforeId
                  );
        var items = rows.stream().limit(20).map(this::item).toList();
        long unread = Objects.requireNonNull(
            db.queryForObject(
                "select count(*) from account_notifications n where " +
                    VISIBLE +
                    " and n.read_at is null",
                Long.class,
                user.id,
                user.role
            )
        );
        return new Inbox(items, unread, rows.size() > 20 ? items.getLast().id() : null);
    }

    @Transactional
    public Item read(String username, long id) {
        User user = account(username);
        var rows = db.queryForList(SELECT + VISIBLE + " and n.id=?", user.id, user.role, id);
        if (rows.isEmpty()) throw new ApiException(
            HttpStatus.NOT_FOUND,
            "NOTIFICATION_NOT_FOUND",
            "Thông báo không còn khả dụng hoặc bạn không còn thuộc lớp này."
        );
        if (
            db.update(
                "update account_notifications n set n.read_at=current_timestamp(6) where " +
                    VISIBLE +
                    " and n.id=? and n.read_at is null",
                user.id,
                user.role,
                id
            ) > 0
        ) changed(user.id);
        return item(db.queryForMap(SELECT + VISIBLE + " and n.id=?", user.id, user.role, id));
    }

    @Transactional
    public void readAll(String username) {
        User user = account(username);
        if (
            db.update(
                "update account_notifications n set n.read_at=current_timestamp(6) where " +
                    VISIBLE +
                    " and n.read_at is null",
                user.id,
                user.role
            ) > 0
        ) changed(user.id);
    }

    @Transactional
    public void changed(long userId) {
        events.publishEvent(new Changed(Set.of(userId)));
    }

    /** Called inside the same transaction as assignment/exam creation, from every delivery path. */
    @Transactional
    public void classwork(long classId, Long assignmentId, Long examId) {
        boolean assignment = assignmentId != null;
        String kind = assignment ? "ASSIGNMENT" : "LIVE_EXAM";
        String key = kind + ":" + (assignment ? assignmentId : examId);
        String title = assignment ? "Bạn có bài tập mới" : "Bạn có bài kiểm tra trực tiếp";
        String message = assignment
            ? "Giáo viên vừa giao bài tập cho lớp. Xem yêu cầu và hoàn thành trước hạn nhé!"
            : "Giáo viên vừa mở bài kiểm tra trực tiếp cho lớp. Xem hạn làm trước khi bắt đầu nhé!";
        db.update(
            "insert ignore into account_notifications(user_id,kind,title,message,class_id,assignment_id,exam_id,event_key) select u.id,?,?,?,?,?,?,? from class_members cm join users u on u.id=cm.user_id and u.role='LEARNER' where cm.class_id=?",
            kind,
            title,
            message,
            classId,
            assignmentId,
            examId,
            key,
            classId
        );
        var recipients = new HashSet<>(
            db.queryForList(
                "select user_id from account_notifications where event_key=?",
                Long.class,
                key
            )
        );
        if (!recipients.isEmpty()) events.publishEvent(new Changed(Set.copyOf(recipients)));
    }

    @Transactional
    public void adminNotice(long userId, String title, String message) {
        add(userId, "ADMIN_ACTION", title, message, null);
    }

    private void add(long userId, String kind, String title, String message, String key) {
        if (
            db.update(
                "insert ignore into account_notifications(user_id,kind,title,message,event_key) values(?,?,?,?,?)",
                userId,
                kind,
                title,
                message,
                key
            ) > 0
        ) changed(userId);
    }

    @Transactional
    public void reportDecision(
        long targetId,
        long reporterId,
        String source,
        long reportId,
        String decision,
        String note
    ) {
        String outcome = switch (decision) {
            case "WARN" -> "gửi cảnh báo đến tài khoản được báo cáo";
            case "MUTE_24H" -> "cấm tài khoản được báo cáo nhắn tin trong 24 giờ";
            case "LOCK" -> "khóa tài khoản được báo cáo";
            default -> "khép lại báo cáo, không áp dụng hình thức xử lý";
        };
        String message = switch (decision) {
            case "WARN" -> "Quản trị viên đã gửi cảnh báo đến tài khoản của bạn. Vui lòng tuân thủ quy định cộng đồng.";
            case "MUTE_24H" -> "Quản trị viên đã tạm cấm tài khoản của bạn nhắn tin trong 24 giờ.";
            case "LOCK" -> "Tài khoản của bạn đã bị quản trị viên khóa. Vui lòng liên hệ để được hỗ trợ.";
            default -> "Quản trị viên đã khép lại báo cáo liên quan đến bạn. Không áp dụng hình thức xử lý.";
        };
        String key = "REPORT:" + source + ":" + reportId;
        if (targetId != reporterId) add(
            targetId,
            "ADMIN_ACTION",
            "Thông báo từ quản trị viên",
            message + (note == null || note.isBlank() ? "" : " Lời nhắn: " + note.trim()),
            key
        );
        add(
            reporterId,
            "REPORT_RESULT",
            "Kết quả xử lý báo cáo",
            "Báo cáo #" + reportId + " của bạn đã được xử lý: " + outcome + ".",
            key
        );
    }
}
