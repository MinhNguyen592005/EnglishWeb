package com.grammarquest.controller;

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
import java.util.*;
import java.util.stream.Stream;

@RestController @RequestMapping("/api/v1/teacher/questions")
public class TeacherQuestionController {
    private final JdbcTemplate db;
    private final UserRepository users;
    public TeacherQuestionController(JdbcTemplate db,UserRepository users){this.db=db;this.users=users;}
    public record Body(@NotNull Long lessonId,@NotBlank @Size(max=500) String prompt,
                       @Size(max=255) String optionA,@Size(max=255) String optionB,
                       @Size(max=255) String optionC,@Size(max=255) String optionD,
                       String correctOption,@NotBlank String explanation,
                       String questionType,@Size(max=255) String acceptedAnswer) {}
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
        } else if(body.acceptedAnswer()==null||body.acceptedAnswer().isBlank())
            throw new ApiException(HttpStatus.BAD_REQUEST,"ANSWER_REQUIRED","Cần nhập đáp án mẫu để chấm tự động");
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
