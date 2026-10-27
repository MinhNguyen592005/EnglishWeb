package com.grammarquest.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.grammarquest.entity.User;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

/** DB là nguồn sự thật; mọi thay đổi cùng đề khóa hàng exam, không khóa toàn server. */
@Service
public class LiveExamService {
    private final JdbcTemplate db;
    private final UserRepository users;
    private final ObjectMapper json;
    public LiveExamService(JdbcTemplate db,UserRepository users,ObjectMapper json) {this.db=db;this.users=users;this.json=json;}
    private ApiException invalid(String message) {return new ApiException(HttpStatus.BAD_REQUEST,"INVALID_EXAM",message);}
    private void require(boolean condition,String message) {if(!condition)throw invalid(message);}
    private User user(String username) {
        User u=users.findByUsernameIgnoreCase(username).orElseThrow(()->invalid("Tài khoản không tồn tại"));
        if(u.locked||!(u.role.equals("TEACHER")||u.role.equals("LEARNER")))throw new ApiException(HttpStatus.FORBIDDEN,"FORBIDDEN","Không có quyền truy cập kiểm tra");
        return u;
    }
    private boolean access(long classId,User u) {
        var owners=db.queryForList("select teacher_id from classrooms where id=?",Long.class,classId);
        if(owners.isEmpty())throw invalid("Lớp học không tồn tại");
        boolean owner=u.role.equals("TEACHER")&&owners.getFirst().equals(u.id);
        if(!owner&&(!u.role.equals("LEARNER")||db.queryForObject("select count(*) from class_members where class_id=? and user_id=?",Integer.class,classId,u.id)==0))
            throw new ApiException(HttpStatus.FORBIDDEN,"FORBIDDEN","Bạn không thuộc lớp học này");
        return owner;
    }
    public long id(JsonNode p,String key) {var v=p.path(key);require(v.isIntegralNumber()&&v.canConvertToLong()&&v.asLong()>0,"ID không hợp lệ");return v.asLong();}
    private String text(JsonNode p,String key,int max) {var v=p.path(key);require(v.isTextual()&&!v.asText().isBlank()&&v.asText().length()<=max,"Trường "+key+" không hợp lệ");return v.asText().trim();}
    private JsonNode parse(Object value) {try{return json.readTree(value.toString());}catch(Exception e){throw new IllegalStateException("Invalid exam JSON",e);}}
    private Map<String,Object> exam(long id,boolean lock) {
        var rows=db.queryForList("select * from class_exams where id=?"+(lock?" for update":""),id);
        if(rows.isEmpty())throw invalid("Bài kiểm tra không tồn tại");return rows.getFirst();
    }
    private boolean ended(Map<String,Object> e) {return Boolean.TRUE.equals(e.get("closed"))||!((Timestamp)e.get("ends_at")).toInstant().isAfter(Instant.now());}
    private Instant endTime(JsonNode p) {
        try {Instant end=Instant.parse(p.path("endsAt").asText());require((p.path("closed").asBoolean(false)||end.isAfter(Instant.now()))&&end.isBefore(Instant.now().plusSeconds(604800)),"Hạn làm phải trong 7 ngày tới khi mở kiểm tra");return end;}
        catch(java.time.format.DateTimeParseException e){throw invalid("Hạn làm không hợp lệ");}
    }
    // ID câu hỏi ổn định khi sửa; client không gửi điểm hay trạng thái đúng/sai.
    JsonNode questions(JsonNode p) {
        var input=p.path("questions");require(input.isArray()&&input.size()>0&&input.size()<=30,"Đề gồm 1–30 câu hỏi");
        Set<String> ids=new HashSet<>();var result=json.createArrayNode();
        for(var q:input) {
            String key=text(q,"id",64);require(key.matches("[a-zA-Z0-9_-]+")&&ids.add(key),"ID câu hỏi trùng hoặc không hợp lệ");
            var out=json.createObjectNode();out.put("id",key);out.put("prompt",text(q,"prompt",500));
            var options=q.path("options");require(options.isArray()&&options.size()==4,"Mỗi câu cần 4 lựa chọn");
            var choices=out.putArray("options");for(var choice:options){require(choice.isTextual()&&!choice.asText().isBlank()&&choice.asText().length()<=160,"Lựa chọn không hợp lệ");choices.add(choice.asText().trim());}
            var correct=q.path("correct");require(correct.isInt()&&correct.asInt()>=0&&correct.asInt()<4,"Đáp án đúng không hợp lệ");out.put("correct",correct.asInt());result.add(out);
        }return result;
    }
    static int score(JsonNode questions,JsonNode answers) {
        int correct=0;for(var q:questions){var a=answers.get(q.path("id").asText());if(a!=null&&a.isInt()&&a.asInt()==q.path("correct").asInt())correct++;}return correct;
    }
    private ObjectNode validAnswers(JsonNode qs,JsonNode previous) {
        var clean=json.createObjectNode();for(var q:qs){String key=q.path("id").asText();var a=previous.get(key);if(a!=null&&a.isInt()&&a.asInt()>=0&&a.asInt()<4)clean.set(key,a);}return clean;
    }
    @Transactional
    public Object action(String username,String action,JsonNode p) {
        User u=user(username);
        if(action.equals("EXAM_LIST")) {
            long classId=id(p,"classId");access(classId,u);
            return db.queryForList("select id,title,version,closed,ends_at as endsAt from class_exams where class_id=? order by id desc",classId);
        }
        if(action.equals("EXAM_CREATE")) {
            long classId=id(p,"classId");require(access(classId,u),"Chỉ giáo viên của lớp được tạo kiểm tra");
            String title=text(p,"title",160);JsonNode qs=questions(p);Instant end=endTime(p);var key=new GeneratedKeyHolder();
            db.update(c->{var s=c.prepareStatement("insert into class_exams(class_id,title,questions_json,ends_at) values(?,?,?,?)",Statement.RETURN_GENERATED_KEYS);s.setLong(1,classId);s.setString(2,title);s.setString(3,qs.toString());s.setTimestamp(4,Timestamp.from(end));return s;},key);
            return view(username,Objects.requireNonNull(key.getKey()).longValue());
        }
        long examId=id(p,"examId");var e=exam(examId,true);boolean owner=access(((Number)e.get("class_id")).longValue(),u);
        JsonNode qs=parse(e.get("questions_json"));long version=((Number)e.get("version")).longValue();
        switch(action) {
            case "EXAM_EDIT" -> {
                require(owner,"Chỉ giáo viên của lớp được sửa đề");require(p.path("version").asLong(-1)==version,"Đề đã được sửa ở tab khác. Mở lại đề mới nhất.");
                qs=questions(p);String title=text(p,"title",160);Instant end=endTime(p);require(p.path("closed").isBoolean(),"Trạng thái không hợp lệ");
                db.update("update class_exams set title=?,questions_json=?,version=version+1,revision=revision+1,ends_at=?,closed=? where id=?",title,qs.toString(),Timestamp.from(end),p.path("closed").asBoolean(),examId);
                // Chấm lại cả bài đã nộp khi đáp án thay đổi, trong cùng transaction với sửa đề.
                for(var s:db.queryForList("select user_id,answers_json from class_exam_submissions where exam_id=?",examId)) {
                    var answers=validAnswers(qs,parse(s.get("answers_json")));
                    db.update("update class_exam_submissions set answers_json=?,correct_count=?,answered_count=? where exam_id=? and user_id=?",answers.toString(),score(qs,answers),answers.size(),examId,s.get("user_id"));
                }
            }
            case "EXAM_OPEN", "EXAM_SYNC" -> {
                if(!owner&&!ended(e)&&db.update("insert ignore into class_exam_submissions(exam_id,user_id,answers_json) values(?,?,'{}')",examId,u.id)>0)
                    db.update("update class_exams set revision=revision+1 where id=?",examId);
            }
            case "EXAM_ANSWER", "EXAM_SUBMIT" -> {
                require(!owner,"Giáo viên không làm bài kiểm tra của lớp");require(!ended(e),"Bài kiểm tra đã đóng hoặc hết giờ");
                require(p.path("version").asLong(-1)==version,"Đề vừa thay đổi. Đang tải phiên bản mới, hãy chọn lại đáp án.");
                db.update("insert ignore into class_exam_submissions(exam_id,user_id,answers_json) values(?,?,'{}')",examId,u.id);
                var s=db.queryForMap("select answers_json,submitted from class_exam_submissions where exam_id=? and user_id=?",examId,u.id);
                require(!Boolean.TRUE.equals(s.get("submitted")),"Bạn đã nộp bài");var answers=validAnswers(qs,parse(s.get("answers_json")));
                if(action.equals("EXAM_ANSWER")) {
                    String question=text(p,"questionId",64);boolean exists=false;for(var q:qs)if(q.path("id").asText().equals(question))exists=true;
                    require(exists,"Câu hỏi không còn trong đề");var option=p.path("option");require(option.isInt()&&option.asInt()>=0&&option.asInt()<4,"Đáp án không hợp lệ");answers.put(question,option.asInt());
                }
                db.update("update class_exam_submissions set answers_json=?,correct_count=?,answered_count=?,submitted=?,updated_at=current_timestamp(6) where exam_id=? and user_id=?",answers.toString(),score(qs,answers),answers.size(),action.equals("EXAM_SUBMIT"),examId,u.id);
                db.update("update class_exams set revision=revision+1 where id=?",examId);
            }
            default -> throw invalid("Action kiểm tra không được hỗ trợ");
        }
        return view(username,examId);
    }
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public Map<String,Object> view(String username,long examId) {
        User u=user(username);var e=exam(examId,false);boolean owner=access(((Number)e.get("class_id")).longValue(),u);boolean ended=ended(e);
        JsonNode qs=parse(e.get("questions_json"));var safe=qs.deepCopy();if(!owner)for(var q:safe)((ObjectNode)q).remove("correct");
        Map<String,Object> out=new LinkedHashMap<>();out.put("id",examId);out.put("classId",e.get("class_id"));out.put("title",e.get("title"));out.put("version",e.get("version"));out.put("revision",e.get("revision"));out.put("endsAt",((Timestamp)e.get("ends_at")).toInstant().toString());out.put("closed",ended);out.put("owner",owner);out.put("questions",safe);
        if(owner) {
            out.put("ranking",db.queryForList("select u.id as userId,u.username,u.display_name as displayName,coalesce(s.correct_count,0) as correctCount,coalesce(s.answered_count,0) as answeredCount,case when s.user_id is null then 'NOT_STARTED' when s.submitted=true then 'SUBMITTED' when ?=true then 'EXPIRED' else 'WORKING' end as status,s.updated_at as updatedAt from class_members m join users u on u.id=m.user_id left join class_exam_submissions s on s.exam_id=? and s.user_id=u.id where m.class_id=? order by correctCount desc,answeredCount desc,u.id",ended,examId,e.get("class_id")));
        } else {
            var rows=db.queryForList("select answers_json,submitted,correct_count from class_exam_submissions where exam_id=? and user_id=?",examId,u.id);
            out.put("answers",rows.isEmpty()?json.createObjectNode():parse(rows.getFirst().get("answers_json")));
            out.put("submitted",!rows.isEmpty()&&Boolean.TRUE.equals(rows.getFirst().get("submitted")));
            // Không trả điểm từng lần chọn: tránh suy ra đáp án đúng bằng thử liên tục.
            if(ended)out.put("correctCount",rows.isEmpty()?0:rows.getFirst().get("correct_count"));
        }return out;
    }
}
