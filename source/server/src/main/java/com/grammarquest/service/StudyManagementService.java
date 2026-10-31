package com.grammarquest.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.grammarquest.entity.User;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import java.sql.Statement;
import java.util.*;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Drafts are private to their author and administrators; only publish changes learner content. */
@Service
public class StudyManagementService {

    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final UserRepository users;
    private final ApplicationEventPublisher events;
    private final RoadmapCourseService course;

    public StudyManagementService(
        JdbcTemplate db,
        ObjectMapper json,
        UserRepository users,
        ApplicationEventPublisher events,
        RoadmapCourseService course
    ) {
        this.db = db;
        this.json = json;
        this.users = users;
        this.events = events;
        this.course = course;
    }

    private ApiException fail(HttpStatus status, String message) {
        return new ApiException(status, "STUDY_MANAGEMENT", message);
    }

    private void require(boolean condition, String message) {
        if (!condition) throw fail(HttpStatus.BAD_REQUEST, message);
    }

    private User staff(String username) {
        var user = users
            .findByUsernameIgnoreCase(username)
            .orElseThrow(() -> fail(HttpStatus.UNAUTHORIZED, "Vui lòng đăng nhập"));
        if (user.locked || !Set.of("ADMIN", "TEACHER").contains(user.role)) throw fail(
            HttpStatus.FORBIDDEN,
            "Chỉ admin và giáo viên được quản lý hành trình"
        );
        return user;
    }

    private boolean admin(User user) {
        return "ADMIN".equals(user.role);
    }

    private JsonNode parse(Object value) {
        try {
            return json.readTree(value.toString());
        } catch (Exception e) {
            throw new IllegalStateException("Invalid course JSON", e);
        }
    }

    private Map<String, Object> row(long id, boolean lock) {
        var rows = db.queryForList(
            "select d.*,u.display_name as authorName from study_module_drafts d join users u on u.id=d.author_id where d.id=?" +
                (lock ? " for update" : ""),
            id
        );
        if (rows.isEmpty()) throw fail(HttpStatus.NOT_FOUND, "Không tìm thấy bản nháp");
        return rows.getFirst();
    }

    private void visible(User user, Map<String, Object> draft) {
        if (!admin(user) && ((Number) draft.get("author_id")).longValue() != user.id) throw fail(
            HttpStatus.FORBIDDEN,
            "Bạn không có quyền xem bản nháp này"
        );
    }

    private void version(Map<String, Object> draft, int expected) {
        if (((Number) draft.get("version")).intValue() != expected) throw fail(
            HttpStatus.CONFLICT,
            "Bản nháp đã thay đổi ở phiên khác. Hãy mở lại để lấy bản mới nhất."
        );
    }

    private Map<String, Object> view(Map<String, Object> row) {
        var out = new LinkedHashMap<String, Object>();
        out.put("id", row.get("id"));
        out.put("moduleId", row.get("module_id"));
        out.put("authorId", row.get("author_id"));
        out.put("authorName", row.get("authorName"));
        out.put("baseVersion", row.get("base_version"));
        out.put("version", row.get("version"));
        out.put("status", row.get("status"));
        out.put("note", row.get("review_note"));
        out.put("payload", parse(row.get("payload_json")));
        out.put("updatedAt", row.get("updated_at").toString());
        return out;
    }

    @Transactional(readOnly = true)
    public Object workspace(String username) {
        var user = staff(username);
        var drafts = db.queryForList(
            "select d.id,d.module_id as moduleId,d.author_id as authorId,u.display_name as authorName,d.version,d.status,d.updated_at as updatedAt,JSON_UNQUOTE(JSON_EXTRACT(d.payload_json,'$.title')) as title from study_module_drafts d join users u on u.id=d.author_id " +
                (admin(user) ? "" : "where d.author_id=? ") +
                "order by d.updated_at desc,d.id desc",
            admin(user) ? new Object[] {} : new Object[] { user.id }
        );
        return Map.of(
            "levels",
            db.queryForList("select id,title,outcome from study_levels order by id"),
            "modules",
            db.queryForList(
                "select m.id,m.level_id as levelId,m.ordinal_no as ordinalNo,m.title,m.archived,m.version,count(l.id) as lessonCount from study_modules m left join study_lessons l on l.module_id=m.id and l.archived=false group by m.id order by m.level_id,m.ordinal_no"
            ),
            "drafts",
            drafts,
            "lessons",
            db.queryForList(
                "select l.id,l.title,m.title as moduleTitle from study_lessons l join study_modules m on m.id=l.module_id where l.archived=false and m.archived=false order by m.level_id,m.ordinal_no,l.ordinal_no"
            )
        );
    }

