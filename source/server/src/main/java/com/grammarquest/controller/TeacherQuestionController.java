package com.grammarquest.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.grammarquest.entity.*;
import com.grammarquest.repository.*;
import com.grammarquest.exception.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.stream.Stream;

@RestController @RequestMapping("/api/v1/teacher/questions")
public class TeacherQuestionController {
    private final JdbcTemplate db;
    private final UserRepository users;
    private final ObjectMapper json;

    @org.springframework.beans.factory.annotation.Autowired
    public TeacherQuestionController(JdbcTemplate db, UserRepository users, ObjectMapper json) {
        this.db = db;
        this.users = users;
        this.json = json;
    }

    public TeacherQuestionController(JdbcTemplate db, UserRepository users) {
        this(db, users, new ObjectMapper());
    }

    public record Body(@NotNull Long lessonId,@NotBlank @Size(max=500) String prompt,
                       @Size(max=255) String optionA,@Size(max=255) String optionB,
                       @Size(max=255) String optionC,@Size(max=255) String optionD,
                       String correctOption,@NotBlank String explanation,
                       String questionType,@Size(max=255) String acceptedAnswer) {}
    public record BatchBody(@NotNull Long lessonId, @NotEmpty List<@Valid BatchItem> questions) {}
    public record BatchItem(@NotBlank @Size(max=500) String prompt, @Size(max=255) String optionA, @Size(max=255) String optionB, @Size(max=255) String optionC, @Size(max=255) String optionD, String correctOption, @NotBlank String explanation, String questionType, @Size(max=255) String acceptedAnswer) {}
    public record PromoteInput(@NotEmpty List<Long> questionIds) {}
    public record LiveExamInput(@NotNull Long classId, @NotBlank @Size(max=160) String title, @NotNull Instant endsAt, @NotEmpty List<Long> questionIds) {}

