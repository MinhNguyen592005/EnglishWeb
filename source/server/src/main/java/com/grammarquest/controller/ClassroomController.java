package com.grammarquest.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.grammarquest.entity.*;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.*;
import com.grammarquest.service.AssignmentResults;
import com.grammarquest.service.LearningService;
import com.grammarquest.service.RealtimeNotifier;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/classes")
public class ClassroomController {

    @org.springframework.beans.factory.annotation.Autowired
    private com.grammarquest.service.NotificationService notifications;

    private final JdbcTemplate db;
    private final UserRepository users;
    private final LearningService learning;
    private final RealtimeNotifier notifier;

    public ClassroomController(
        JdbcTemplate db,
        UserRepository users,
        LearningService learning,
        RealtimeNotifier notifier
    ) {
        this.db = db;
        this.users = users;
        this.learning = learning;
        this.notifier = notifier;
    }

    public record NewClass(@NotBlank @Size(max = 120) String name) {}

    public record AssignmentUpdate(
        @NotBlank @Size(max = 160) String title,
        @Size(max = 1000) String instructions,
        @Min(1) @Max(100) int passPercent,
        @NotNull Instant dueAt,
        @NotBlank @Pattern(regexp = "PUBLISHED|CLOSED") String status
    ) {}

    public record Join(@NotBlank String code) {}

    public record NewAssignment(
        @NotBlank @Size(max = 160) String title,
        Long lessonId,
        @Size(max = 1000) String instructions,
        @Min(1) @Max(100) int passPercent,
        @NotNull Instant dueAt,
        @Size(min = 1, max = 30) List<@NotNull @Positive Long> questionIds,
        @Positive Long materialId
    ) {
        public NewAssignment(
            String title,
            Long lessonId,
            String instructions,
            int passPercent,
            Instant dueAt
        ) {
            this(title, lessonId, instructions, passPercent, dueAt, null, null);
        }

        public NewAssignment(
            String title,
            Long lessonId,
            String instructions,
            int passPercent,
            Instant dueAt,
            List<Long> questionIds
        ) {
            this(title, lessonId, instructions, passPercent, dueAt, questionIds, null);
        }
    }

    public record Message(@NotBlank @Size(max = 1000) String body) {}

    public record Report(@NotBlank @Size(max = 500) String reason) {}

    private ApiException denied() {
        return new ApiException(
            HttpStatus.FORBIDDEN,
            "FORBIDDEN",
            "Bạn không có quyền trong lớp học này"
        );
    }

    private User current(Authentication auth) {
        User u = users.findByUsernameIgnoreCase(auth.getName()).orElseThrow();
        if (u.locked) throw denied();
        if (u.role.equals("ADMIN")) throw new ApiException(
            HttpStatus.FORBIDDEN,
            "ADMIN_ONLY_MANAGEMENT",
            "Quản trị viên chỉ sử dụng chức năng quản trị"
        );
        return u;
    }