    private ObjectNode snapshot(String id) {
        var rows = db.queryForList("select * from study_modules where id=?", id);
        if (rows.isEmpty()) throw fail(HttpStatus.NOT_FOUND, "Không tìm thấy module");
        var m = rows.getFirst();
        var out = json.createObjectNode();
        out.put("id", id);
        out.put("levelId", ((Number) m.get("level_id")).intValue());
        out.put("ordinalNo", ((Number) m.get("ordinal_no")).intValue());
        out.put("title", m.get("title").toString());
        out.put("archived", Boolean.parseBoolean(m.get("archived").toString()));
        var lessons = out.putArray("lessons");
        for (var l : db.queryForList(
            "select * from study_lessons where module_id=? order by ordinal_no",
            id
        )) {
            var lesson = lessons.addObject();
            lesson.put("id", l.get("id").toString());
            lesson.put("title", l.get("title").toString());
            lesson.put("archived", Boolean.parseBoolean(l.get("archived").toString()));
            lesson.set("content", parse(l.get("content_json")));
            lesson.set("questions", parse(l.get("questions_json")));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public Object module(String username, String id) {
        staff(username);
        return snapshot(id);
    }

    @Transactional(readOnly = true)
    public Object history(String username, String id) {
        staff(username);
        return db.queryForList(
            "select h.version,h.created_at as createdAt,u.display_name as authorName from study_module_history h join users u on u.id=h.actor_id where module_id=? order by version desc",
            id
        );
    }

    @Transactional(readOnly = true)
    public Object draft(String username, long id) {
        var user = staff(username);
        var row = row(id, false);
        visible(user, row);
        return view(row);
    }

    // Serializes catalog publications and draft snapshots without holding a DB lock during editing.
    private void catalogLock() {
        db.queryForList("select id from study_levels order by id for update");
    }

    @Transactional
    public Object create(String username, String moduleId, int levelId, Integer restoreVersion) {
        var user = staff(username);
        catalogLock();
        int base = 0;
        ObjectNode payload;
        if (moduleId != null && !moduleId.isBlank()) {
            payload = snapshot(moduleId);
            base = db.queryForObject(
                "select version from study_modules where id=?",
                Integer.class,
                moduleId
            );
            if (restoreVersion != null) {
                var history = db.queryForList(
                    "select payload_json from study_module_history where module_id=? and version=?",
                    moduleId,
                    restoreVersion
                );
                require(!history.isEmpty(), "Không tìm thấy phiên bản cần khôi phục");
                var historical = (ObjectNode) parse(history.getFirst().get("payload_json"));
                var restoredIds = new HashSet<String>();
                for (var lesson : historical.path("lessons"))
                    restoredIds.add(lesson.path("id").asText());
                for (var lesson : payload.path("lessons"))
                    if (!restoredIds.contains(lesson.path("id").asText())) {
                        var retained = (ObjectNode) lesson.deepCopy();
                        retained.put("archived", true);
                        (
                            (com.fasterxml.jackson.databind.node.ArrayNode) historical.path(
                                "lessons"
                            )
                        ).add(retained);
                    }
                payload = historical;
            }
        } else {
            require(levelId >= 1 && levelId <= 5, "Hành trình không hợp lệ");
            moduleId = "m-" + UUID.randomUUID().toString().replace("-", "").substring(0, 24);
            payload = json.createObjectNode();
            payload.put("id", moduleId);
            payload.put("levelId", levelId);
            payload.put("title", "Module mới");
            payload.put("archived", false);
            payload.put(
                "ordinalNo",
                db.queryForObject(
                    "select count(*)+1 from study_modules where level_id=?",
                    Integer.class,
                    levelId
                )
            );
            payload.putArray("lessons");
        }
        var key = new GeneratedKeyHolder();
        final String target = moduleId,
            body = payload.toString();
        final int baseVersion = base;
        db.update(c -> {
            var ps = c.prepareStatement(
                "insert into study_module_drafts(module_id,author_id,base_version,payload_json) values(?,?,?,?)",
                Statement.RETURN_GENERATED_KEYS
            );
            ps.setString(1, target);
            ps.setLong(2, user.id);
            ps.setInt(3, baseVersion);
            ps.setString(4, body);
            return ps;
        }, key);
        return view(row(Objects.requireNonNull(key.getKey()).longValue(), false));
    }

    @Transactional
    public Object save(String username, long id, int expected, JsonNode payload) {
        var user = staff(username);
        var draft = row(id, true);
        visible(user, draft);
        version(draft, expected);
        require(
            ((Number) draft.get("author_id")).longValue() == user.id,
            "Chỉ tác giả được sửa bản nháp; hãy trả lại cho giáo viên nếu cần sửa."
        );
        require(
            Set.of("DRAFT", "RETURNED").contains(draft.get("status").toString()),
            "Bản nháp đang chờ duyệt hoặc đã đóng"
        );
        validate(payload, false);
        var original = parse(draft.get("payload_json"));
        require(
            payload.path("id").equals(original.path("id")) &&
                payload.path("levelId").equals(original.path("levelId")),
            "Không được đổi mã module hoặc hành trình của bản nháp"
        );
        db.update(
            "update study_module_drafts set payload_json=?,version=version+1,updated_at=current_timestamp(6) where id=?",
            payload.toString(),
            id
        );
        return view(row(id, false));
    }

    @Transactional
    public Object action(String username, long id, String action, int expected, String note) {
        var user = staff(username);
        // Lock catalog before draft consistently with create/publish.
        catalogLock();
        var draft = row(id, true);
        visible(user, draft);
        version(draft, expected);
        String status = draft.get("status").toString(),
            next;
        boolean owner = ((Number) draft.get("author_id")).longValue() == user.id;
        switch (action) {
            case "delete" -> {
                require(
                    (owner || admin(user)) &&
                        Set.of("DRAFT", "RETURNED", "SUBMITTED", "DISCARDED").contains(status),
                    "Chỉ được xóa bản nháp hoặc đề xuất chưa xuất bản"
                );
                db.update(
                    "insert into audit_logs(actor_id,action,target_type,target_id,detail) values(?,?,?,?,?)",
                    user.id,
                    "STUDY_DELETE",
                    "STUDY_DRAFT",
                    id,
                    draft.get("module_id").toString()
                );
                db.update("delete from study_module_drafts where id=?", id);
                return Map.of("deleted", true, "id", id);
            }
            case "submit" -> {
                require(
                    owner && Set.of("DRAFT", "RETURNED").contains(status),
                    "Không thể gửi duyệt bản nháp này"
                );
                validate(parse(draft.get("payload_json")), true);
                next = "SUBMITTED";
            }
            case "withdraw" -> {
                require(owner && status.equals("SUBMITTED"), "Không thể rút bản nháp này");
                next = "DRAFT";
            }
            case "return" -> {
                if (!admin(user)) throw fail(HttpStatus.FORBIDDEN, "Chỉ admin được duyệt nội dung");
                require(status.equals("SUBMITTED"), "Bản nháp không chờ duyệt");
                require(note != null && !note.isBlank(), "Nhập lý do yêu cầu chỉnh sửa");
                next = "RETURNED";
            }
            case "discard" -> {
                require(
                    owner && Set.of("DRAFT", "RETURNED").contains(status),
                    "Không thể hủy bản nháp này"
                );
                next = "DISCARDED";
            }
            case "publish" -> {
                if (!admin(user)) throw fail(HttpStatus.FORBIDDEN, "Chỉ admin được xuất bản");
                require(
                    status.equals("SUBMITTED") ||
                        (owner && Set.of("DRAFT", "RETURNED").contains(status)),
                    "Không thể xuất bản bản nháp này"
                );
                publish(user, draft);
                next = "PUBLISHED";
            }
            default -> throw fail(HttpStatus.BAD_REQUEST, "Thao tác không hợp lệ");
        }
        db.update(
            "update study_module_drafts set status=?,review_note=?,reviewer_id=?,version=version+1,updated_at=current_timestamp(6) where id=?",
            next,
            note == null ? "" : note,
            user.id,
            id
        );
        db.update(
            "insert into audit_logs(actor_id,action,target_type,target_id,detail) values(?,?,?,?,?)",
            user.id,
            "STUDY_" + action.toUpperCase(Locale.ROOT),
            "STUDY_DRAFT",
            id,
            draft.get("module_id").toString()
        );
        return view(row(id, false));
    }

    static void validate(JsonNode p, boolean publishing) {
        if (!p.isObject() || p.toString().length() > 2_000_000) invalid(
            "Nội dung quá lớn hoặc không hợp lệ"
        );
        text(p, "id", 30);
        text(p, "title", 160);
        if (
            !p.path("id").asText().matches("[a-zA-Z0-9._-]+") ||
            !p.path("levelId").isIntegralNumber() ||
            p.path("levelId").asInt() < 1 ||
            p.path("levelId").asInt() > 5 ||
            !p.path("ordinalNo").isIntegralNumber() ||
            p.path("ordinalNo").asInt() < 1 ||
            p.path("ordinalNo").asInt() > 10000 ||
            !p.path("archived").isBoolean()
        ) invalid("Thông tin module không hợp lệ");
        var lessons = p.path("lessons");
        if (!lessons.isArray() || lessons.size() > 100) invalid("Module hỗ trợ tối đa 100 bài học");
        var ids = new HashSet<String>();
        var questionIds = new HashSet<String>();
        int active = 0,
            questions = 0;
        for (var l : lessons) {
            text(l, "id", 20);
            text(l, "title", 160);
            if (
                !l.path("id").asText().matches("[a-zA-Z0-9._-]+") ||
                !ids.add(l.path("id").asText()) ||
                !l.path("archived").isBoolean()
            ) invalid("Mã bài học bị trùng hoặc không hợp lệ");
            var c = l.path("content");
            for (var field : List.of("objective", "application", "summary"))
                if (!c.path(field).isTextual() || c.path(field).asText().length() > 30000) invalid(
                    "Nội dung bài học không hợp lệ"
                );
            checkItems(c, "sections", List.of("title", "body"));
            checkItems(c, "examples", List.of("english", "vietnamese"));
            checkItems(c, "mistakes", List.of("wrong", "right", "explanation"));
            checkItems(c, "prerequisites", List.of("id", "title"));
            var qs = l.path("questions");
            if (!qs.isArray() || qs.size() > 100) invalid("Mỗi bài hỗ trợ tối đa 100 câu hỏi");
            boolean live =
                publishing && !p.path("archived").asBoolean() && !l.path("archived").asBoolean();
            if (live) {
                active++;
                questions += qs.size();
                if (
                    qs.isEmpty() ||
                    c.path("objective").asText().isBlank() ||
                    c.path("sections").isEmpty()
                ) invalid("Bài xuất bản cần mục tiêu, lý thuyết và câu hỏi");
            }
            if (live) for (var section : c.path("sections"))
                if (
                    section.path("title").asText().isBlank() ||
                    section.path("body").asText().isBlank()
                ) invalid("Nhập tiêu đề và nội dung cho các phần lý thuyết");
            for (var q : qs) {
                text(q, "id", 80);
                if (
                    !q.path("id").asText().matches("[a-zA-Z0-9._-]+") ||
                    !questionIds.add(q.path("id").asText())
                ) invalid("Mã câu hỏi bị trùng hoặc không hợp lệ");
                if (
                    !q.path("prompt").isTextual() ||
                    q.path("prompt").asText().length() > 5000 ||
                    !q.path("explanation").isTextual() ||
                    q.path("explanation").asText().length() > 30000
                ) invalid("Câu hỏi không hợp lệ");
                if (!q.path("options").isArray() || q.path("options").size() != 4) invalid(
                    "Câu hỏi cần bốn lựa chọn"
                );
                for (var option : q.path("options"))
                    if (
                        !option.isTextual() ||
                        option.asText().length() > 2000 ||
                        (live && option.asText().isBlank())
                    ) invalid("Lựa chọn không hợp lệ");
                if (!q.path("correctOption").asText().matches("[ABCD]")) invalid(
                    "Đáp án đúng phải từ A đến D"
                );
                if (
                    live &&
                    (q.path("prompt").asText().isBlank() ||
                        q.path("explanation").asText().isBlank())
                ) invalid("Nhập câu hỏi và giải thích đáp án");
            }
        }
        if (
            publishing && !p.path("archived").asBoolean() && (active == 0 || questions == 0)
        ) invalid("Module xuất bản cần ít nhất một bài học có câu hỏi");
    }

    private static void text(JsonNode node, String key, int max) {
        if (
            !node.path(key).isTextual() ||
            node.path(key).asText().isBlank() ||
            node.path(key).asText().length() > max
        ) invalid("Thiếu hoặc sai trường " + key);
    }

    private static void invalid(String message) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_STUDY_CONTENT", message);
    }

    private static void checkItems(JsonNode c, String key, List<String> fields) {
        if (!c.path(key).isArray() || c.path(key).size() > 100) invalid(
            "Danh sách " + key + " không hợp lệ"
        );
        for (var item : c.path(key))
            for (var field : fields)
                if (
                    !item.path(field).isTextual() || item.path(field).asText().length() > 30000
                ) invalid("Nội dung " + key + " không hợp lệ");
    }

    private void history(String id, int version, JsonNode payload, long actor) {
        db.update(
            "insert ignore into study_module_history(module_id,version,payload_json,actor_id) values(?,?,?,?)",
            id,
            version,
            payload.toString(),
            actor
        );
    }

    private void publish(User actor, Map<String, Object> draft) {
        var p = parse(draft.get("payload_json"));
        validate(p, true);
        String id = p.path("id").asText();
        int level = p.path("levelId").asInt();
        var existing = db.queryForList("select * from study_modules where id=?", id);
        int current = existing.isEmpty()
            ? 0
            : ((Number) existing.getFirst().get("version")).intValue();
        if (current != ((Number) draft.get("base_version")).intValue()) throw fail(
            HttpStatus.CONFLICT,
            "Module đã có phiên bản mới. Tạo bản nháp từ bản hiện tại để tránh ghi đè."
        );
        if (!existing.isEmpty()) {
            require(
                ((Number) existing.getFirst().get("level_id")).intValue() == level,
                "Không được chuyển module sang hành trình khác"
            );
            history(id, current, snapshot(id), actor.id);
        }
        // Do not permit a forged lesson ID to overwrite another module's lesson or progress.
        var incoming = new HashSet<String>();
        for (var l : p.path("lessons")) {
            var owners = db.queryForList(
                "select module_id from study_lessons where id=?",
                String.class,
                l.path("id").asText()
            );
            require(
                owners.isEmpty() || owners.getFirst().equals(id),
                "Bài học thuộc module khác; hãy dùng bản nháp của module đó"
            );
            incoming.add(l.path("id").asText());
        }
        for (var old : db.queryForList(
            "select id from study_lessons where module_id=?",
            String.class,
            id
        ))
            require(
                incoming.contains(old),
                "Không được xóa ID bài đã xuất bản; hãy lưu trữ bài đó để giữ tiến độ"
            );
        var otherQuestionIds = new HashSet<String>();
        for (var bank : db.queryForList(
            "select questions_json from study_lessons where module_id<>?",
            String.class,
            id
        ))
            for (var question : parse(bank)) otherQuestionIds.add(question.path("id").asText());
        var activeIncoming = new HashSet<String>();
        for (var lesson : p.path("lessons"))
            if (!lesson.path("archived").asBoolean()) activeIncoming.add(
                lesson.path("id").asText()
            );
        int proposedQuestions = 0;
        for (var lesson : p.path("lessons")) {
            if (
                !lesson.path("archived").asBoolean() && !p.path("archived").asBoolean()
            ) proposedQuestions += lesson.path("questions").size();
            for (var q : lesson.path("questions"))
                require(
                    !otherQuestionIds.contains(q.path("id").asText()),
                    "Mã câu hỏi đã được dùng trong module khác"
                );
            if (
                !p.path("archived").asBoolean() && !lesson.path("archived").asBoolean()
            ) for (var related : lesson.path("content").path("prerequisites"))
                require(
                    activeIncoming.contains(related.path("id").asText()) ||
                        db.queryForObject(
                            "select count(*) from study_lessons l join study_modules m on m.id=l.module_id where l.id=? and m.id<>? and l.archived=false and m.archived=false",
                            Integer.class,
                            related.path("id").asText(),
                            id
                        ) > 0,
                    "Bài học liên quan không tồn tại hoặc đã lưu trữ"
                );
        }
        int otherQuestions = db.queryForObject(
            "select coalesce(sum(JSON_LENGTH(l.questions_json)),0) from study_lessons l join study_modules m on m.id=l.module_id where m.level_id=? and m.id<>? and m.archived=false and l.archived=false",
            Integer.class,
            level,
            id
        );
        require(
            otherQuestions + proposedQuestions >= 10,
            "Hành trình cần giữ ít nhất 10 câu hỏi để học sinh có thể làm kiểm tra level"
        );
        course.preserveModuleAccess();
        var order = new ArrayList<>(
            db.queryForList(
                "select id from study_modules where level_id=? order by ordinal_no",
                String.class,
                level
            )
        );
        order.remove(id);
        int position = Math.min(p.path("ordinalNo").asInt() - 1, order.size());
        order.add(position, id);
        var reordered = new HashMap<String, Integer>();
        for (int i = 0; i < order.size(); i++) {
            String other = order.get(i);
            if (other.equals(id)) continue;
            var old = snapshot(other);
            if (old.path("ordinalNo").asInt() != i + 1) {
                int previous = db.queryForObject(
                    "select version from study_modules where id=?",
                    Integer.class,
                    other
                );
                history(other, previous, old, actor.id);
                reordered.put(other, previous);
            }
        }
        // Negative positions are temporary and avoid unique order collisions during a swap.
        db.update("update study_modules set ordinal_no=-ordinal_no where level_id=?", level);
        if (existing.isEmpty()) db.update(
            "insert into study_modules(id,level_id,ordinal_no,title,archived,version) values(?,?,?,?,?,?)",
            id,
            level,
            -10001,
            p.path("title").asText(),
            p.path("archived").asBoolean(),
            current + 1
        );
        else db.update(
            "update study_modules set title=?,archived=?,version=version+1 where id=?",
            p.path("title").asText(),
            p.path("archived").asBoolean(),
            id
        );
        for (int i = 0; i < order.size(); i++) {
            String other = order.get(i);
            if (reordered.containsKey(other)) db.update(
                "update study_modules set version=version+1 where id=?",
                other
            );
            db.update("update study_modules set ordinal_no=? where id=?", i + 1, other);
        }
        db.update("update study_lessons set ordinal_no=-ordinal_no where module_id=?", id);
        int ordinal = 0;
        for (var l : p.path("lessons"))
            db.update(
                "insert into study_lessons(id,module_id,ordinal_no,title,content_json,questions_json,archived) values(?,?,?,?,?,?,?) on duplicate key update ordinal_no=values(ordinal_no),title=values(title),content_json=values(content_json),questions_json=values(questions_json),archived=values(archived)",
                l.path("id").asText(),
                id,
                ++ordinal,
                l.path("title").asText(),
                l.path("content").toString(),
                l.path("questions").toString(),
                l.path("archived").asBoolean()
            );
        history(id, current + 1, snapshot(id), actor.id);
        reordered.forEach((other, previous) ->
            history(other, previous + 1, snapshot(other), actor.id)
        );
        events.publishEvent(new CurriculumChanged());
    }
}
