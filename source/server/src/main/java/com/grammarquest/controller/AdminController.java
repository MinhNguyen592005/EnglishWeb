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
import java.sql.Timestamp;
import java.sql.Statement;
import java.time.Instant;
import java.util.*;

@RestController @RequestMapping("/api/v1/admin")
public class AdminController {
    private final JdbcTemplate db;
    private final UserRepository users;
    public AdminController(JdbcTemplate db, UserRepository users) { this.db=db; this.users=users; }
    public record RoleChange(@NotBlank String role) {}
    public record LockChange(boolean locked) {}
    public record Decision(@NotBlank String action, @Size(max=500) String note, String source) {}
    public record Publish(boolean published) {}
    public record LessonInput(@NotBlank @Size(max=80) String topicSlug, @Min(0) int ordinalNo,
                              @NotBlank @Size(max=160) String title, @NotBlank @Size(max=255) String summary,
                              @NotBlank String theory, @Pattern(regexp="BEGINNER|INTERMEDIATE|ADVANCED") String difficulty) {}
    public record NewQuestion(@NotNull Long lessonId, @NotBlank @Size(max=500) String prompt,
                              @NotBlank @Size(max=255) String optionA, @NotBlank @Size(max=255) String optionB,
                              @NotBlank @Size(max=255) String optionC, @NotBlank @Size(max=255) String optionD,
                              @NotBlank @Pattern(regexp="[ABCD]") String correctOption, @NotBlank String explanation) {}
    public record EditQuestion(@NotBlank @Size(max=500) String prompt,
                               @NotBlank @Size(max=255) String optionA,
                               @NotBlank @Size(max=255) String optionB,
                               @NotBlank @Size(max=255) String optionC,
                               @NotBlank @Size(max=255) String optionD,
                               @Pattern(regexp="[ABCD]") String correctOption,
                               @NotBlank String explanation) {}
    private User admin(Authentication auth) {
        User u=users.findByUsernameIgnoreCase(auth.getName()).orElseThrow();
        if(u.locked||!u.role.equals("ADMIN")) throw new ApiException(HttpStatus.FORBIDDEN,"ADMIN_ONLY","Chỉ quản trị viên được phép thực hiện");
        return u;
    }
    private User target(long id) { return users.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"USER_NOT_FOUND","Không tìm thấy tài khoản")); }
    private void audit(User actor,String action,String type,long id,String detail) {
        db.update("insert into audit_logs(actor_id,action,target_type,target_id,detail) values(?,?,?,?,?)",actor.id,action,type,id,detail);
    }
    private void ensureTopic(String slug,String title) {
        if(db.queryForObject("select count(*) from topics where slug=?",Integer.class,slug)==0)
            db.update("insert into topics(slug,title,description,outcome,sort_order,planet_style,published) values(?,?,?, ?, (select coalesce(max(t.sort_order),0)+1 from (select sort_order from topics) t),'aqua',true)",
                slug,title,"Khám phá kiến thức của chủ đề này.","Hoàn thành các bài học và vượt boss để tiến lên.");
    }
    private void protectLastAdmin(User target) {
        if(target.role.equals("ADMIN")&&db.queryForList("select id from users where role='ADMIN' and locked=false order by id for update",Long.class).size()<=1)
            throw new ApiException(HttpStatus.CONFLICT,"LAST_ADMIN","Không thể khóa hoặc hạ quyền admin đang hoạt động cuối cùng");
    }
    @GetMapping("/overview") public Map<String,Object> overview(Authentication auth) {
        admin(auth);
        return Map.of("users",db.queryForObject("select count(*) from users",Integer.class),
                      "classes",db.queryForObject("select count(*) from classrooms",Integer.class),
                      "openReports",db.queryForObject("select (select count(*) from reports where status='OPEN')+(select count(*) from arena_reports where status='OPEN')",Integer.class),
                      "questions",db.queryForObject("select count(*) from questions",Integer.class));
    }
    @GetMapping("/users") public List<Map<String,Object>> listUsers(Authentication auth) {
        admin(auth);
        return db.queryForList("select id,username,display_name as displayName,role,locked,total_xp as totalXp,created_at as createdAt from users order by id desc limit 200");
    }
    @PatchMapping("/users/{id}/role") @Transactional public Map<String,Object> role(Authentication auth,@PathVariable long id,@Valid @RequestBody RoleChange body) {
        User actor=admin(auth), target=target(id);
        if(!Set.of("LEARNER","TEACHER","ADMIN").contains(body.role())) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_ROLE","Vai trò không hợp lệ");
        if(target.role.equals("ADMIN")&&!body.role().equals("ADMIN")) protectLastAdmin(target);
        String before=target.role; target.role=body.role(); users.save(target);
        audit(actor,"ROLE_CHANGE","USER",id,before+" -> "+body.role());
        return Map.of("id",id,"role",target.role);
    }
    @PatchMapping("/users/{id}/lock") @Transactional public Map<String,Object> lock(Authentication auth,@PathVariable long id,@Valid @RequestBody LockChange body) {
        User actor=admin(auth), target=target(id);
        if(body.locked()&&!target.locked) protectLastAdmin(target);
        target.locked=body.locked(); users.save(target);
        audit(actor,body.locked()?"LOCK":"UNLOCK","USER",id,"");
        return Map.of("id",id,"locked",target.locked);
    }
    @GetMapping("/reports") public List<Map<String,Object>> reports(Authentication auth) {
        admin(auth);
        return db.queryForList("select * from (select 'CLASS' as source,r.id,r.reason,r.status,r.decision,r.created_at as createdAt,m.body as messageBody,m.user_id as accusedId,u.display_name as accusedName,r.reporter_id as reporterId from reports r join class_messages m on m.id=r.message_id join users u on u.id=m.user_id union all select 'ARENA' as source,r.id,r.reason,r.status,r.decision,r.created_at as createdAt,m.body as messageBody,m.user_id as accusedId,u.display_name as accusedName,r.reporter_id as reporterId from arena_reports r join arena_messages m on m.id=r.message_id join users u on u.id=m.user_id) all_reports order by createdAt desc limit 200");
    }
    @PostMapping("/reports/{id}/decision") @Transactional public Map<String,Object> decide(Authentication auth,@PathVariable long id,@Valid @RequestBody Decision body) {
        User actor=admin(auth);
        if(!Set.of("DISMISS","WARN","MUTE_24H","LOCK").contains(body.action())) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_ACTION","Hành động không hợp lệ");
        boolean arena="ARENA".equals(body.source());
        if(body.source()!=null&&!Set.of("ARENA","CLASS").contains(body.source())) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_SOURCE","Nguồn báo cáo không hợp lệ");
        String table=arena?"arena_reports":"reports", messages=arena?"arena_messages":"class_messages";
        var rows=db.queryForList("select r.status,m.user_id as accusedId from "+table+" r join "+messages+" m on m.id=r.message_id where r.id=? for update",id);
        if(rows.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND,"REPORT_NOT_FOUND","Không tìm thấy báo cáo");
        if(!"OPEN".equals(rows.getFirst().get("status"))) throw new ApiException(HttpStatus.CONFLICT,"REPORT_CLOSED","Báo cáo đã được xử lý");
        long accused=((Number)rows.getFirst().get("accusedId")).longValue();
        if(body.action().equals("MUTE_24H")) db.update("insert into chat_mutes(user_id,expires_at) values(?,?) on duplicate key update expires_at=values(expires_at)",accused,Timestamp.from(Instant.now().plusSeconds(86400)));
        if(body.action().equals("LOCK")) {
            User target=target(accused);
            if(!target.locked) protectLastAdmin(target);
            target.locked=true; users.save(target);
        }
        db.update("update "+table+" set status='RESOLVED',decision=?,decided_by=? where id=?",body.action()+": "+Objects.toString(body.note(),""),actor.id,id);
        audit(actor,"REPORT_"+body.action(),arena?"ARENA_REPORT":"REPORT",id,Objects.toString(body.note(),""));
        return Map.of("id",id,"status","RESOLVED");
    }
    @GetMapping("/content") public Map<String,Object> content(Authentication auth) {
        admin(auth);
        return Map.of("lessons",db.queryForList("select id,topic_slug as topicSlug,title,summary,theory,difficulty,published,ordinal_no as ordinalNo from lessons order by topic_slug,ordinal_no"),
                      "questions",db.queryForList("select id,lesson_id as lessonId,prompt,option_a as optionA,option_b as optionB,option_c as optionC,option_d as optionD,correct_option as correctOption,explanation,published from questions where owner_id is null order by id desc limit 200"));
    }
    @PostMapping("/lessons") @Transactional public Map<String,Object> createLesson(Authentication auth,@Valid @RequestBody LessonInput body) {
        User actor=admin(auth);
        if(!body.topicSlug().matches("[a-z0-9-]+")) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_TOPIC","Mã chủ đề chỉ gồm chữ thường, số và dấu gạch nối");
        ensureTopic(body.topicSlug(),body.title());
        if(db.queryForObject("select count(*) from lessons where topic_slug=? and ordinal_no=?",Integer.class,body.topicSlug(),body.ordinalNo())>0)
            throw new ApiException(HttpStatus.CONFLICT,"LESSON_ORDER_EXISTS","Thứ tự bài đã tồn tại trong chủ đề này");
        var key=new GeneratedKeyHolder();
        db.update(c->{var ps=c.prepareStatement("insert into lessons(topic_slug,ordinal_no,title,summary,theory,difficulty,published) values(?,?,?,?,?,?,false)",Statement.RETURN_GENERATED_KEYS);ps.setString(1,body.topicSlug());ps.setInt(2,body.ordinalNo());ps.setString(3,body.title());ps.setString(4,body.summary());ps.setString(5,body.theory());ps.setString(6,Objects.toString(body.difficulty(),"BEGINNER"));return ps;},key);
        long id=Objects.requireNonNull(key.getKey()).longValue();
        audit(actor,"LESSON_CREATE","LESSON",id,body.title());
        return Map.of("id",id);
    }
    @PutMapping("/lessons/{id}") @Transactional public Map<String,Object> editLesson(Authentication auth,@PathVariable long id,@Valid @RequestBody LessonInput body) {
        User actor=admin(auth);
        if(!body.topicSlug().matches("[a-z0-9-]+")) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_TOPIC","Mã chủ đề không hợp lệ");
        ensureTopic(body.topicSlug(),body.title());
        if(db.queryForObject("select count(*) from lessons where topic_slug=? and ordinal_no=? and id<>?",Integer.class,body.topicSlug(),body.ordinalNo(),id)>0)
            throw new ApiException(HttpStatus.CONFLICT,"LESSON_ORDER_EXISTS","Thứ tự bài đã tồn tại trong chủ đề này");
        if(db.update("update lessons set topic_slug=?,ordinal_no=?,title=?,summary=?,theory=?,difficulty=coalesce(?,difficulty) where id=?",body.topicSlug(),body.ordinalNo(),body.title(),body.summary(),body.theory(),body.difficulty(),id)==0)
            throw new ApiException(HttpStatus.NOT_FOUND,"LESSON_NOT_FOUND","Không tìm thấy bài học");
        audit(actor,"LESSON_EDIT","LESSON",id,body.title());
        return Map.of("id",id);
    }
    @PostMapping("/questions") @Transactional public Map<String,Object> createQuestion(Authentication auth,@Valid @RequestBody NewQuestion body) {
        User actor=admin(auth);
        if(db.queryForObject("select count(*) from lessons where id=?",Integer.class,body.lessonId())==0)
            throw new ApiException(HttpStatus.NOT_FOUND,"LESSON_NOT_FOUND","Không tìm thấy bài học");
        var key=new GeneratedKeyHolder();
        db.update(c->{var ps=c.prepareStatement("insert into questions(lesson_id,prompt,option_a,option_b,option_c,option_d,correct_option,explanation,published) values(?,?,?,?,?,?,?,?,false)",Statement.RETURN_GENERATED_KEYS);ps.setLong(1,body.lessonId());ps.setString(2,body.prompt());ps.setString(3,body.optionA());ps.setString(4,body.optionB());ps.setString(5,body.optionC());ps.setString(6,body.optionD());ps.setString(7,body.correctOption());ps.setString(8,body.explanation());return ps;},key);
        long id=Objects.requireNonNull(key.getKey()).longValue();
        audit(actor,"QUESTION_CREATE","QUESTION",id,body.prompt());
        return Map.of("id",id);
    }
    @PatchMapping("/lessons/{id}/publication") @Transactional public Map<String,Object> lessonPublication(Authentication auth,@PathVariable long id,@Valid @RequestBody Publish body) {
        User actor=admin(auth);
        if(db.queryForObject("select count(*) from lessons where id=?",Integer.class,id)==0)
            throw new ApiException(HttpStatus.NOT_FOUND,"LESSON_NOT_FOUND","Không tìm thấy bài học");
        if(body.published()) {
            Integer available=db.queryForObject("select count(*) from questions where lesson_id=? and published=true and owner_id is null",Integer.class,id);
            if(available==null||available<10) throw new ApiException(HttpStatus.CONFLICT,"QUESTION_BANK_INCOMPLETE","Cần ít nhất 10 câu hỏi chung đã xuất bản trước khi mở bài học");
        }
        if(db.update("update lessons set published=? where id=?",body.published(),id)==0) throw new ApiException(HttpStatus.NOT_FOUND,"LESSON_NOT_FOUND","Không tìm thấy bài học");
        audit(actor,"LESSON_PUBLICATION","LESSON",id,Boolean.toString(body.published()));
        return Map.of("id",id,"published",body.published());
    }
    @PatchMapping("/questions/{id}/publication") @Transactional public Map<String,Object> questionPublication(Authentication auth,@PathVariable long id,@Valid @RequestBody Publish body) {
        User actor=admin(auth);
        if(db.queryForObject("select count(*) from questions where id=? and owner_id is null",Integer.class,id)==0)
            throw new ApiException(HttpStatus.NOT_FOUND,"QUESTION_NOT_FOUND","Không tìm thấy câu hỏi chung");
        if(!body.published()) {
            Integer publishedLesson=db.queryForObject("select count(*) from questions q join lessons l on l.id=q.lesson_id where q.id=? and q.published=true and l.published=true",Integer.class,id);
            if(publishedLesson!=null&&publishedLesson>0) {
                Integer remaining=db.queryForObject("select count(*) from questions where lesson_id=(select lesson_id from questions where id=?) and published=true and owner_id is null",Integer.class,id);
                if(remaining!=null&&remaining<=10) throw new ApiException(HttpStatus.CONFLICT,"QUESTION_BANK_INCOMPLETE","Ẩn bài học trước khi giảm số câu hỏi xuống dưới 10");
            }
        }
        if(db.update("update questions set published=? where id=? and owner_id is null",body.published(),id)==0) throw new ApiException(HttpStatus.NOT_FOUND,"QUESTION_NOT_FOUND","Không tìm thấy câu hỏi");
        audit(actor,"QUESTION_PUBLICATION","QUESTION",id,Boolean.toString(body.published()));
        return Map.of("id",id,"published",body.published());
    }
    @PutMapping("/questions/{id}") @Transactional public Map<String,Object> editQuestion(Authentication auth,@PathVariable long id,@Valid @RequestBody EditQuestion body) {
        User actor=admin(auth);
        if(db.update("update questions set prompt=?,option_a=?,option_b=?,option_c=?,option_d=?,correct_option=?,explanation=? where id=? and owner_id is null",
            body.prompt(),body.optionA(),body.optionB(),body.optionC(),body.optionD(),body.correctOption(),body.explanation(),id)==0)
            throw new ApiException(HttpStatus.NOT_FOUND,"QUESTION_NOT_FOUND","Không tìm thấy câu hỏi");
        audit(actor,"QUESTION_EDIT","QUESTION",id,"Updated question content");
        return Map.of("id",id,"updated",true);
    }
    @GetMapping("/audit") public List<Map<String,Object>> audit(Authentication auth) {
        admin(auth);
        return db.queryForList("select a.id,u.username as actor,a.action,a.target_type as targetType,a.target_id as targetId,a.detail,a.created_at as createdAt from audit_logs a join users u on u.id=a.actor_id order by a.id desc limit 100");
    }
}