    private User teacher(Authentication a){
        User u=users.findByUsernameIgnoreCase(a.getName()).orElseThrow();
        if(u.locked||!u.role.equals("TEACHER")) throw new ApiException(HttpStatus.FORBIDDEN,"TEACHER_ONLY","Chỉ giáo viên được soạn câu hỏi");
        return u;
    }
    private void lesson(Long id){
        if(db.queryForObject("select count(*) from lessons where id=? and published=true",Integer.class,id)==0)
            throw new ApiException(HttpStatus.BAD_REQUEST,"LESSON_NOT_FOUND","Bài học không tồn tại");
    }
    private void own(long id,User u){
        if(db.queryForObject("select count(*) from questions where id=? and deleted=false and owner_id=?",Integer.class,id,u.id)==0)
            throw new ApiException(HttpStatus.FORBIDDEN,"QUESTION_FORBIDDEN","Câu hỏi không thuộc tài khoản của bạn");
    }
    private String type(Body body){
        String type=body.questionType()==null?"MCQ":body.questionType();
        if(!Set.of("MCQ","FILL_BLANK","ERROR_CORRECTION","REWRITE").contains(type))
            throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_QUESTION_TYPE","Dạng câu hỏi không hợp lệ");
        if(type.equals("MCQ")) {
            if(Stream.of(body.optionA(),body.optionB(),body.optionC(),body.optionD()).anyMatch(v->v==null||v.isBlank())||body.correctOption()==null||!body.correctOption().matches("[ABCD]"))
                throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_OPTIONS","Câu trắc nghiệm cần bốn phương án và một đáp án đúng");
        } else {
            if(body.acceptedAnswer()==null||body.acceptedAnswer().isBlank())
                throw new ApiException(HttpStatus.BAD_REQUEST,"ANSWER_REQUIRED","Cần nhập đáp án mẫu để chấm tự động");
            if(body.acceptedAnswer().length() > 255)
                throw new ApiException(HttpStatus.BAD_REQUEST,"ANSWER_TOO_LONG","Đáp án mẫu không được vượt quá 255 ký tự");
        }
        return type;
    }
    private Map<String,Object> view(long id){
        return db.queryForMap("select id,lesson_id as lessonId,prompt,option_a as optionA,option_b as optionB,option_c as optionC,option_d as optionD,correct_option as correctOption,explanation,question_type as questionType,accepted_answer as acceptedAnswer,teacher_active as active from questions where id=?",id);
    }
    @GetMapping public List<Map<String,Object>> list(Authentication a){
        User u=teacher(a);
        return db.queryForList("select id,lesson_id as lessonId,prompt,option_a as optionA,option_b as optionB,option_c as optionC,option_d as optionD,correct_option as correctOption,explanation,question_type as questionType,accepted_answer as acceptedAnswer,teacher_active as active from questions where deleted=false and owner_id=? order by id desc",u.id);
    }
    @PostMapping @Transactional public Map<String,Object> create(Authentication a,@Valid @RequestBody Body body){
        User u=teacher(a);lesson(body.lessonId());String type=type(body);
        var key=new GeneratedKeyHolder();
        db.update(c->{var ps=c.prepareStatement("insert into questions(lesson_id,owner_id,prompt,option_a,option_b,option_c,option_d,correct_option,explanation,question_type,accepted_answer,published,teacher_active) values(?,?,?,?,?,?,?,?,?,?,?,false,true)",Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1,body.lessonId());ps.setLong(2,u.id);ps.setString(3,body.prompt().trim());ps.setString(4,Objects.toString(body.optionA(),"").trim());ps.setString(5,Objects.toString(body.optionB(),"").trim());ps.setString(6,Objects.toString(body.optionC(),"").trim());ps.setString(7,Objects.toString(body.optionD(),"").trim());ps.setString(8,type.equals("MCQ")?body.correctOption():"A");ps.setString(9,body.explanation().trim());ps.setString(10,type);ps.setString(11,type.equals("MCQ")?null:body.acceptedAnswer().trim());return ps;},key);
        long id=Objects.requireNonNull(key.getKey()).longValue();
        db.update("insert into audit_logs(actor_id,action,target_type,target_id,detail) values(?,?,?,?,?)",u.id,"PRIVATE_QUESTION_CREATE","QUESTION",id,body.prompt());
        return view(id);
    }
    @PostMapping("/batch") @Transactional public Map<String,Object> createBatch(Authentication a, @Valid @RequestBody BatchBody batch) {
        User u = teacher(a);
        lesson(batch.lessonId());
        var createdList = new ArrayList<Map<String,Object>>();
        for (int i = 0; i < batch.questions().size(); i++) {
            var item = batch.questions().get(i);
            Body tempBody = new Body(batch.lessonId(), item.prompt(), item.optionA(), item.optionB(), item.optionC(), item.optionD(), item.correctOption(), item.explanation(), item.questionType(), item.acceptedAnswer());
            String type;
            try {
                type = type(tempBody);
            } catch (ApiException ex) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_BATCH_ITEM", "Câu số " + (i + 1) + ": " + ex.getMessage());
            }
            var key = new GeneratedKeyHolder();
            final String qType = type;
            db.update(c -> {
                var ps = c.prepareStatement("insert into questions(lesson_id,owner_id,prompt,option_a,option_b,option_c,option_d,correct_option,explanation,question_type,accepted_answer,published,teacher_active) values(?,?,?,?,?,?,?,?,?,?,?,false,true)", Statement.RETURN_GENERATED_KEYS);
                ps.setLong(1, batch.lessonId());
                ps.setLong(2, u.id);
                ps.setString(3, item.prompt().trim());
                ps.setString(4, Objects.toString(item.optionA(), "").trim());
                ps.setString(5, Objects.toString(item.optionB(), "").trim());
                ps.setString(6, Objects.toString(item.optionC(), "").trim());
                ps.setString(7, Objects.toString(item.optionD(), "").trim());
                ps.setString(8, qType.equals("MCQ") ? item.correctOption() : "A");
                ps.setString(9, item.explanation().trim());
                ps.setString(10, qType);
                ps.setString(11, qType.equals("MCQ") ? null : Objects.toString(item.acceptedAnswer(), "").trim());
                return ps;
            }, key);
            long id = Objects.requireNonNull(key.getKey()).longValue();
            db.update("insert into audit_logs(actor_id,action,target_type,target_id,detail) values(?,?,?,?,?)", u.id, "PRIVATE_QUESTION_CREATE", "QUESTION", id, item.prompt().trim());
            createdList.add(view(id));
        }
        return Map.of("createdCount", createdList.size(), "questions", createdList);
    }
    @PostMapping("/promote-common") @Transactional public Map<String,Object> promoteCommon(Authentication a, @Valid @RequestBody PromoteInput body) {
        User u = teacher(a);
        int promoted = 0;
        for (Long qId : body.questionIds()) {
            var rows = db.queryForList("select * from questions where id=? and owner_id=? and deleted=false", qId, u.id);
            if (rows.isEmpty()) continue;
            var q = rows.getFirst();
            String qType = Objects.toString(q.get("question_type"), "MCQ");
            if (!"MCQ".equalsIgnoreCase(qType)) {
                continue; // Hành tinh chính & PvP chỉ nhận MCQ, bỏ qua các dạng tự luận
            }
            long lessonId = ((Number) q.get("lesson_id")).longValue();
            String prompt = (String) q.get("prompt");
            String optA = Objects.toString(q.get("option_a"), "");
            String optB = Objects.toString(q.get("option_b"), "");
            String optC = Objects.toString(q.get("option_c"), "");
            String optD = Objects.toString(q.get("option_d"), "");
            String correct = Objects.toString(q.get("correct_option"), "A");
            String explanation = Objects.toString(q.get("explanation"), "");

            var key = new GeneratedKeyHolder();
            db.update(c -> {
                var ps = c.prepareStatement("insert into questions(lesson_id,prompt,option_a,option_b,option_c,option_d,correct_option,explanation,question_type,accepted_answer,published) values(?,?,?,?,?,?,?,?,?,?,true)", Statement.RETURN_GENERATED_KEYS);
                ps.setLong(1, lessonId);
                ps.setString(2, prompt);
                ps.setString(3, optA);
                ps.setString(4, optB);
                ps.setString(5, optC);
                ps.setString(6, optD);
                ps.setString(7, correct);
                ps.setString(8, explanation);
                ps.setString(9, "MCQ");
                ps.setString(10, null);
                return ps;
            }, key);
            long newId = Objects.requireNonNull(key.getKey()).longValue();
            db.update("insert into audit_logs(actor_id,action,target_type,target_id,detail) values(?,?,?,?,?)", u.id, "QUESTION_CREATE", "QUESTION", newId, prompt);
            promoted++;
        }
        if (promoted == 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "ONLY_MCQ_FOR_COMMON", "Chỉ câu hỏi Trắc nghiệm (MCQ) mới có thể đưa vào ngân hàng câu hỏi chung cho Hành tinh chính và PvP. Các dạng Điền từ, Sửa lỗi, Viết lại câu chỉ dùng cho Bài tập lớp và Kiểm tra trực tiếp.");
        }
        return Map.of("promotedCount", promoted);
    }
    @PostMapping("/to-live-exam") @Transactional public Map<String,Object> toLiveExam(Authentication a, @Valid @RequestBody LiveExamInput body) {
        User u = teacher(a);
        var owners = db.queryForList("select teacher_id from classrooms where id=?", Long.class, body.classId());
        if (owners.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "CLASS_NOT_FOUND", "Lớp học không tồn tại");
        if (!owners.getFirst().equals(u.id)) throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Bạn không phải giáo viên quản trị lớp này");

        var listNode = json.createArrayNode();
        for (Long qId : body.questionIds()) {
            var rows = db.queryForList("select * from questions where id=? and owner_id=? and deleted=false", qId, u.id);
            if (rows.isEmpty()) continue;
            var q = rows.getFirst();
            var qNode = listNode.addObject();
            qNode.put("id", "q" + qId);
            qNode.put("prompt", (String) q.get("prompt"));
            String qType = Objects.toString(q.get("question_type"), "MCQ");
            qNode.put("questionType", qType);
            if ("FILL_BLANK".equals(qType) || "ERROR_CORRECTION".equals(qType) || "REWRITE".equals(qType)) {
                qNode.put("acceptedAnswer", Objects.toString(q.get("accepted_answer"), "").trim());
                qNode.putArray("options");
            } else {
                var opts = qNode.putArray("options");
                opts.add(Objects.toString(q.get("option_a"), ""));
                opts.add(Objects.toString(q.get("option_b"), ""));
                opts.add(Objects.toString(q.get("option_c"), ""));
                opts.add(Objects.toString(q.get("option_d"), ""));
                String correct = Objects.toString(q.get("correct_option"), "A");
                int correctIndex = Math.max(0, "ABCD".indexOf(correct.toUpperCase()));
                qNode.put("correct", correctIndex);
            }
            if (listNode.size() >= 30) break;
        }
        if (listNode.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "NO_VALID_QUESTIONS", "Không tìm thấy câu hỏi hợp lệ để tạo bài kiểm tra");

        var key = new GeneratedKeyHolder();
        db.update(c -> {
            var ps = c.prepareStatement("insert into class_exams(class_id,title,questions_json,ends_at) values(?,?,?,?)", Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, body.classId());
            ps.setString(2, body.title().trim());
            ps.setString(3, listNode.toString());
            ps.setTimestamp(4, Timestamp.from(body.endsAt()));
            return ps;
        }, key);
        long examId = Objects.requireNonNull(key.getKey()).longValue();
        db.update("insert into audit_logs(actor_id,action,target_type,target_id,detail) values(?,?,?,?,?)", u.id, "LIVE_EXAM_CREATE", "CLASS_EXAM", examId, body.title().trim());
        return Map.of("examId", examId, "questionsCount", listNode.size(), "classId", body.classId());
    }
    @PutMapping("/{id}") @Transactional public Map<String,Object> update(Authentication a,@PathVariable long id,@Valid @RequestBody Body body){
        User u=teacher(a);own(id,u);lesson(body.lessonId());String type=type(body);
        db.update("update questions set lesson_id=?,prompt=?,option_a=?,option_b=?,option_c=?,option_d=?,correct_option=?,explanation=?,question_type=?,accepted_answer=? where id=?",body.lessonId(),body.prompt().trim(),Objects.toString(body.optionA(),"").trim(),Objects.toString(body.optionB(),"").trim(),Objects.toString(body.optionC(),"").trim(),Objects.toString(body.optionD(),"").trim(),type.equals("MCQ")?body.correctOption():"A",body.explanation().trim(),type,type.equals("MCQ")?null:body.acceptedAnswer().trim(),id);
        db.update("insert into audit_logs(actor_id,action,target_type,target_id,detail) values(?,?,?,?,?)",u.id,"PRIVATE_QUESTION_EDIT","QUESTION",id,body.prompt());
        return view(id);
    }
    @PatchMapping("/{id}/active") @Transactional public Map<String,Object> active(Authentication a,@PathVariable long id,@RequestBody Map<String,Boolean> body){
        User u=teacher(a);own(id,u);
        if(!body.containsKey("active")||body.get("active")==null) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_ACTIVE","Thiếu trạng thái câu hỏi");
        db.update("update questions set teacher_active=? where id=?",body.get("active"),id);
        db.update("insert into audit_logs(actor_id,action,target_type,target_id,detail) values(?,?,?,?,?)",u.id,"PRIVATE_QUESTION_ACTIVE","QUESTION",id,"active="+body.get("active"));
        return view(id);
    }
}
