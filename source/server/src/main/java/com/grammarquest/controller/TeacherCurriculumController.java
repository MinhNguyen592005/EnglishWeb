package com.grammarquest.controller;

import com.grammarquest.entity.User;
import com.grammarquest.repository.UserRepository;
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

@RestController @RequestMapping("/api/v1/teacher/curriculum")
public class TeacherCurriculumController {
    @org.springframework.beans.factory.annotation.Autowired
    private org.springframework.context.ApplicationEventPublisher events;
    private final JdbcTemplate db;
    private final UserRepository users;
    public TeacherCurriculumController(JdbcTemplate db, UserRepository users) { this.db=db; this.users=users; }

    public record TopicInput(@NotBlank @Size(max=80) @Pattern(regexp="[a-z0-9-]+") String slug,
        @NotBlank @Size(max=160) String title, @NotBlank @Size(max=255) String description,
        @NotBlank @Size(max=255) String outcome, @Min(1) int sortOrder,
        @NotBlank @Pattern(regexp="aqua|violet|coral|gold|mint") String planetStyle) {}
    public record LessonInput(@NotBlank @Size(max=80) @Pattern(regexp="[a-z0-9-]+") String topicSlug, @Min(0) int ordinalNo,
        @NotBlank @Size(max=160) String title, @NotBlank @Size(max=255) String summary,
        @NotBlank String theory, @NotBlank @Pattern(regexp="BEGINNER|INTERMEDIATE|ADVANCED") String difficulty) {}
    public record QuestionInput(@NotNull Long lessonId, @NotBlank @Size(max=500) String prompt,
        @NotBlank @Size(max=255) String optionA, @NotBlank @Size(max=255) String optionB,
        @NotBlank @Size(max=255) String optionC, @NotBlank @Size(max=255) String optionD,
        @NotBlank @Pattern(regexp="[ABCD]") String correctOption, @NotBlank String explanation) {}
    public record Publish(boolean published) {}

