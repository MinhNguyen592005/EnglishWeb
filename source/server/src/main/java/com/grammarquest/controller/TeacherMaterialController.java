package com.grammarquest.controller;

import com.grammarquest.entity.User;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.sql.Statement;
import java.time.Instant;
import java.util.*;
import java.util.stream.Stream;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/teacher/materials")
public class TeacherMaterialController {

    private final JdbcTemplate db;
    private final UserRepository users;
    private final TeacherQuestionController questions;

    public TeacherMaterialController(
        JdbcTemplate db,
        UserRepository users,
        TeacherQuestionController questions
    ) {
        this.db = db;
        this.users = users;
        this.questions = questions;
    }

    public record Draft(
        @NotBlank @Size(max = 500) String prompt,
        @Size(max = 255) String optionA,
        @Size(max = 255) String optionB,
        @Size(max = 255) String optionC,
        @Size(max = 255) String optionD,
        String correctOption,
        @NotBlank String explanation,
        @NotNull String questionType,
        @Size(max = 255) String acceptedAnswer
    ) {}

    public record Body(
        @NotBlank @Size(max = 160) String name,
        @Size(max = 1000) String description,
        @NotEmpty @Size(max = 30) List<@Valid Draft> questions
    ) {}

    public record ExamInput(
        @NotNull Long classId,
        @NotBlank @Size(max = 160) String title,
        @NotNull @Future Instant endsAt
    ) {}

    private User teacher(Authentication auth) {
        User user = users.findByUsernameIgnoreCase(auth.getName()).orElseThrow();
        if (user.locked || !"TEACHER".equals(user.role)) throw new ApiException(
            HttpStatus.FORBIDDEN,
            "TEACHER_ONLY",
            "Chỉ giáo viên được quản lý kho bài tập"
        );
        return user;
    }

    private Map<String, Object> own(long id, User user) {
        var rows = db.queryForList(
            "select id,name,description,archived,created_at as createdAt,updated_at as updatedAt from teacher_materials where id=? and teacher_id=?",
            id,
            user.id
        );
        if (rows.isEmpty()) throw new ApiException(
            HttpStatus.NOT_FOUND,
            "MATERIAL_NOT_FOUND",
            "Không tìm thấy bộ bài trong kho của bạn"
        );
        return rows.getFirst();
    }

