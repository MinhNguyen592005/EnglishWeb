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
    @org.springframework.beans.factory.annotation.Autowired
    private org.springframework.context.ApplicationEventPublisher events;
    private final JdbcTemplate db;
    private final UserRepository users;
    public AdminController(JdbcTemplate db, UserRepository users) { this.db=db; this.users=users; }
    public record RoleChange(@NotBlank String role) {}
    public record LockChange(@NotNull Boolean locked) {}
    public record Decision(@NotBlank String action, @Size(max=500) String note, @NotBlank @Pattern(regexp="CLASS|ARENA|USER") String source) {}
    public record Publish(@NotNull Boolean published) {}
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
                               @NotBlank @Pattern(regexp="[ABCD]") String correctOption,
                               @NotBlank String explanation) {}
    private User admin(Authentication auth) {
        User u=users.findByUsernameIgnoreCase(auth.getName()).orElseThrow();
        if(u.locked||!u.role.equals("ADMIN")) throw new ApiException(HttpStatus.FORBIDDEN,"ADMIN_ONLY","Chỉ quản trị viên được phép thực hiện");
        return u;
    }
    private User target(long id) { return users.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"USER_NOT_FOUND","Không tìm thấy tài khoản")); }
    private void audit(User actor,String action,String type,long id,String detail) {
        db.update("insert into audit_logs(actor_id,action,target_type,target_id,detail) values(?,?,?,?,?)",actor.id,action,type,id,detail);
        if(events!=null && Set.of("TOPIC","LESSON","QUESTION").contains(type)) events.publishEvent(new com.grammarquest.service.CurriculumChanged());
    }
    private void hideIncompleteLesson(long lessonId) {
        db.update("update lessons set published=false where id=? and published=true and (select count(*) from questions where lesson_id=? and owner_id is null and published=true and deleted=false and admin_blocked=false and (question_type is null or question_type='MCQ'))<10",lessonId,lessonId);
    }
    private void ensureTopic(String slug,String title) {
        if(db.queryForObject("select count(*) from topics where slug=?",Integer.class,slug)==0)
            db.update("insert into topics(slug,title,description,outcome,sort_order,planet_style,published) values(?,?,?, ?, (select coalesce(max(t.sort_order),0)+1 from (select sort_order from topics) t),'aqua',true)",
                slug,title,"Khám phá kiến thức của chủ đề này.","Hoàn thành các bài học và vượt boss để tiến lên.");
    }
    private void protectLastAdmin(User target) {
        if(target.role.equals("ADMIN")&&!target.locked&&db.queryForList("select id from users where role='ADMIN' and locked=false order by id for update",Long.class).size()<=1)
            throw new ApiException(HttpStatus.CONFLICT,"LAST_ADMIN","Không thể khóa hoặc hạ quyền admin đang hoạt động cuối cùng");
    }
    @GetMapping("/overview") public Map<String,Object> overview(Authentication auth) {
        admin(auth);
        return Map.of("users",db.queryForObject("select count(*) from users",Integer.class),
                      "classes",db.queryForObject("select count(*) from classrooms",Integer.class),
                      "openReports",db.queryForObject("select (select count(*) from reports where status='OPEN')+(select count(*) from arena_reports where status='OPEN')+(select count(*) from learner_reports where status='OPEN')",Integer.class),
                      "questions",db.queryForObject("select count(*) from questions",Integer.class));
    }
    @GetMapping("/users") public List<Map<String,Object>> listUsers(Authentication auth) {
        admin(auth);
        return db.queryForList("select id,username,display_name as displayName,role,locked,total_xp as totalXp,created_at as createdAt from users order by id desc limit 200");
    }
    @GetMapping("/business") public Map<String,Object> business(Authentication auth) {
        admin(auth);
        var end=db.queryForObject("select current_date",java.sql.Date.class).toLocalDate();
        var days=new ArrayList<Map<String,Object>>();
        for(int i=13;i>=0;i--) {
            var date=end.minusDays(i);
            var from=Timestamp.valueOf(date.atStartOfDay());
            var to=Timestamp.valueOf(date.plusDays(1).atStartOfDay());
            days.add(Map.of("date",date.toString(),
                "registrations",db.queryForObject("select count(*) from users where created_at>=? and created_at<?",Integer.class,from,to),
                "classes",db.queryForObject("select count(*) from classrooms where created_at>=? and created_at<?",Integer.class,from,to),
                "matches",db.queryForObject("select count(*) from arena_rooms where status='FINISHED' and created_at>=? and created_at<?",Integer.class,from,to)));
        }
        return Map.of("days",days,"finishedMatches",db.queryForObject("select count(*) from arena_rooms where status='FINISHED'",Integer.class));
    }

    @DeleteMapping("/lessons/{id}") @Transactional public Map<String,Object> deleteLesson(Authentication auth,@PathVariable long id) {
        User actor=admin(auth);
        if(db.update("update lessons set published=false,deleted=true where id=? and deleted=false",id)==0)
            throw new ApiException(HttpStatus.NOT_FOUND,"LESSON_NOT_FOUND","Bài học không tồn tại hoặc đã xóa");
        db.update("update questions set published=false,teacher_active=false,deleted=true where lesson_id=?",id);
        audit(actor,"LESSON_DELETE","LESSON",id,"Xóa mềm bài học và câu hỏi; giữ lịch sử làm bài");
        return Map.of("id",id,"deleted",true);
    }
    @DeleteMapping("/questions/{id}") @Transactional public Map<String,Object> deleteQuestion(Authentication auth,@PathVariable long id) {
        User actor=admin(auth);
        if(db.update("update questions set published=false,teacher_active=false,deleted=true where id=? and deleted=false",id)==0)
            throw new ApiException(HttpStatus.NOT_FOUND,"QUESTION_NOT_FOUND","Câu hỏi không tồn tại hoặc đã xóa");
        var lessonIds=db.queryForList("select lesson_id from questions where id=?",Long.class,id);
        lessonIds.forEach(this::hideIncompleteLesson);
        audit(actor,"QUESTION_DELETE","QUESTION",id,"Xóa mềm; giữ snapshot lịch sử");
        return Map.of("id",id,"deleted",true);
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
        return db.queryForList("select * from (select 'CLASS' as source,r.id,r.reason,r.status,r.decision,r.created_at as createdAt,m.body as messageBody,m.user_id as accusedId,u.display_name as accusedName,r.reporter_id as reporterId from reports r join class_messages m on m.id=r.message_id join users u on u.id=m.user_id union all select 'ARENA' as source,r.id,r.reason,r.status,r.decision,r.created_at as createdAt,m.body as messageBody,m.user_id as accusedId,u.display_name as accusedName,r.reporter_id as reporterId from arena_reports r join arena_messages m on m.id=r.message_id join users u on u.id=m.user_id union all select 'USER' as source,r.id,r.reason,r.status,r.decision,r.created_at as createdAt,concat(r.context_type,' #',r.context_id) as messageBody,r.target_id as accusedId,u.display_name as accusedName,r.reporter_id as reporterId from learner_reports r join users u on u.id=r.target_id) all_reports order by case when status='OPEN' then 0 else 1 end,createdAt desc,source,id desc limit 200");
    }
    @PostMapping("/reports/{id}/decision") @Transactional public Map<String,Object> decide(Authentication auth,@PathVariable long id,@Valid @RequestBody Decision body) {
        User actor=admin(auth);
        if(!Set.of("DISMISS","WARN","MUTE_24H","LOCK").contains(body.action())) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_ACTION","Hành động không hợp lệ");
        boolean arena="ARENA".equals(body.source()),learner="USER".equals(body.source());
        if(body.source()==null||!Set.of("ARENA","CLASS","USER").contains(body.source())) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_SOURCE","Nguồn báo cáo không hợp lệ");
        String table=learner?"learner_reports":arena?"arena_reports":"reports", messages=arena?"arena_messages":"class_messages";
        var rows=db.queryForList(learner?"select status,target_id as accusedId,reporter_id as reporterId from learner_reports where id=? for update":"select r.status,m.user_id as accusedId,r.reporter_id as reporterId from "+table+" r join "+messages+" m on m.id=r.message_id where r.id=? for update",id);
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
        audit(actor,"REPORT_"+body.action(),learner?"USER_REPORT":arena?"ARENA_REPORT":"REPORT",id,Objects.toString(body.note(),""));
        if(events!=null)events.publishEvent(new com.grammarquest.service.ReportResolved(accused,((Number)rows.getFirst().get("reporterId")).longValue(),body.source(),id,body.action()));
        return Map.of("id",id,"status","RESOLVED");
    }
    @GetMapping("/content") public Map<String,Object> content(Authentication auth) {
        admin(auth);
        var questions=db.queryForList("select id,lesson_id as lessonId,prompt,option_a as optionA,option_b as optionB,option_c as optionC,option_d as optionD,correct_option as correctOption,explanation,owner_id as ownerId,question_type as questionType,accepted_answer as acceptedAnswer,admin_blocked as adminBlocked,case when owner_id is null then published else not admin_blocked end as published from questions where deleted=false order by id desc");
        questions.forEach(q->{var value=q.get("published");q.put("published",value instanceof Boolean?value:((Number)value).intValue()!=0);});
        return Map.of("lessons",db.queryForList("select id,topic_slug as topicSlug,title,summary,theory,difficulty,published,ordinal_no as ordinalNo from lessons where deleted=false order by topic_slug,ordinal_no"),
                      "questions",questions);
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
        if(db.update("update lessons set topic_slug=?,ordinal_no=?,title=?,summary=?,theory=?,difficulty=coalesce(?,difficulty) where id=? and deleted=false",body.topicSlug(),body.ordinalNo(),body.title(),body.summary(),body.theory(),body.difficulty(),id)==0)
            throw new ApiException(HttpStatus.NOT_FOUND,"LESSON_NOT_FOUND","Không tìm thấy bài học");
        audit(actor,"LESSON_EDIT","LESSON",id,body.title());
        return Map.of("id",id);
    }
    @PostMapping("/questions") @Transactional public Map<String,Object> createQuestion(Authentication auth,@Valid @RequestBody NewQuestion body) {
        User actor=admin(auth);
        if(db.queryForObject("select count(*) from lessons where id=? and deleted=false",Integer.class,body.lessonId())==0)
            throw new ApiException(HttpStatus.NOT_FOUND,"LESSON_NOT_FOUND","Không tìm thấy bài học");
        var key=new GeneratedKeyHolder();
        db.update(c->{var ps=c.prepareStatement("insert into questions(lesson_id,prompt,option_a,option_b,option_c,option_d,correct_option,explanation,published) values(?,?,?,?,?,?,?,?,false)",Statement.RETURN_GENERATED_KEYS);ps.setLong(1,body.lessonId());ps.setString(2,body.prompt());ps.setString(3,body.optionA());ps.setString(4,body.optionB());ps.setString(5,body.optionC());ps.setString(6,body.optionD());ps.setString(7,body.correctOption());ps.setString(8,body.explanation());return ps;},key);
        long id=Objects.requireNonNull(key.getKey()).longValue();
        audit(actor,"QUESTION_CREATE","QUESTION",id,body.prompt());
        return Map.of("id",id);
    }
    @PatchMapping("/lessons/{id}/publication") @Transactional public Map<String,Object> lessonPublication(Authentication auth,@PathVariable long id,@Valid @RequestBody Publish body) {
        User actor=admin(auth);
        if(db.queryForObject("select count(*) from lessons where id=? and deleted=false",Integer.class,id)==0)
            throw new ApiException(HttpStatus.NOT_FOUND,"LESSON_NOT_FOUND","Không tìm thấy bài học");
        if(body.published()) {
            Integer available=db.queryForObject("select count(*) from questions where lesson_id=? and published=true and owner_id is null and deleted=false and admin_blocked=false and (question_type is null or question_type='MCQ')",Integer.class,id);
            if(available==null||available<10) throw new ApiException(HttpStatus.CONFLICT,"QUESTION_BANK_INCOMPLETE","Cần ít nhất 10 câu hỏi chung đã xuất bản trước khi mở bài học");
        }
        if(db.update("update lessons set published=?,admin_blocked=? where id=?",body.published(),!body.published(),id)==0) throw new ApiException(HttpStatus.NOT_FOUND,"LESSON_NOT_FOUND","Không tìm thấy bài học");
        audit(actor,"LESSON_PUBLICATION","LESSON",id,Boolean.toString(body.published()));
        return Map.of("id",id,"published",body.published());
    }
    @PatchMapping("/questions/{id}/publication") @Transactional public Map<String,Object> questionPublication(Authentication auth,@PathVariable long id,@Valid @RequestBody Publish body) {
        User actor=admin(auth);
        var owned=db.queryForList("select owner_id,lesson_id from questions where id=? and deleted=false",id);
        if(!owned.isEmpty() && owned.getFirst().get("owner_id")!=null) {
            db.update("update questions set admin_blocked=? where id=?",!body.published(),id);
            audit(actor,"PRIVATE_QUESTION_MODERATE","QUESTION",id,"active="+body.published());
            return Map.of("id",id,"published",body.published());
        }
        if(db.queryForObject("select count(*) from questions where id=? and deleted=false and owner_id is null",Integer.class,id)==0)
            throw new ApiException(HttpStatus.NOT_FOUND,"QUESTION_NOT_FOUND","Không tìm thấy câu hỏi chung");
        if(db.update("update questions set published=?,admin_blocked=? where id=? and owner_id is null",body.published(),!body.published(),id)==0) throw new ApiException(HttpStatus.NOT_FOUND,"QUESTION_NOT_FOUND","Không tìm thấy câu hỏi");
        if(!body.published()) hideIncompleteLesson(((Number)owned.getFirst().get("lesson_id")).longValue());
        audit(actor,"QUESTION_PUBLICATION","QUESTION",id,Boolean.toString(body.published()));
        return Map.of("id",id,"published",body.published());
    }
    @PutMapping("/questions/{id}") @Transactional public Map<String,Object> editQuestion(Authentication auth,@PathVariable long id,@Valid @RequestBody EditQuestion body) {
        User actor=admin(auth);
        if(db.update("update questions set prompt=?,option_a=?,option_b=?,option_c=?,option_d=?,correct_option=?,explanation=? where id=? and owner_id is null and deleted=false",
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