    private Map<String, Object> row(String sql, Object... args) {
        return db
            .query(
                sql,
                (rs, n) -> {
                    Map<String, Object> out = new LinkedHashMap<>();
                    var meta = rs.getMetaData();
                    for (int i = 1; i <= meta.getColumnCount(); i++) out.put(
                        meta.getColumnLabel(i),
                        rs.getObject(i)
                    );
                    return out;
                },
                args
            )
            .stream()
            .findFirst()
            .orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Không tìm thấy dữ liệu")
            );
    }

    private long insert(String sql, Object... args) {
        KeyHolder key = new GeneratedKeyHolder();
        db.update(c -> {
            PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            for (int i = 0; i < args.length; i++) ps.setObject(i + 1, args[i]);
            return ps;
        }, key);
        return Objects.requireNonNull(key.getKey()).longValue();
    }

    private Map<String, Object> classroom(long id) {
        return row(
            "select c.id,c.name,c.join_code as joinCode,c.teacher_id as teacherId,u.display_name as teacherName from classrooms c join users u on u.id=c.teacher_id where c.id=?",
            id
        );
    }

    private boolean member(long classId, long userId) {
        Integer n = db.queryForObject(
            "select count(*) from class_members where class_id=? and user_id=?",
            Integer.class,
            classId,
            userId
        );
        return n != null && n > 0;
    }

    private void access(long classId, User u) {
        Map<String, Object> c = classroom(classId);
        if (
            ((Number) c.get("teacherId")).longValue() != u.id &&
            (!u.role.equals("LEARNER") || !member(classId, u.id))
        ) throw denied();
    }

    private void owner(long classId, User u) {
        if (!u.role.equals("TEACHER")) throw denied();
        if (((Number) classroom(classId).get("teacherId")).longValue() != u.id) throw denied();
    }

    @GetMapping
    public List<Map<String, Object>> list(Authentication auth) {
        User u = current(auth);
        return db.queryForList(
            "select c.id,c.name,c.join_code as joinCode,c.teacher_id as teacherId,u.display_name as teacherName,(select count(*) from class_members cm where cm.class_id=c.id) as memberCount from classrooms c join users u on u.id=c.teacher_id where c.teacher_id=? or (?='LEARNER' and exists(select 1 from class_members m where m.class_id=c.id and m.user_id=?)) order by c.id desc",
            u.id,
            u.role,
            u.id
        );
    }

    @PostMapping
    @Transactional
    public Map<String, Object> create(Authentication auth, @Valid @RequestBody NewClass body) {
        User u = current(auth);
        if (!u.role.equals("TEACHER")) throw denied();
        String code;
        do {
            code = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        } while (
            db.queryForObject(
                "select count(*) from classrooms where join_code=?",
                Integer.class,
                code
            ) > 0
        );
        long id = insert(
            "insert into classrooms(teacher_id,name,join_code) values(?,?,?)",
            u.id,
            body.name().trim(),
            code
        );
        notifier.classroom(id);
        return classroom(id);
    }

    @PatchMapping("/{id}")
    @Transactional
    public Map<String, Object> rename(
        Authentication auth,
        @PathVariable long id,
        @Valid @RequestBody NewClass body
    ) {
        User u = current(auth);
        owner(id, u);
        db.update("update classrooms set name=? where id=?", body.name().trim(), id);
        notifier.classroom(id);
        return classroom(id);
    }

    @DeleteMapping("/{id}/members/{memberId}")
    @Transactional
    public Map<String, Object> removeMember(
        Authentication auth,
        @PathVariable long id,
        @PathVariable long memberId
    ) {
        User u = current(auth);
        owner(id, u);
        if (
            db.update("delete from class_members where class_id=? and user_id=?", id, memberId) == 0
        ) throw new ApiException(
            HttpStatus.NOT_FOUND,
            "MEMBER_NOT_FOUND",
            "Học viên không còn trong lớp"
        );
        notifier.classroom(id);
        if (notifications != null) notifications.changed(memberId);
        return Map.of("removed", true);
    }

    @PostMapping("/join")
    @Transactional
    public Map<String, Object> join(Authentication auth, @Valid @RequestBody Join body) {
        User u = current(auth);
        if (!u.role.equals("LEARNER")) throw new ApiException(
            HttpStatus.FORBIDDEN,
            "LEARNER_ONLY",
            "Chỉ học viên được tham gia lớp bằng mã"
        );
        Map<String, Object> c = row(
            "select id,teacher_id as teacherId from classrooms where join_code=?",
            body.code().trim().toUpperCase()
        );
        long classId = ((Number) c.get("id")).longValue();
        if (((Number) c.get("teacherId")).longValue() != u.id) db.update(
            "insert ignore into class_members(class_id,user_id) values(?,?)",
            classId,
            u.id
        );
        notifier.classroom(classId);
        return classroom(classId);
    }

    @GetMapping("/{id}")
    public Map<String, Object> detail(Authentication auth, @PathVariable long id) {
        User u = current(auth);
        access(id, u);
        Map<String, Object> c = classroom(id);
        c.put(
            "members",
            db.queryForList(
                "select u.id,u.username,u.display_name as displayName,u.role from class_members m join users u on u.id=m.user_id where m.class_id=? order by u.display_name",
                id
            )
        );
        c.put("assignments", assignments(id));
        return c;
    }

    @GetMapping("/{id}/overview")
    public Map<String, Object> overview(Authentication auth, @PathVariable long id) {
        User u = current(auth);
        access(id, u);
        int students = Objects.requireNonNullElse(
            db.queryForObject(
                "select count(*) from class_members m join users s on s.id=m.user_id and s.role='LEARNER' where m.class_id=?",
                Integer.class,
                id
            ),
            0
        );
        int totalAssignments = Objects.requireNonNullElse(
            db.queryForObject(
                "select count(*) from assignments where class_id=?",
                Integer.class,
                id
            ),
            0
        );
        int activeAssignments = Objects.requireNonNullElse(
            db.queryForObject(
                "select count(*) from assignments where class_id=? and status='PUBLISHED' and due_at>current_timestamp(6)",
                Integer.class,
                id
            ),
            0
        );
        int submitted = Objects.requireNonNullElse(
            db.queryForObject(
                "select count(distinct aa.assignment_id, a.user_id) from assignment_attempts aa join attempts a on a.id=aa.attempt_id join assignments x on x.id=aa.assignment_id join class_members m on m.class_id=x.class_id and m.user_id=a.user_id where x.class_id=? and a.completed_at is not null and a.completed_at<=least(coalesce(aa.submit_deadline_at,x.due_at),x.due_at)",
                Integer.class,
                id
            ),
            0
        );
        String officialGrades =
            "select a.user_id,aa.assignment_id,max(a.correct_count*100.0/nullif(a.total_questions,0)) as score,max(ass.pass_percent) as passPercent from assignment_attempts aa join attempts a on a.id=aa.attempt_id join assignments ass on ass.id=aa.assignment_id join class_members m on m.class_id=ass.class_id and m.user_id=a.user_id where ass.class_id=? and a.completed_at is not null and a.completed_at<=least(coalesce(aa.submit_deadline_at,ass.due_at),ass.due_at) group by a.user_id,aa.assignment_id";
        Double average = db.queryForObject(
            "select avg(g.score) from (" + officialGrades + ") g",
            Double.class,
            id
        );
        Double passed = db.queryForObject(
            "select avg(case when g.score>=g.passPercent then 100.0 else 0.0 end) from (" +
                officialGrades +
                ") g",
            Double.class,
            id
        );
        int overdue = Objects.requireNonNullElse(
            db.queryForObject(
                "select count(*) from assignments where class_id=? and status='PUBLISHED' and due_at<=current_timestamp(6)",
                Integer.class,
                id
            ),
            0
        );
        int upcoming = Objects.requireNonNullElse(
            db.queryForObject(
                "select count(*) from assignments where class_id=? and status='PUBLISHED' and due_at>current_timestamp(6) and due_at<=date_add(current_timestamp(6),interval 48 hour)",
                Integer.class,
                id
            ),
            0
        );
        Timestamp last = db.queryForObject(
            "select greatest(coalesce((select max(created_at) from assignments where class_id=?),timestamp'1970-01-01 00:00:00'),coalesce((select max(joined_at) from class_members where class_id=?),timestamp'1970-01-01 00:00:00'),coalesce((select max(created_at) from class_messages where class_id=?),timestamp'1970-01-01 00:00:00'))",
            Timestamp.class,
            id,
            id,
            id
        );
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("classId", id);
        result.put("totalStudents", students);
        result.put("activeAssignments", activeAssignments);
        result.put("totalAssignments", totalAssignments);
        result.put("submittedAssignments", submitted);
        result.put(
            "submissionRate",
            students == 0 || totalAssignments == 0
                ? null
                : (submitted * 100.0) / (students * totalAssignments)
        );
        result.put("averageScore", average);
        result.put("passedRate", passed);
        result.put("overdueAssignments", overdue);
        result.put("upcomingAssignments", upcoming);
        result.put("lastActivityAt", last == null ? null : last.toInstant().toString());
        return result;
    }

    private List<Map<String, Object>> assignments(long id) {
        return db.queryForList(
            "select a.id,a.title,a.instructions,a.lesson_id as lessonId,a.material_id as materialId,coalesce(m.name,l.title,'Bộ câu hỏi') as lessonTitle,a.pass_percent as passPercent,a.due_at as dueAt,a.status from assignments a left join lessons l on l.id=a.lesson_id left join teacher_materials m on m.id=a.material_id where a.class_id=? order by a.id desc",
            id
        );
    }

    @PostMapping("/{id}/assignments")
    @Transactional
    public Map<String, Object> assign(
        Authentication auth,
        @PathVariable long id,
        @Valid @RequestBody NewAssignment body
    ) {
        User u = current(auth);
        owner(id, u);
        if (body.dueAt().isBefore(Instant.now())) throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "DUE_PAST",
            "Hạn nộp phải ở tương lai"
        );
        Long lessonId = body.lessonId();
        List<Long> selectedIds = body.questionIds();
        if (body.materialId() != null) {
            Integer own = db.queryForObject(
                "select count(*) from teacher_materials where id=? and teacher_id=? and archived=false",
                Integer.class,
                body.materialId(),
                u.id
            );
            if (own == null || own == 0) throw new ApiException(
                HttpStatus.BAD_REQUEST,
                "MATERIAL_NOT_FOUND",
                "Bộ bài không thuộc kho của bạn hoặc đã lưu trữ"
            );
            selectedIds = db.queryForList(
                "select id from questions where material_id=? and owner_id=? and deleted=false and teacher_active=true order by material_order,id",
                Long.class,
                body.materialId(),
                u.id
            );
            if (selectedIds.isEmpty() || selectedIds.size() > 30) throw new ApiException(
                HttpStatus.BAD_REQUEST,
                "INVALID_MATERIAL",
                "Bộ bài cần từ 1 đến 30 câu hỏi"
            );
            lessonId = null;
        } else {
            if (lessonId == null) throw new ApiException(
                HttpStatus.BAD_REQUEST,
                "MATERIAL_REQUIRED",
                "Chọn bộ bài từ kho của bạn"
            );
            Integer count = db.queryForObject(
                "select count(*) from lessons where id=? and published=true",
                Integer.class,
                lessonId
            );
            if (count == null || count == 0) throw new ApiException(
                HttpStatus.BAD_REQUEST,
                "LESSON_NOT_FOUND",
                "Bài học không tồn tại"
            );
        }
        String snapshot = null;
        if (selectedIds != null) {
            if (new HashSet<>(selectedIds).size() != selectedIds.size()) throw new ApiException(
                HttpStatus.BAD_REQUEST,
                "DUPLICATE_QUESTIONS",
                "Danh sách câu hỏi bị trùng"
            );
            var json = new ObjectMapper();
            var selected = json.createArrayNode();
            for (Long questionId : selectedIds) {
                var rows = db.queryForList(
                    "select id,lesson_id,prompt,option_a,option_b,option_c,option_d,correct_option,question_type,accepted_answer,explanation from questions where id=? and owner_id=? and teacher_active=true and deleted=false",
                    questionId,
                    u.id
                );
                if (rows.isEmpty()) throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_QUESTIONS",
                    "Câu hỏi không thuộc kho của bạn hoặc đã được lưu trữ"
                );
                var q = rows.getFirst();
                var node = selected.addObject();
                node.put("id", ((Number) q.get("id")).longValue());
                if (q.get("lesson_id") != null) node.put(
                    "lessonId",
                    ((Number) q.get("lesson_id")).longValue()
                );
                for (var field : Map.of(
                    "prompt",
                    "prompt",
                    "optionA",
                    "option_a",
                    "optionB",
                    "option_b",
                    "optionC",
                    "option_c",
                    "optionD",
                    "option_d",
                    "correctOption",
                    "correct_option",
                    "questionType",
                    "question_type",
                    "acceptedAnswer",
                    "accepted_answer",
                    "explanation",
                    "explanation"
                ).entrySet())
                    node.put(field.getKey(), Objects.toString(q.get(field.getValue()), ""));
            }
            snapshot = selected.toString();
        }
        long assignmentId = insert(
            "insert into assignments(class_id,lesson_id,title,instructions,pass_percent,due_at,question_snapshot_json,material_id) values(?,?,?,?,?,?,?,?)",
            id,
            lessonId,
            body.title().trim(),
            Objects.toString(body.instructions(), "").trim(),
            body.passPercent(),
            Timestamp.from(body.dueAt()),
            snapshot,
            body.materialId()
        );
        if (notifications != null) notifications.classwork(id, assignmentId, null);
        notifier.classroom(id);
        return row(
            "select id,title,lesson_id as lessonId,pass_percent as passPercent,due_at as dueAt,status from assignments where id=?",
            assignmentId
        );
    }

    @PatchMapping("/{id}/assignments/{assignmentId}")
    @Transactional
    public Map<String, Object> updateAssignment(
        Authentication auth,
        @PathVariable long id,
        @PathVariable long assignmentId,
        @Valid @RequestBody AssignmentUpdate body
    ) {
        User u = current(auth);
        owner(id, u);
        row("select id from assignments where id=? and class_id=?", assignmentId, id);
        if (
            "PUBLISHED".equals(body.status()) && body.dueAt().isBefore(Instant.now())
        ) throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "DUE_PAST",
            "Hạn nộp phải ở tương lai khi mở bài giao"
        );
        db.update(
            "update assignments set title=?,instructions=?,pass_percent=?,due_at=?,status=? where id=?",
            body.title().trim(),
            Objects.toString(body.instructions(), "").trim(),
            body.passPercent(),
            Timestamp.from(body.dueAt()),
            body.status(),
            assignmentId
        );
        notifier.classroom(id);
        return row(
            "select id,title,lesson_id as lessonId,pass_percent as passPercent,due_at as dueAt,status from assignments where id=?",
            assignmentId
        );
    }

    @PostMapping("/{id}/assignments/{assignmentId}/start")
    @Transactional
    public LearningService.AttemptView start(
        Authentication auth,
        @PathVariable long id,
        @PathVariable long assignmentId
    ) {
        User u = current(auth);
        access(id, u);
        if (!"LEARNER".equals(u.role)) throw denied();
        Map<String, Object> a = row(
            "select lesson_id as lessonId,due_at as dueAt,status,pass_percent as passPercent,question_snapshot_json as questionSnapshot from assignments where id=? and class_id=?",
            assignmentId,
            id
        );
        if (
            !"PUBLISHED".equals(a.get("status")) ||
            !((Timestamp) a.get("dueAt")).toInstant().isAfter(Instant.now())
        ) throw new ApiException(
            HttpStatus.CONFLICT,
            "ASSIGNMENT_CLOSED",
            "Nhiệm vụ đã đóng hoặc quá hạn"
        );
        Long assignedLesson =
            a.get("lessonId") == null ? null : ((Number) a.get("lessonId")).longValue();
        users.findWithLockById(u.id).orElseThrow();
        var ongoing = db.queryForList(
            "select a.id from assignment_attempts aa join attempts a on a.id=aa.attempt_id where aa.assignment_id=? and a.user_id=? and a.status='IN_PROGRESS' and (aa.submit_deadline_at is null or aa.submit_deadline_at>current_timestamp(6)) order by a.id desc limit 1",
            Long.class,
            assignmentId,
            u.id
        );
        if (!ongoing.isEmpty()) return learning.get(auth.getName(), ongoing.getFirst());
        var attempt =
            a.get("questionSnapshot") == null
                ? learning.startAssignment(
                      auth.getName(),
                      assignedLesson,
                      ((Number) classroom(id).get("teacherId")).longValue()
                  )
                : learning.startAssignmentSnapshot(
                      auth.getName(),
                      assignedLesson,
                      a.get("questionSnapshot").toString(),
                      ((Number) a.get("passPercent")).intValue()
                  );
        db.update(
            "insert into assignment_attempts(assignment_id,attempt_id,submit_deadline_at) values(?,?,?)",
            assignmentId,
            attempt.id(),
            Timestamp.from(Instant.now().plusSeconds(900))
        );
        notifier.classroom(id);
        return attempt.forClass(id);
    }

    @GetMapping("/{id}/my-results")
    public List<Map<String, Object>> myResults(Authentication auth, @PathVariable long id) {
        User u = current(auth);
        access(id, u);
        if (!"LEARNER".equals(u.role)) throw denied();
        return assignmentResults(id, null, u.id, false);
    }

    @GetMapping("/{id}/assignments/{assignmentId}/results")
    public List<Map<String, Object>> results(
        Authentication auth,
        @PathVariable long id,
        @PathVariable long assignmentId
    ) {
        User u = current(auth);
        owner(id, u);
        row("select id from assignments where id=? and class_id=?", assignmentId, id);
        return assignmentResults(id, assignmentId, null, true);
    }

    private List<Map<String, Object>> assignmentResults(
        long classId,
        Long assignmentId,
        Long userId,
        boolean teacher
    ) {
        String eligible =
            "a.completed_at is not null and a.completed_at<=least(coalesce(aa.submit_deadline_at,ass.due_at),ass.due_at)";
        String sql =
            "select ass.id as assignmentId,u.id as userId,u.display_name as displayName,a.id as attemptId,a.status,a.correct_count as correctCount,a.total_questions as totalQuestions,a.completed_at as completedAt,(" +
            eligible +
            ") as eligible,(" +
            eligible +
            " and a.correct_count*100>=a.total_questions*ass.pass_percent) as passed,least(coalesce(aa.submit_deadline_at,ass.due_at),ass.due_at) as submitDeadlineAt from assignment_attempts aa join assignments ass on ass.id=aa.assignment_id join attempts a on a.id=aa.attempt_id join users u on u.id=a.user_id where ass.class_id=?";
        List<Object> args = new ArrayList<>(List.of(classId));
        if (assignmentId != null) {
            sql += " and ass.id=?";
            args.add(assignmentId);
        }
        if (userId != null) {
            sql += " and a.user_id=?";
            args.add(userId);
        }
        sql += " order by ass.id desc,u.display_name,a.id";
        return AssignmentResults.summarize(db.queryForList(sql, args.toArray()), teacher);
    }

    @GetMapping("/{id}/messages")
    public List<Map<String, Object>> messages(Authentication auth, @PathVariable long id) {
        User u = current(auth);
        access(id, u);
        return db
            .queryForList(
                "select m.id,m.user_id as userId,u.display_name as displayName,m.body,m.created_at as createdAt from class_messages m join users u on u.id=m.user_id where m.class_id=? order by m.id desc limit 100",
                id
            )
            .reversed();
    }

    @PostMapping("/{id}/messages")
    @Transactional
    public Map<String, Object> message(
        Authentication auth,
        @PathVariable long id,
        @Valid @RequestBody Message body
    ) {
        User u = current(auth);
        access(id, u);
        Integer muted = db.queryForObject(
            "select count(*) from chat_mutes where user_id=? and expires_at>current_timestamp(6)",
            Integer.class,
            u.id
        );
        if (muted != null && muted > 0) throw new ApiException(
            HttpStatus.FORBIDDEN,
            "CHAT_MUTED",
            "Bạn đang bị tạm cấm chat"
        );
        Integer recent = db.queryForObject(
            "select count(*) from class_messages where user_id=? and created_at>date_sub(current_timestamp(6),interval 10 second)",
            Integer.class,
            u.id
        );
        if (recent != null && recent >= 5) throw new ApiException(
            HttpStatus.TOO_MANY_REQUESTS,
            "CHAT_RATE_LIMIT",
            "Hãy chờ trước khi gửi thêm tin"
        );
        long messageId = insert(
            "insert into class_messages(class_id,user_id,body) values(?,?,?)",
            id,
            u.id,
            body.body().trim()
        );
        notifier.classroom(id);
        return row(
            "select m.id,m.user_id as userId,u.display_name as displayName,m.body,m.created_at as createdAt from class_messages m join users u on u.id=m.user_id where m.id=?",
            messageId
        );
    }

    @PostMapping("/{id}/messages/{messageId}/report")
    @Transactional
    public Map<String, Object> report(
        Authentication auth,
        @PathVariable long id,
        @PathVariable long messageId,
        @Valid @RequestBody Report body
    ) {
        User u = current(auth);
        access(id, u);
        long accused = (
            (Number) row(
                "select user_id from class_messages where id=? and class_id=?",
                messageId,
                id
            ).get("user_id")
        ).longValue();
        if (accused == u.id) throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "SELF_REPORT",
            "Không thể báo cáo tin nhắn của chính bạn"
        );
        db.queryForObject("select id from users where id=? for update", Long.class, u.id);
        if (
            db.queryForObject(
                "select count(*) from reports where reporter_id=? and message_id=?",
                Integer.class,
                u.id,
                messageId
            ) > 0
        ) throw new ApiException(
            HttpStatus.CONFLICT,
            "ALREADY_REPORTED",
            "Bạn đã báo cáo tin nhắn này"
        );
        long reportId = insert(
            "insert into reports(reporter_id,message_id,reason) values(?,?,?)",
            u.id,
            messageId,
            body.reason().trim()
        );
        notifier.reported(accused, u.id, "CLASS", reportId);
        return Map.of("id", reportId, "status", "OPEN");
    }
}