    private User teacher(Authentication auth) {
        User user=users.findByUsernameIgnoreCase(auth.getName()).orElseThrow();
        if(user.locked || !user.role.equals("TEACHER"))
            throw new ApiException(HttpStatus.FORBIDDEN,"TEACHER_ONLY","Chỉ giáo viên được chỉnh sửa lộ trình");
        return user;
    }
    private void audit(User actor,String action,String type,long id,String detail) {
        db.update("insert into audit_logs(actor_id,action,target_type,target_id,detail) values(?,?,?,?,?)",actor.id,action,type,id,detail);
        if(events!=null && Set.of("TOPIC","LESSON","QUESTION").contains(type)) events.publishEvent(new com.grammarquest.service.CurriculumChanged());
    }
    private void requireTopic(String slug) {
        if(db.queryForObject("select count(*) from topics where slug=?",Integer.class,slug)==0)
            throw new ApiException(HttpStatus.NOT_FOUND,"TOPIC_NOT_FOUND","Không tìm thấy hành tinh chủ đề");
    }
    private void requireLesson(long id) {
        if(db.queryForObject("select count(*) from lessons where id=? and deleted=false",Integer.class,id)==0)
            throw new ApiException(HttpStatus.NOT_FOUND,"LESSON_NOT_FOUND","Không tìm thấy bài học");
    }
    private void requireQuestion(long id) {
        if(db.queryForObject("select count(*) from questions where id=? and deleted=false and owner_id is null",Integer.class,id)==0)
            throw new ApiException(HttpStatus.NOT_FOUND,"QUESTION_NOT_FOUND","Không tìm thấy câu hỏi chung");
    }
    @GetMapping public Map<String,Object> list(Authentication auth) {
        teacher(auth);
        return Map.of(
            "topics",db.queryForList("select slug,title,description,outcome,sort_order as sortOrder,planet_style as planetStyle,published from topics order by sort_order,slug"),
            "lessons",db.queryForList("select id,topic_slug as topicSlug,ordinal_no as ordinalNo,title,summary,theory,difficulty,published from lessons where deleted=false order by topic_slug,ordinal_no"),
            "questions",db.queryForList("select id,lesson_id as lessonId,prompt,option_a as optionA,option_b as optionB,option_c as optionC,option_d as optionD,correct_option as correctOption,explanation,published from questions where deleted=false and owner_id is null order by lesson_id,id")
        );
    }
    @PostMapping("/topics") @Transactional public Map<String,Object> createTopic(Authentication auth,@Valid @RequestBody TopicInput body) {
        User actor=teacher(auth);
        if(db.queryForObject("select count(*) from topics where slug=?",Integer.class,body.slug())>0)
            throw new ApiException(HttpStatus.CONFLICT,"TOPIC_EXISTS","Mã chủ đề đã tồn tại");
        db.update("insert into topics(slug,title,description,outcome,sort_order,planet_style,published) values(?,?,?,?,?,?,false)",
            body.slug(),body.title(),body.description(),body.outcome(),body.sortOrder(),body.planetStyle());
        audit(actor,"TOPIC_CREATE","TOPIC",0,body.slug());
        return Map.of("slug",body.slug());
    }
    @PutMapping("/topics/{slug}") @Transactional public Map<String,Object> editTopic(Authentication auth,@PathVariable String slug,@Valid @RequestBody TopicInput body) {
        User actor=teacher(auth); requireTopic(slug);
        if(!slug.equals(body.slug())) throw new ApiException(HttpStatus.BAD_REQUEST,"TOPIC_SLUG_FIXED","Không thể đổi mã chủ đề đã tạo");
        db.update("update topics set title=?,description=?,outcome=?,sort_order=?,planet_style=? where slug=?",
            body.title(),body.description(),body.outcome(),body.sortOrder(),body.planetStyle(),slug);
        audit(actor,"TOPIC_EDIT","TOPIC",0,slug);
        return Map.of("slug",slug);
    }
    @PatchMapping("/topics/{slug}/publication") @Transactional public Map<String,Object> publishTopic(Authentication auth,@PathVariable String slug,@RequestBody Publish body) {
        User actor=teacher(auth); requireTopic(slug);
        if(body.published() && db.queryForObject("select count(*) from lessons where topic_slug=? and published=true",Integer.class,slug)==0)
            throw new ApiException(HttpStatus.CONFLICT,"TOPIC_EMPTY","Hãy xuất bản ít nhất một bài học trước khi mở hành tinh");
        db.update("update topics set published=? where slug=?",body.published(),slug);
        audit(actor,"TOPIC_PUBLICATION","TOPIC",0,slug+": "+body.published());
        return Map.of("slug",slug,"published",body.published());
    }
    @PostMapping("/lessons") @Transactional public Map<String,Object> createLesson(Authentication auth,@Valid @RequestBody LessonInput body) {
        User actor=teacher(auth); requireTopic(body.topicSlug());
        if(db.queryForObject("select count(*) from lessons where topic_slug=? and ordinal_no=?",Integer.class,body.topicSlug(),body.ordinalNo())>0)
            throw new ApiException(HttpStatus.CONFLICT,"LESSON_ORDER_EXISTS","Thứ tự bài đã tồn tại trong chủ đề");
        var key=new GeneratedKeyHolder();
        db.update(c->{var ps=c.prepareStatement("insert into lessons(topic_slug,ordinal_no,title,summary,theory,difficulty,published) values(?,?,?,?,?,?,false)",Statement.RETURN_GENERATED_KEYS);
            ps.setString(1,body.topicSlug());ps.setInt(2,body.ordinalNo());ps.setString(3,body.title());ps.setString(4,body.summary());ps.setString(5,body.theory());ps.setString(6,body.difficulty());return ps;},key);
        long id=Objects.requireNonNull(key.getKey()).longValue(); audit(actor,"LESSON_CREATE","LESSON",id,body.title());
        return Map.of("id",id);
    }
    @PutMapping("/lessons/{id}") @Transactional public Map<String,Object> editLesson(Authentication auth,@PathVariable long id,@Valid @RequestBody LessonInput body) {
        User actor=teacher(auth);requireLesson(id);requireTopic(body.topicSlug());
        if(db.queryForObject("select count(*) from lessons where topic_slug=? and ordinal_no=? and id<>?",Integer.class,body.topicSlug(),body.ordinalNo(),id)>0)
            throw new ApiException(HttpStatus.CONFLICT,"LESSON_ORDER_EXISTS","Thứ tự bài đã tồn tại trong chủ đề");
        db.update("update lessons set topic_slug=?,ordinal_no=?,title=?,summary=?,theory=?,difficulty=? where id=?",
            body.topicSlug(),body.ordinalNo(),body.title(),body.summary(),body.theory(),body.difficulty(),id);
        audit(actor,"LESSON_EDIT","LESSON",id,body.title());return Map.of("id",id);
    }
    @PatchMapping("/lessons/{id}/publication") @Transactional public Map<String,Object> publishLesson(Authentication auth,@PathVariable long id,@RequestBody Publish body) {
        User actor=teacher(auth);requireLesson(id);
        if(body.published() && db.queryForObject("select count(*) from questions where lesson_id=? and published=true and owner_id is null",Integer.class,id)<10)
            throw new ApiException(HttpStatus.CONFLICT,"QUESTION_BANK_INCOMPLETE","Cần ít nhất 10 câu hỏi chung đã xuất bản trước khi mở bài học");
        db.update("update lessons set published=? where id=?",body.published(),id);
        audit(actor,"LESSON_PUBLICATION","LESSON",id,Boolean.toString(body.published()));return Map.of("id",id,"published",body.published());
    }
    @PostMapping("/questions") @Transactional public Map<String,Object> createQuestion(Authentication auth,@Valid @RequestBody QuestionInput body) {
        User actor=teacher(auth);requireLesson(body.lessonId());
        var key=new GeneratedKeyHolder();
        db.update(c->{var ps=c.prepareStatement("insert into questions(lesson_id,prompt,option_a,option_b,option_c,option_d,correct_option,explanation,published) values(?,?,?,?,?,?,?,?,false)",Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1,body.lessonId());ps.setString(2,body.prompt());ps.setString(3,body.optionA());ps.setString(4,body.optionB());ps.setString(5,body.optionC());ps.setString(6,body.optionD());ps.setString(7,body.correctOption());ps.setString(8,body.explanation());return ps;},key);
        long id=Objects.requireNonNull(key.getKey()).longValue();audit(actor,"QUESTION_CREATE","QUESTION",id,body.prompt());return Map.of("id",id);
    }
    @PutMapping("/questions/{id}") @Transactional public Map<String,Object> editQuestion(Authentication auth,@PathVariable long id,@Valid @RequestBody QuestionInput body) {
        User actor=teacher(auth);requireQuestion(id);requireLesson(body.lessonId());
        var original=db.queryForMap("select lesson_id,published from questions where id=?",id);
        if(Boolean.TRUE.equals(original.get("published")) && ((Number)original.get("lesson_id")).longValue()!=body.lessonId())
            throw new ApiException(HttpStatus.CONFLICT,"PUBLISHED_QUESTION_MOVE","Ẩn câu hỏi trước khi chuyển sang bài học khác");
        db.update("update questions set lesson_id=?,prompt=?,option_a=?,option_b=?,option_c=?,option_d=?,correct_option=?,explanation=? where id=? and owner_id is null",
            body.lessonId(),body.prompt(),body.optionA(),body.optionB(),body.optionC(),body.optionD(),body.correctOption(),body.explanation(),id);
        audit(actor,"QUESTION_EDIT","QUESTION",id,body.prompt());return Map.of("id",id);
    }
    @PatchMapping("/questions/{id}/publication") @Transactional public Map<String,Object> publishQuestion(Authentication auth,@PathVariable long id,@RequestBody Publish body) {
        User actor=teacher(auth);requireQuestion(id);
        if(!body.published() && db.queryForObject("select count(*) from questions q join lessons l on l.id=q.lesson_id where q.id=? and l.published=true and q.published=true",Integer.class,id)>0) {
            int count=db.queryForObject("select count(*) from questions where lesson_id=(select lesson_id from questions where id=?) and published=true and owner_id is null",Integer.class,id);
            if(count<=10) throw new ApiException(HttpStatus.CONFLICT,"QUESTION_BANK_INCOMPLETE","Ẩn bài học trước khi giảm số câu hỏi xuống dưới 10");
        }
        db.update("update questions set published=? where id=? and owner_id is null",body.published(),id);
        audit(actor,"QUESTION_PUBLICATION","QUESTION",id,Boolean.toString(body.published()));return Map.of("id",id,"published",body.published());
    }
}