    private void validate(Draft draft) {
        if (
            !Set.of("MCQ", "FILL_BLANK", "ERROR_CORRECTION", "REWRITE").contains(
                draft.questionType()
            )
        ) throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "INVALID_TYPE",
            "Dạng câu hỏi không được hỗ trợ"
        );
        if ("MCQ".equals(draft.questionType())) {
            if (
                Stream.of(
                    draft.optionA(),
                    draft.optionB(),
                    draft.optionC(),
                    draft.optionD()
                ).anyMatch(v -> v == null || v.isBlank()) ||
                draft.correctOption() == null ||
                !draft.correctOption().matches("[ABCD]")
            ) throw new ApiException(
                HttpStatus.BAD_REQUEST,
                "INVALID_OPTIONS",
                "Câu trắc nghiệm cần 4 phương án và đáp án đúng"
            );
        } else if (
            draft.acceptedAnswer() == null || draft.acceptedAnswer().isBlank()
        ) throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "ANSWER_REQUIRED",
            "Câu tự luận cần đáp án mẫu"
        );
    }

    private void writeQuestions(long materialId, long teacherId, List<Draft> drafts) {
        for (int index = 0; index < drafts.size(); index++) {
            Draft draft = drafts.get(index);
            validate(draft);
            db.update(
                "insert into questions(lesson_id,owner_id,material_id,material_order,prompt,option_a,option_b,option_c,option_d,correct_option,explanation,question_type,accepted_answer,published,teacher_active) values(null,?,?,?,?,?,?,?,?,?,?,?,?,false,true)",
                teacherId,
                materialId,
                index,
                draft.prompt().trim(),
                Objects.toString(draft.optionA(), ""),
                Objects.toString(draft.optionB(), ""),
                Objects.toString(draft.optionC(), ""),
                Objects.toString(draft.optionD(), ""),
                "MCQ".equals(draft.questionType()) ? draft.correctOption() : "A",
                draft.explanation().trim(),
                draft.questionType(),
                draft.acceptedAnswer()
            );
        }
    }

    @GetMapping
    public List<Map<String, Object>> list(Authentication auth) {
        User user = teacher(auth);
        return db.queryForList(
            "select m.id,m.name,m.description,m.archived,m.created_at as createdAt,m.updated_at as updatedAt,(select count(*) from questions q where q.material_id=m.id and q.deleted=false) as questionCount from teacher_materials m where teacher_id=? order by m.updated_at desc,m.id desc",
            user.id
        );
    }

    @GetMapping("/{id}")
    public Map<String, Object> detail(Authentication auth, @PathVariable long id) {
        User user = teacher(auth);
        var result = new LinkedHashMap<>(own(id, user));
        var rows = db.queryForList(
            "select id,prompt,option_a as optionA,option_b as optionB,option_c as optionC,option_d as optionD,correct_option as correctOption,explanation,question_type as questionType,accepted_answer as acceptedAnswer,teacher_active as active from questions where material_id=? and owner_id=? and deleted=false order by material_order,id",
            id,
            user.id
        );
        result.put("questions", rows);
        result.put("questionCount", rows.size());
        return result;
    }

    @PostMapping
    @Transactional
    public Map<String, Object> create(Authentication auth, @Valid @RequestBody Body body) {
        User user = teacher(auth);
        var key = new GeneratedKeyHolder();
        db.update(connection -> {
            var ps = connection.prepareStatement(
                "insert into teacher_materials(teacher_id,name,description) values(?,?,?)",
                Statement.RETURN_GENERATED_KEYS
            );
            ps.setLong(1, user.id);
            ps.setString(2, body.name().trim());
            ps.setString(3, Objects.toString(body.description(), "").trim());
            return ps;
        }, key);
        long id = Objects.requireNonNull(key.getKey()).longValue();
        writeQuestions(id, user.id, body.questions());
        return detail(auth, id);
    }

    @PutMapping("/{id}")
    @Transactional
    public Map<String, Object> update(
        Authentication auth,
        @PathVariable long id,
        @Valid @RequestBody Body body
    ) {
        User user = teacher(auth);
        own(id, user);
        db.update(
            "update teacher_materials set name=?,description=?,updated_at=current_timestamp(6) where id=?",
            body.name().trim(),
            Objects.toString(body.description(), "").trim(),
            id
        );
        // Keep old rows for foreign keys held by already published assignment snapshots.
        db.update(
            "update questions set deleted=true,teacher_active=false where material_id=? and owner_id=?",
            id,
            user.id
        );
        writeQuestions(id, user.id, body.questions());
        return detail(auth, id);
    }

    @PatchMapping("/{id}/archive")
    @Transactional
    public Map<String, Object> archive(
        Authentication auth,
        @PathVariable long id,
        @RequestBody Map<String, Boolean> body
    ) {
        User user = teacher(auth);
        own(id, user);
        db.update(
            "update teacher_materials set archived=? where id=?",
            Boolean.TRUE.equals(body.get("archived")),
            id
        );
        return detail(auth, id);
    }

    @PostMapping("/{id}/live-exams")
    @Transactional
    public Map<String, Object> exam(
        Authentication auth,
        @PathVariable long id,
        @Valid @RequestBody ExamInput body
    ) {
        User user = teacher(auth);
        var material = own(id, user);
        if (Boolean.TRUE.equals(material.get("archived"))) throw new ApiException(
            HttpStatus.CONFLICT,
            "MATERIAL_ARCHIVED",
            "Khôi phục bộ bài trước khi sử dụng"
        );
        var ids = db.queryForList(
            "select id from questions where material_id=? and owner_id=? and teacher_active=true and deleted=false order by material_order,id",
            Long.class,
            id,
            user.id
        );
        if (ids.isEmpty() || ids.size() > 30) throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "INVALID_MATERIAL",
            "Bộ bài cần từ 1 đến 30 câu hỏi"
        );
        return questions.toLiveExam(
            auth,
            new TeacherQuestionController.LiveExamInput(
                body.classId(),
                body.title(),
                body.endsAt(),
                ids
            )
        );
    }
}
