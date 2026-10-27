package com.grammarquest.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.grammarquest.entity.User;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import java.sql.Statement;
import java.text.Normalizer;
import java.util.*;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SupportChatService {

    private final JdbcTemplate db;
    private final UserRepository users;
    private final ApplicationEventPublisher events;

    public record Changed(long ownerId, Map<String, Object> conversation, boolean reply) {}

    public SupportChatService(
        JdbcTemplate db,
        UserRepository users,
        ApplicationEventPublisher events
    ) {
        this.db = db;
        this.users = users;
        this.events = events;
    }

    private ApiException invalid(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SUPPORT_MESSAGE", message);
    }

    private User user(String username) {
        var user = users
            .findByUsernameIgnoreCase(username)
            .orElseThrow(() ->
                new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Vui lòng đăng nhập")
            );
        if (
            user.locked || !Set.of("ADMIN", "LEARNER", "TEACHER").contains(user.role)
        ) throw new ApiException(
            HttpStatus.FORBIDDEN,
            "SUPPORT_FORBIDDEN",
            "Không có quyền sử dụng hỗ trợ"
        );
        return user;
    }

    public long id(JsonNode payload) {
        var id = payload.path("threadId");
        if (!id.isIntegralNumber() || !id.canConvertToLong() || id.asLong() < 1) throw invalid(
            "Mã hội thoại không hợp lệ"
        );
        return id.asLong();
    }

    private Map<String, Object> thread(long id, boolean lock) {
        var rows = db.queryForList(
            "select id,user_id as userId from support_threads where id=?" +
                (lock ? " for update" : ""),
            id
        );
        if (rows.isEmpty()) throw new ApiException(
            HttpStatus.NOT_FOUND,
            "SUPPORT_NOT_FOUND",
            "Không tìm thấy hội thoại"
        );
        return rows.getFirst();
    }

    private void access(User user, Map<String, Object> thread) {
        if (
            !"ADMIN".equals(user.role) && ((Number) thread.get("userId")).longValue() != user.id
        ) throw new ApiException(
            HttpStatus.FORBIDDEN,
            "SUPPORT_FORBIDDEN",
            "Bạn không được xem hội thoại này"
        );
    }

    private long insertMessage(long threadId, Long sender, String type, String key, String body) {
        var holder = new GeneratedKeyHolder();
        db.update(connection -> {
            var statement = connection.prepareStatement(
                "insert into support_messages(thread_id,sender_id,sender_type,client_message_id,body) values(?,?,?,?,?)",
                Statement.RETURN_GENERATED_KEYS
            );
            statement.setLong(1, threadId);
            statement.setObject(2, sender);
            statement.setString(3, type);
            statement.setString(4, key);
            statement.setString(5, body);
            return statement;
        }, holder);
        long id = Objects.requireNonNull(holder.getKey()).longValue();
        db.update(
            "update support_threads set last_message_id=?,updated_at=current_timestamp(6) where id=?",
            id,
            threadId
        );
        return id;
    }

    private Map<String, Object> snapshot(long id) {
        var out = new LinkedHashMap<>(
            db.queryForMap(
                "select t.id,t.user_id as userId,u.username,u.display_name as displayName,t.last_message_id as lastMessageId,t.status,t.updated_at as updatedAt from support_threads t join users u on u.id=t.user_id where t.id=?",
                id
            )
        );
        out.put(
            "messages",
            db
                .queryForList(
                    "select m.id,m.sender_id as senderId,m.sender_type as senderType,coalesce(u.display_name,'Trợ lý hệ thống') as senderName,m.body,m.created_at as createdAt from support_messages m left join users u on u.id=m.sender_id where m.thread_id=? order by m.id desc limit 100",
                    id
                )
                .reversed()
        );
        return out;
    }

    @Transactional
    public Map<String, Object> open(String username, JsonNode payload) {
        var user = user(username);
        if ("ADMIN".equals(user.role)) {
            long id = id(payload);
            thread(id, false);
            return snapshot(id);
        }
        // Serialize creation across tabs; a user has one persistent support thread.
        users.findWithLockById(user.id).orElseThrow();
        var ids = db.queryForList(
            "select id from support_threads where user_id=?",
            Long.class,
            user.id
        );
        long id;
        if (ids.isEmpty()) {
            var holder = new GeneratedKeyHolder();
            db.update(c -> {
                var s = c.prepareStatement(
                    "insert into support_threads(user_id) values(?)",
                    Statement.RETURN_GENERATED_KEYS
                );
                s.setLong(1, user.id);
                return s;
            }, holder);
            id = Objects.requireNonNull(holder.getKey()).longValue();
            insertMessage(
                id,
                null,
                "BOT",
                null,
                "Chào bạn! Hãy mô tả sự cố, trang đang gặp lỗi và thông báo lỗi nếu có. Mình có thể hướng dẫn cơ bản; quản trị viên cũng có thể trả lời tại đây. Đừng gửi mật khẩu hoặc thông tin nhạy cảm nhé."
            );
        } else id = ids.getFirst();
        return snapshot(id);
    }

    @Transactional(
        readOnly = true,
        isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ
    )
    public Map<String, Object> read(String username, long id) {
        var user = user(username);
        access(user, thread(id, false));
        return snapshot(id);
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(String username) {
        if (!"ADMIN".equals(user(username).role)) throw new ApiException(
            HttpStatus.FORBIDDEN,
            "ADMIN_ONLY",
            "Chỉ Admin được xem hộp thư hỗ trợ"
        );
        return db.queryForList(
            "select t.id,t.user_id as userId,u.username,u.display_name as displayName,t.last_message_id as lastMessageId,t.status,t.updated_at as updatedAt,substring(m.body,1,120) as preview,m.sender_type as lastSenderType from support_threads t join users u on u.id=t.user_id left join support_messages m on m.id=t.last_message_id order by t.updated_at desc,t.id desc limit 100"
        );
    }

    @Transactional
    public Map<String, Object> updateStatus(String username, JsonNode payload) {
        var user = user(username);
        if (!"ADMIN".equals(user.role)) throw new ApiException(
            HttpStatus.FORBIDDEN,
            "ADMIN_ONLY",
            "Chỉ Admin được cập nhật trạng thái hỗ trợ"
        );
        long id = id(payload);
        var statusNode = payload.path("status");
        if (
            !statusNode.isTextual() ||
            !Set.of("OPEN", "IN_PROGRESS", "CLOSED").contains(statusNode.asText())
        ) throw invalid("Trạng thái hỗ trợ không hợp lệ");
        var thread = thread(id, true);
        db.update(
            "update support_threads set status=?,updated_at=current_timestamp(6) where id=?",
            statusNode.asText(),
            id
        );
        var snapshot = snapshot(id);
        events.publishEvent(
            new Changed(((Number) thread.get("userId")).longValue(), snapshot, false)
        );
        return snapshot;
    }

    @Transactional
    public Map<String, Object> send(String username, JsonNode payload) {
        var user = user(username);
        long id = id(payload);
        var thread = thread(id, true);
        access(user, thread);
        var bodyNode = payload.path("body");
        var keyNode = payload.path("clientMessageId");
        if (
            !bodyNode.isTextual() ||
            bodyNode.asText().isBlank() ||
            bodyNode.asText().length() > 1000 ||
            !keyNode.isTextual() ||
            !keyNode.asText().matches("[a-zA-Z0-9_-]{8,64}")
        ) throw invalid("Tin nhắn cần 1–1.000 ký tự và mã gửi hợp lệ");
        String body = bodyNode.asText().trim(),
            key = keyNode.asText();
        if (
            body
                .chars()
                .anyMatch(c -> Character.isISOControl(c) && c != '\n' && c != '\r' && c != '\t')
        ) throw invalid("Tin nhắn chứa ký tự điều khiển không hợp lệ");
        var old = db.queryForList(
            "select sender_id,body from support_messages where thread_id=? and client_message_id=?",
            id,
            key
        );
        if (!old.isEmpty()) {
            if (
                !Objects.equals(((Number) old.getFirst().get("sender_id")).longValue(), user.id) ||
                !body.equals(old.getFirst().get("body"))
            ) throw invalid("Mã gửi đã được dùng cho tin nhắn khác");
            return snapshot(id);
        }
        boolean admin = "ADMIN".equals(user.role);
        int recent = db.queryForObject(
            "select count(*) from support_messages where thread_id=? and sender_id=? and created_at>date_sub(current_timestamp(6),interval 30 second)",
            Integer.class,
            id,
            user.id
        );
        if (recent >= (admin ? 20 : 5)) throw new ApiException(
            HttpStatus.TOO_MANY_REQUESTS,
            "SUPPORT_RATE_LIMIT",
            "Bạn gửi quá nhanh. Hãy đợi một chút trước khi nhắn tiếp."
        );
        insertMessage(id, user.id, admin ? "ADMIN" : "USER", key, body);
        boolean botReply =
            !admin &&
            db.queryForObject(
                "select count(*) from support_messages where thread_id=? and sender_type='ADMIN' and created_at>date_sub(current_timestamp(6),interval 5 minute)",
                Integer.class,
                id
            ) == 0;
        if (botReply) insertMessage(id, null, "BOT", null, automaticReply(body));
        var snapshot = snapshot(id);
        events.publishEvent(
            new Changed(((Number) thread.get("userId")).longValue(), snapshot, admin || botReply)
        );
        return snapshot;
    }

    static String automaticReply(String body) {
        String text = Normalizer.normalize(body, Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .replace('đ', 'd')
            .replace('Đ', 'D')
            .toLowerCase(Locale.ROOT);
        if (
            text.contains("dang nhap") || text.contains("mat khau")
        ) return "Bạn hãy kiểm tra tên đăng nhập, Caps Lock và thông báo lỗi. Không gửi mật khẩu trong chat. Nếu vẫn không đăng nhập được, quản trị viên sẽ hỗ trợ kiểm tra tài khoản.";
        if (
            text.contains("ket noi") || text.contains("socket") || text.contains("mat mang")
        ) return "Bạn hãy kiểm tra mạng và trạng thái kết nối phía trên. Nếu đang nộp bài, đợi trạng thái đồng bộ trước khi gửi lại. Quản trị viên đã có thể xem sự cố bạn gửi.";
        if (
            text.contains("diem") || text.contains("xp") || text.contains("boss")
        ) return "Bạn hãy gửi tên bài, chế độ học và thời điểm xảy ra lỗi điểm/XP. XP Boss chỉ được thưởng lần đầu thắng. Quản trị viên sẽ kiểm tra lịch sử; hệ thống không tự sửa điểm từ nội dung chat.";
        if (
            text.contains("bai hoc") || text.contains("lo trinh")
        ) return "Bạn hãy cho biết tên chủ đề/bài học và nội dung lỗi. Một số bài cần hoàn thành Boss bài trước hoặc Boss chủ đề trước để mở khóa. Quản trị viên có thể kiểm tra thêm tại đây.";
        return "Mình đã ghi nhận nội dung bạn gửi. Bạn có thể bổ sung các bước gây lỗi và thời điểm xảy ra; quản trị viên sẽ đọc và trả lời trực tiếp trong cuộc trò chuyện này.";
    }
}
