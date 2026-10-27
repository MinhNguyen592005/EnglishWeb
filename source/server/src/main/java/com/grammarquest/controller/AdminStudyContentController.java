package com.grammarquest.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import com.grammarquest.service.CurriculumChanged;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/admin/study-content")
public class AdminStudyContentController {
    private final JdbcTemplate db;
    private final UserRepository users;
    private final ObjectMapper json;
    private final ApplicationEventPublisher events;
    public AdminStudyContentController(JdbcTemplate db,UserRepository users,ObjectMapper json,ApplicationEventPublisher events) {
        this.db=db;this.users=users;this.json=json;this.events=events;
    }
    private long admin(Authentication auth) {
        var u=users.findByUsernameIgnoreCase(auth.getName()).orElseThrow();
        if(u.locked||!"ADMIN".equals(u.role))throw new ApiException(HttpStatus.FORBIDDEN,"ADMIN_ONLY","Chỉ admin được kiểm duyệt nội dung");
        return u.id;
    }
    @GetMapping @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public Map<String,Object> list(Authentication auth) {
        admin(auth);
        var lessons=db.queryForList("select l.id,l.title,l.module_id as moduleId,m.level_id as levelId,l.published,l.content_json as content,l.questions_json as questions from study_lessons l join study_modules m on m.id=l.module_id order by m.level_id,m.ordinal_no,l.ordinal_no");
        var blocks=new HashSet<String>();
        for(var b:db.queryForList("select lesson_id,question_id from study_question_blocks"))blocks.add(b.get("lesson_id")+":"+b.get("question_id"));
        var questions=new ArrayList<Map<String,Object>>();
        for(var lesson:lessons)try {
            var qs=json.readTree(lesson.remove("questions").toString());
            lesson.put("content",json.readTree(lesson.get("content").toString()));
            for(var q:qs) {
                var item=new LinkedHashMap<String,Object>();item.put("id",q.path("id").asText());item.put("lessonId",lesson.get("id"));
                item.put("prompt",q.path("prompt").asText());item.put("options",q.path("options"));item.put("correctOption",q.path("correctOption").asText());item.put("explanation",q.path("explanation").asText());
                item.put("published",!blocks.contains(lesson.get("id")+":"+q.path("id").asText()));questions.add(item);
            }
        }catch(Exception e){throw new IllegalStateException("Invalid course content",e);}
        return Map.of("lessons",lessons,"questions",questions,"examQuestions",db.queryForList("select id,module_id as moduleId,prompt,options_json as options,correct_option as correctOption,explanation,active as published from study_exam_questions order by module_id,id"));
    }
    public record Publication(@NotBlank @Pattern(regexp="LESSON|QUESTION|EXAM_QUESTION") String kind,
        @NotBlank @Size(max=64) String id,@Size(max=20) String lessonId,@NotNull Boolean published) {}
    @PatchMapping @Transactional
    public Map<String,Object> publish(Authentication auth,@Valid @RequestBody Publication body) {
        long actor=admin(auth);int changed;
        if("LESSON".equals(body.kind())) {
            changed=db.update("update study_lessons set published=? where id=?",body.published(),body.id());
        } else if("EXAM_QUESTION".equals(body.kind())) {
            changed=db.update("update study_exam_questions set active=? where id=?",body.published(),body.id());
        } else if("QUESTION".equals(body.kind())) {
            var rows=db.queryForList("select questions_json from study_lessons where id=? for update",body.lessonId());
            if(rows.isEmpty())throw missing();
            boolean found=false;
            try {for(var q:json.readTree(rows.getFirst().get("questions_json").toString()))if(q.path("id").asText().equals(body.id()))found=true;}
            catch(Exception e){throw new IllegalStateException(e);}
            if(!found)throw missing();
            if(body.published())db.update("delete from study_question_blocks where lesson_id=? and question_id=?",body.lessonId(),body.id());
            else db.update("insert ignore into study_question_blocks(lesson_id,question_id) values(?,?)",body.lessonId(),body.id());
            changed=1;
        } else throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_CONTENT_KIND","Loại nội dung không hợp lệ");
        if(changed==0)throw missing();
        db.update("insert into audit_logs(actor_id,action,target_type,target_id,detail) values(?,?,?,?,?)",actor,"STUDY_PUBLICATION",body.kind(),0,body.id()+" lesson="+body.lessonId()+" published="+body.published());
        events.publishEvent(new CurriculumChanged());
        return Map.of("published",body.published());
    }
    private ApiException missing(){return new ApiException(HttpStatus.NOT_FOUND,"CONTENT_NOT_FOUND","Không tìm thấy nội dung lộ trình");}
}
