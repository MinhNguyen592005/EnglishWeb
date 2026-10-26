package com.grammarquest.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.grammarquest.entity.User;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.sql.Statement;
import java.util.*;

@Service
public class PlacementService {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final UserRepository users;
    private final ApplicationEventPublisher events;
    public record Completed(String username) {}
    public PlacementService(JdbcTemplate db,ObjectMapper json,UserRepository users,ApplicationEventPublisher events){this.db=db;this.json=json;this.users=users;this.events=events;}
    private ApiException invalid(String message){return new ApiException(HttpStatus.BAD_REQUEST,"INVALID_PLACEMENT",message);}
    private JsonNode parse(Object value){try{return json.readTree(value.toString());}catch(Exception e){throw new IllegalStateException("Invalid placement data",e);}}
    private User learner(String username){
        var u=users.findByUsernameIgnoreCase(username).orElseThrow(()->new ApiException(HttpStatus.UNAUTHORIZED,"UNAUTHENTICATED","Vui lòng đăng nhập"));
        if(u.locked||!"LEARNER".equals(u.role))throw new ApiException(HttpStatus.FORBIDDEN,"LEARNER_ONLY","Chỉ học viên được làm kiểm tra đầu vào");return u;
    }
    @Transactional
    public void enrollNewUser(long userId){db.update("insert into study_entry_profiles(user_id,passed_levels) values(?,'[]')",userId);}
    public void requireCompleted(User u){
        if(u.placementEligible&&db.queryForObject("select count(*) from study_entry_profiles where user_id=? and status='COMPLETED'",Integer.class,u.id)==0)
            throw new ApiException(HttpStatus.FORBIDDEN,"PLACEMENT_REQUIRED","Hãy hoàn thành kiểm tra đầu vào trước khi bắt đầu học");
    }
    public int startingLevel(long userId){return db.queryForObject("select coalesce(max(starting_level),1) from study_entry_profiles where user_id=? and status='COMPLETED'",Integer.class,userId);}
    public void recordLesson(long userId,String lessonId,int level){db.update("update study_entry_profiles set last_lesson_id=?,current_level=greatest(current_level,?) where user_id=? and status='COMPLETED'",lessonId,level,userId);}
    public void advance(long userId,int level){db.update("update study_entry_profiles set current_level=greatest(current_level,?) where user_id=? and status='COMPLETED'",Math.min(5,level),userId);}
    private Map<String,Object> profile(long userId,boolean lock){
        var rows=db.queryForList("select * from study_entry_profiles where user_id=?"+(lock?" for update":""),userId);
        if(rows.isEmpty())throw new ApiException(HttpStatus.CONFLICT,"PLACEMENT_PROFILE_MISSING","Chưa có thông tin kiểm tra đầu vào. Vui lòng liên hệ quản trị viên.");return rows.getFirst();
    }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public Object action(String username,String action,JsonNode p){
        User u=learner(username);
        if(!u.placementEligible){
            if(!action.equals("PLACEMENT_STATUS"))throw new ApiException(HttpStatus.FORBIDDEN,"PLACEMENT_NOT_REQUIRED","Tài khoản hiện có không cần kiểm tra đầu vào");
            return Map.of("eligible",false,"required",false,"status","NOT_REQUIRED","resumePath","/dashboard");
        }
        if(action.equals("PLACEMENT_STATUS"))return status(u,profile(u.id,false));
        var state=profile(u.id,true); // All writes lock profile first, then the unique attempt.
        if(action.equals("PLACEMENT_OPEN")){
            if("COMPLETED".equals(state.get("status")))return status(u,state);
            var rows=db.queryForList("select id from study_entry_attempts where user_id=?",Long.class,u.id);
            if(rows.isEmpty()){
                var questions=drawQuestions();var key=new GeneratedKeyHolder();
                db.update(c->{var s=c.prepareStatement("insert into study_entry_attempts(user_id,questions_json,answers_json) values(?,?,'{}')",Statement.RETURN_GENERATED_KEYS);s.setLong(1,u.id);s.setString(2,questions.toString());return s;},key);
                db.update("update study_entry_profiles set status='IN_PROGRESS' where user_id=?",u.id);
            }
            return view(u);
        }
        if(!Set.of("PLACEMENT_SAVE","PLACEMENT_SUBMIT").contains(action))throw invalid("Thao tác không hợp lệ");
        var id=p.path("attemptId");if(!id.isIntegralNumber()||!id.canConvertToLong()||id.asLong()<1)throw invalid("Lượt kiểm tra không hợp lệ");
        var attempts=db.queryForList("select * from study_entry_attempts where id=? and user_id=? for update",id.asLong(),u.id);
        if(attempts.isEmpty())throw new ApiException(HttpStatus.NOT_FOUND,"ATTEMPT_NOT_FOUND","Không tìm thấy lượt kiểm tra của bạn");
        var attempt=attempts.getFirst();if("COMPLETED".equals(attempt.get("status")))return status(u,state);
        JsonNode questions=parse(attempt.get("questions_json"));
        if(action.equals("PLACEMENT_SAVE")){
            String questionId=p.path("questionId").asText(""),option=p.path("option").asText("");
            boolean found=false;for(var q:questions)if(q.path("id").asText().equals(questionId))found=true;
            if(!found||!option.matches("[ABCD]"))throw invalid("Câu hỏi hoặc lựa chọn không hợp lệ");
            var answers=(ObjectNode)parse(attempt.get("answers_json"));answers.put(questionId,option);
            db.update("update study_entry_attempts set answers_json=? where id=?",answers.toString(),id.asLong());return Map.of("saved",true,"attemptId",id.asLong());
        }
        var answers=validateAnswers(questions,p.path("answers"));int correct=score(questions,answers),start=startingLevelForAnswers(questions,answers);
        var passed=json.createArrayNode();for(int level=1;level<start;level++)passed.add(level);
        db.update("update study_entry_attempts set status='COMPLETED',answers_json=?,correct_count=?,completed_at=current_timestamp(6) where id=?",answers.toString(),correct,id.asLong());
        db.update("update study_entry_profiles set status='COMPLETED',starting_level=?,current_level=?,passed_levels=?,completed_at=current_timestamp(6) where user_id=?",start,start,passed.toString(),u.id);
        events.publishEvent(new Completed(u.username));return status(u,profile(u.id,false));
    }
    private JsonNode drawQuestions(){
        var banks=new TreeMap<Integer,List<JsonNode>>();
        for(var row:db.queryForList("select * from study_entry_questions order by level_id,id")){
            var q=json.createObjectNode();q.put("id",row.get("id").toString());q.put("level",((Number)row.get("level_id")).intValue());q.put("prompt",row.get("prompt").toString());q.set("options",parse(row.get("options_json")));q.put("correctOption",row.get("correct_option").toString());banks.computeIfAbsent(q.path("level").asInt(),k->new ArrayList<>()).add(q);
        }
        if(banks.size()!=5||banks.values().stream().anyMatch(bank->bank.size()!=10))throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"PLACEMENT_BANK_INCOMPLETE","Ngân hàng đầu vào cần đủ 50 câu, 10 câu cho mỗi level");
        return json.valueToTree(draw(banks));
    }
    static List<JsonNode> draw(Map<Integer,List<JsonNode>> banks){
        int[] counts={5,5,5,5,5};var selected=new ArrayList<JsonNode>();
        for(int level=1;level<=5;level++){var copy=new ArrayList<>(banks.get(level));Collections.shuffle(copy);selected.addAll(copy.subList(0,counts[level-1]));}
        Collections.shuffle(selected);return selected;
    }
    private Object view(User u){
        var out=new LinkedHashMap<String,Object>(status(u,profile(u.id,false)));
        if("COMPLETED".equals(out.get("status")))return out;
        var a=db.queryForMap("select * from study_entry_attempts where user_id=?",u.id);var safe=json.createArrayNode();
        for(var q:parse(a.get("questions_json"))){var item=(ObjectNode)q.deepCopy();item.remove("correctOption");safe.add(item);}
        out.put("attemptId",a.get("id"));out.put("questions",safe);out.put("answers",parse(a.get("answers_json")));return out;
    }
    private Map<String,Object> status(User u,Map<String,Object> state){
        boolean completed="COMPLETED".equals(state.get("status"));var out=new LinkedHashMap<String,Object>();out.put("eligible",true);out.put("required",!completed);out.put("status",state.get("status"));
        if(completed){
            int start=((Number)state.get("starting_level")).intValue(),current=((Number)state.get("current_level")).intValue();
            int correct=db.queryForObject("select correct_count from study_entry_attempts where user_id=?",Integer.class,u.id);
            String firstModule=db.queryForObject("select id from study_modules where level_id=? order by ordinal_no limit 1",String.class,start);
            String startPath="/roadmap?planet=level-"+start+"&module="+firstModule;
            String resumePath="/roadmap?planet=level-"+current;
            if(state.get("last_lesson_id")!=null){
                var last=db.queryForMap("select l.id,l.module_id,m.level_id,p.completed_at from study_lessons l join study_modules m on m.id=l.module_id left join study_progress p on p.lesson_id=l.id and p.user_id=? where l.id=?",u.id,state.get("last_lesson_id"));
                if(last.get("completed_at")==null)resumePath="/roadmap?planet=level-"+last.get("level_id")+"&module="+last.get("module_id")+"&lesson="+last.get("id");
            }
            int total=db.queryForObject("select json_length(questions_json) from study_entry_attempts where user_id=?",Integer.class,u.id);
            out.put("correctCount",correct);out.put("totalQuestions",total);out.put("startingLevel",start);out.put("currentLevel",current);out.put("passedLevels",parse(state.get("passed_levels")));out.put("completedAt",state.get("completed_at").toString());out.put("message",start==1?"Bạn sẽ bắt đầu từ Level 1 để củng cố nền tảng.":"Bạn đã đạt kiến thức các level trước và sẽ bắt đầu từ Level "+start+".");out.put("startPath",startPath);out.put("resumePath",resumePath);
        }
        return out;
    }
    ObjectNode validateAnswers(JsonNode questions,JsonNode input){
        if(!input.isObject()||input.size()!=questions.size())throw invalid("Hãy trả lời đủ "+questions.size()+" câu trước khi nộp");var clean=json.createObjectNode();
        for(var q:questions){String id=q.path("id").asText();var a=input.get(id);if(a==null||!a.isTextual()||!a.asText().matches("[ABCD]"))throw invalid("Hãy trả lời đầy đủ và hợp lệ tất cả câu hỏi");clean.put(id,a.asText());}return clean;
    }
    static int score(JsonNode questions,JsonNode answers){int result=0;for(var q:questions)if(q.path("correctOption").asText().equals(answers.path(q.path("id").asText()).asText()))result++;return result;}
    /** Never skip a weak foundational level based on points earned in harder groups. */
    static int startingLevelForAnswers(JsonNode questions,JsonNode answers){
        int start=1;
        for(int level=1;level<5;level++){
            int count=0,correct=0;
            for(var q:questions)if(q.path("level").asInt()==level){count++;if(q.path("correctOption").asText().equals(answers.path(q.path("id").asText()).asText()))correct++;}
            // Older in-progress ten-question snapshots remain valid, but sparse groups cannot exempt a level.
            if(count<3||correct<RoadmapCourseService.masteryThreshold(count))break;
            start=level+1;
        }
        return start;
    }
}
