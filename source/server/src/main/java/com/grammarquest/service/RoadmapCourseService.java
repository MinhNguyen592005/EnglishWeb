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

/** The STUDY.md course owns its tables and rules; legacy learning is untouched. */
@Service
public class RoadmapCourseService {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final UserRepository users;
    private final ApplicationEventPublisher events;
    private final PlacementService placement;
    private final DailyQuestService dailyQuests;
    private final StudyRewardService rewards;
    public record ProgressChanged(String username) {}
    public RoadmapCourseService(JdbcTemplate db,ObjectMapper json,UserRepository users,ApplicationEventPublisher events,PlacementService placement,DailyQuestService dailyQuests,StudyRewardService rewards) {
        this.db=db;this.json=json;this.users=users;this.events=events;this.placement=placement;this.dailyQuests=dailyQuests;this.rewards=rewards;
    }
    private ApiException invalid(String message){return new ApiException(HttpStatus.BAD_REQUEST,"INVALID_ROADMAP",message);}
    private void require(boolean valid,String message){if(!valid)throw invalid(message);}
    private JsonNode parse(Object value){try{return json.readTree(value.toString());}catch(Exception e){throw new IllegalStateException("Invalid study data",e);}}
    private String text(JsonNode p,String key){var v=p.path(key);require(v.isTextual()&&!v.asText().isBlank()&&v.asText().length()<=64,"Thiếu hoặc sai "+key);return v.asText();}
    private long attemptId(JsonNode p){var id=p.path("attemptId");require(id.isIntegralNumber()&&id.canConvertToLong()&&id.asLong()>0,"Lượt làm không hợp lệ");return id.asLong();}
    private User learner(String username){
        var u=users.findWithLockByUsernameIgnoreCase(username).orElseThrow(()->new ApiException(HttpStatus.UNAUTHORIZED,"UNAUTHENTICATED","Vui lòng đăng nhập"));
        if(u.locked||!"LEARNER".equals(u.role))throw new ApiException(HttpStatus.FORBIDDEN,"LEARNER_ONLY","Chỉ học viên được tham gia lộ trình");
        placement.requireCompleted(u);
        return u;
    }
    private void unlocked(long userId,int level){
        require(level>=1&&level<=5,"Level không hợp lệ");
        int starting=Math.max(1,placement.startingLevel(userId));
        int passed=db.queryForObject("select count(distinct reference_id) from study_attempts where user_id=? and kind='LEVEL_TEST' and status='PASSED' and cast(reference_id as unsigned) >= ? and cast(reference_id as unsigned) < ?",Integer.class,userId,starting,level);
        if(passed!=Math.max(0,level-starting))throw new ApiException(HttpStatus.FORBIDDEN,"LEVEL_LOCKED","Đạt ít nhất 8/10 câu ở bài kiểm tra level trước để mở level này");
    }
    private Map<String,Object> lessonRow(String id){
        var rows=db.queryForList("select l.*,m.level_id,m.title as module_title from study_lessons l join study_modules m on m.id=l.module_id where l.id=?",id);
        if(rows.isEmpty())throw new ApiException(HttpStatus.NOT_FOUND,"LESSON_NOT_FOUND","Không tìm thấy bài học");return rows.getFirst();
    }
    private Map<String,Object> moduleRow(String id){
        var rows=db.queryForList("select * from study_modules where id=?",id);
        if(rows.isEmpty())throw new ApiException(HttpStatus.NOT_FOUND,"MODULE_NOT_FOUND","Không tìm thấy module");return rows.getFirst();
    }
    private record ModuleBarrier(int ordinal,String title) {}
    private ModuleBarrier firstUnfinishedModule(long userId,int level){
        if(level<Math.max(1,placement.startingLevel(userId)))return null;
        var rows=db.queryForList("select m.ordinal_no,m.title from study_modules m left join study_lessons l on l.module_id=m.id left join study_progress p on p.lesson_id=l.id and p.user_id=? where m.level_id=? group by m.id,m.ordinal_no,m.title having count(l.id)=0 or count(p.completed_at)<count(l.id) or not exists (select 1 from study_module_mastery mm where mm.user_id=? and mm.module_id=m.id) order by m.ordinal_no limit 1",userId,level,userId);
        return rows.isEmpty()?null:new ModuleBarrier(((Number)rows.getFirst().get("ordinal_no")).intValue(),rows.getFirst().get("title").toString());
    }
    private void moduleUnlocked(long userId,String moduleId){
        var module=moduleRow(moduleId);int level=((Number)module.get("level_id")).intValue();unlocked(userId,level);
        var barrier=firstUnfinishedModule(userId,level);
        if(barrier!=null&&((Number)module.get("ordinal_no")).intValue()>barrier.ordinal())
            throw new ApiException(HttpStatus.FORBIDDEN,"MODULE_LOCKED","Đạt các bài học và kiểm tra module “"+barrier.title()+"” trước khi mở module tiếp theo");
    }
    private void referenceUnlocked(long userId,String kind,String reference){
        if(kind.equals("LESSON"))moduleUnlocked(userId,lessonRow(reference).get("module_id").toString());
        else if(kind.startsWith("MODULE_"))moduleUnlocked(userId,reference);
        else unlocked(userId,levelOf(kind,reference));
    }
    private int levelOf(String kind,String reference){
        if(kind.equals("LESSON"))return ((Number)lessonRow(reference).get("level_id")).intValue();
        if(kind.startsWith("MODULE_"))return ((Number)moduleRow(reference).get("level_id")).intValue();
        try{int level=Integer.parseInt(reference);require(level>=1&&level<=5&&Integer.toString(level).equals(reference),"Level không hợp lệ");return level;}catch(NumberFormatException e){throw invalid("Level không hợp lệ");}
    }
    @Transactional
    public Object action(String username,String action,JsonNode p){
        User u=learner(username);
        // learner() acquires the account lock before attempts, rewards and quests.
        return switch(action){
            case "ROADMAP_OPEN" -> overview(u.id);
            case "ROADMAP_HISTORY" -> history(u.id);
            case "ROADMAP_LESSON" -> openLesson(u,text(p,"lessonId"));
            case "ROADMAP_START" -> start(u,p);
            case "ROADMAP_ATTEMPT" -> view(u,attemptId(p));
            case "ROADMAP_SAVE" -> save(u,p,false);
            case "ROADMAP_SUBMIT" -> save(u,p,true);
            default -> throw invalid("Thao tác lộ trình không được hỗ trợ");
        };
    }
    private List<Map<String,Object>> history(long userId){
        return db.queryForList("""
            select a.id,a.kind,a.reference_id as referenceId,a.status,
                   coalesce(l.title,m.title,lv.title) as title,lv.id as levelId,
                   json_length(a.questions_json) as totalQuestions,
                   case when a.status='IN_PROGRESS' then null else a.correct_count end as correctCount,
                   a.created_at as createdAt,a.submitted_at as submittedAt
            from study_attempts a
            left join study_lessons l on a.kind='LESSON' and l.id=a.reference_id
            left join study_modules lm on lm.id=l.module_id
            left join study_modules m on a.kind in ('MODULE_REVIEW','MODULE_TEST') and m.id=a.reference_id
            left join study_levels lv on lv.id=case when a.kind in ('LEVEL_REVIEW','LEVEL_TEST')
                then cast(a.reference_id as unsigned) else coalesce(lm.level_id,m.level_id) end
            where a.user_id=?
            order by coalesce(a.submitted_at,a.created_at) desc,a.id desc limit 20
            """,userId);
    }
    private Object overview(long userId){
        var passed=new HashSet<>(db.queryForList("select distinct reference_id from study_attempts where user_id=? and kind='LEVEL_TEST' and status='PASSED'",String.class,userId));
        var mastered=new HashSet<>(db.queryForList("select module_id from study_module_mastery where user_id=?",String.class,userId));
        var modules=db.queryForList("select id,level_id as levelId,ordinal_no as ordinalNo,title from study_modules order by level_id,ordinal_no");
        var lessons=db.queryForList("select l.id,l.module_id as moduleId,l.ordinal_no as ordinalNo,l.title,l.published,p.opened_at as openedAt,p.completed_at as completedAt from study_lessons l left join study_progress p on p.lesson_id=l.id and p.user_id=? order by l.module_id,l.ordinal_no",userId);
        var levels=db.queryForList("select id,title,outcome,planet_style as planetStyle from study_levels order by id");
        int starting=Math.max(1,placement.startingLevel(userId));boolean open=true;
        for(var level:levels){
            int id=((Number)level.get("id")).intValue();var levelModules=new ArrayList<Map<String,Object>>();int done=0,total=0;
            boolean moduleOpen=open;String blockingModule=null;boolean placementPassed=id<starting;
            for(var module:modules)if(((Number)module.get("levelId")).intValue()==id){
                var moduleLessons=new ArrayList<Map<String,Object>>();int moduleDone=0;
                for(var lesson:lessons)if(lesson.get("moduleId").equals(module.get("id"))){
                    boolean completed=lesson.get("completedAt")!=null;
                    var item=new LinkedHashMap<String,Object>();item.put("published",lesson.get("published"));item.put("id",lesson.get("id"));item.put("title",lesson.get("title"));item.put("ordinalNo",lesson.get("ordinalNo"));
                    item.put("status",completed?"COMPLETED":lesson.get("openedAt")!=null?"IN_PROGRESS":"NOT_STARTED");moduleLessons.add(item);if(completed)moduleDone++;
                }
                var item=new LinkedHashMap<String,Object>(module);item.put("lessons",moduleLessons);item.put("completedCount",moduleDone);item.put("lessonCount",moduleLessons.size());item.put("unlocked",moduleOpen);
                item.put("passed",placementPassed||mastered.contains(module.get("id")));
                item.put("lockReason",moduleOpen?null:!open?"Vượt bài kiểm tra level trước để mở level này":"Đạt bài học và kiểm tra module “"+blockingModule+"” để mở");
                if(!placementPassed&&moduleOpen&&(moduleLessons.isEmpty()||moduleDone!=moduleLessons.size()||!mastered.contains(module.get("id")))){moduleOpen=false;blockingModule=module.get("title").toString();}
                levelModules.add(item);done+=moduleDone;total+=moduleLessons.size();
            }
            boolean completed=placementPassed||passed.contains(Integer.toString(id));level.put("placementPassed",placementPassed);level.put("unlocked",open);level.put("passed",completed);level.put("modules",levelModules);level.put("completedCount",done);level.put("lessonCount",total);level.put("examReady",open&&total>0&&done==total&&levelModules.stream().allMatch(m->Boolean.TRUE.equals(m.get("passed"))));
            open=open&&completed;
        }
        return Map.of("levels",levels);
    }
    private void lockEnrollment(long userId){
        db.update("insert ignore into study_enrollments(user_id) values(?)",userId);
        db.queryForObject("select user_id from study_enrollments where user_id=? for update",Long.class,userId);
    }
    private void requirePublished(Map<String,Object> lesson) {
        if(Boolean.FALSE.equals(lesson.get("published")) || (lesson.get("published") instanceof Number n && n.intValue()==0))
            throw new ApiException(HttpStatus.CONFLICT,"CONTENT_HIDDEN","Bài học đang tạm ẩn để kiểm duyệt. Vui lòng quay lại sau.");
    }
    private Object openLesson(User u,String id){
        var lesson=lessonRow(id);requirePublished(lesson);moduleUnlocked(u.id,lesson.get("module_id").toString());lockEnrollment(u.id);
        db.update("insert ignore into study_progress(user_id,lesson_id) values(?,?)",u.id,id);
        placement.recordLesson(u.id,id,((Number)lesson.get("level_id")).intValue());
        var latest=db.queryForList("select id from study_attempts where user_id=? and kind='LESSON' and reference_id=? order by id desc limit 1",Long.class,u.id,id);
        Object attempt=latest.isEmpty()?create(u,"LESSON",id,UUID.randomUUID().toString()):view(u,latest.getFirst());
        var barrier=firstUnfinishedModule(u.id,((Number)lesson.get("level_id")).intValue());
        var next=db.queryForList("select l.id from study_lessons l join study_modules m on m.id=l.module_id join study_modules current_module on current_module.id=? where l.published=true and m.level_id=current_module.level_id and m.ordinal_no<=? and (m.ordinal_no>current_module.ordinal_no or (m.id=current_module.id and l.ordinal_no>?)) order by m.ordinal_no,l.ordinal_no limit 1",String.class,lesson.get("module_id"),barrier==null?Integer.MAX_VALUE:barrier.ordinal(),lesson.get("ordinal_no"));
        var out=new LinkedHashMap<String,Object>();out.put("id",id);out.put("title",lesson.get("title"));out.put("moduleId",lesson.get("module_id"));out.put("moduleTitle",lesson.get("module_title"));out.put("levelId",lesson.get("level_id"));out.put("content",parse(lesson.get("content_json")));out.put("attempt",attempt);out.put("nextLessonId",next.isEmpty()?null:next.getFirst());
        out.put("completed",db.queryForObject("select count(*) from study_progress where user_id=? and lesson_id=? and completed_at is not null",Integer.class,u.id,id)>0);return out;
    }
    private Object start(User u,JsonNode p){
        String kind=text(p,"kind"),reference=text(p,"referenceId"),key=text(p,"requestKey");
        require(Set.of("LESSON","MODULE_REVIEW","MODULE_TEST","LEVEL_REVIEW","LEVEL_TEST").contains(kind),"Loại lượt làm không hợp lệ");
        if(kind.equals("LESSON"))requirePublished(lessonRow(reference));
        referenceUnlocked(u.id,kind,reference);lockEnrollment(u.id);
        var existing=db.queryForList("select id,kind,reference_id from study_attempts where user_id=? and request_key=?",u.id,key);
        if(!existing.isEmpty()){
            var old=existing.getFirst();require(kind.equals(old.get("kind"))&&reference.equals(old.get("reference_id")),"Mã yêu cầu đã được dùng cho lượt khác");return view(u,((Number)old.get("id")).longValue());
        }
        if(kind.endsWith("TEST")){
            String condition=kind.equals("LEVEL_TEST")?"m.level_id=?":"m.id=?";
            var counts=db.queryForMap("select count(*) as total,count(p.completed_at) as completed from study_lessons l join study_modules m on m.id=l.module_id left join study_progress p on p.lesson_id=l.id and p.user_id=? where "+condition,u.id,reference);
            require(((Number)counts.get("total")).intValue()>0&&((Number)counts.get("total")).intValue()==((Number)counts.get("completed")).intValue(),"Hoàn thành các bài học trước khi làm kiểm tra");
            if(kind.equals("LEVEL_TEST"))require(firstUnfinishedModule(u.id,Integer.parseInt(reference))==null,"Vượt kiểm tra tất cả module trước khi kiểm tra level");
        }
        if(kind.equals("LESSON"))db.update("insert ignore into study_progress(user_id,lesson_id) values(?,?)",u.id,reference);
        return create(u,kind,reference,key);
    }
    private Object create(User u,String kind,String reference,String key){
        if(kind.endsWith("TEST"))return createExam(u,kind,reference,key);
        String condition=kind.equals("LESSON")?"l.id=?":kind.startsWith("MODULE_")?"m.id=?":"m.level_id=?";
        var rows=db.queryForList("select l.id,l.title,l.questions_json,m.id as module_id,m.title as module_title,m.ordinal_no as module_ordinal from study_lessons l join study_modules m on m.id=l.module_id where l.published=true and "+condition+" order by m.ordinal_no,l.ordinal_no",reference);
        if(kind.equals("LEVEL_REVIEW")){
            var barrier=firstUnfinishedModule(u.id,Integer.parseInt(reference));
            if(barrier!=null)rows.removeIf(row->((Number)row.get("module_ordinal")).intValue()>barrier.ordinal());
        }
        var banks=new LinkedHashMap<String,List<JsonNode>>();
        var blocked=new HashSet<String>();
        for(var b:db.queryForList("select lesson_id,question_id from study_question_blocks"))blocked.add(b.get("lesson_id")+":"+b.get("question_id"));
        for(var row:rows){for(var question:parse(row.get("questions_json"))){if(blocked.contains(row.get("id")+":"+question.path("id").asText()))continue;var q=question.deepCopy();((ObjectNode)q).put("lessonId",row.get("id").toString());((ObjectNode)q).put("lessonTitle",row.get("title").toString());((ObjectNode)q).put("moduleTitle",row.get("module_title").toString());banks.computeIfAbsent(row.get("module_id").toString(),k->new ArrayList<>()).add(q);}}
        List<JsonNode> selected=kind.equals("LESSON")?banks.values().stream().flatMap(Collection::stream).toList():selectBalanced(banks,10);
        require(!selected.isEmpty(),"Bộ câu hỏi chưa đủ để bắt đầu");
        return createSnapshot(u,kind,reference,key,selected);
    }
    private Object createExam(User u,String kind,String reference,String key){
        String condition=kind.equals("LEVEL_TEST")?"m.level_id=?":"m.id=?";
        var rows=db.queryForList("select q.id,q.module_id,q.prompt,q.options_json,q.correct_option,q.explanation,m.title as module_title from study_exam_questions q join study_modules m on m.id=q.module_id where q.active=true and "+condition+" order by m.ordinal_no,q.id",reference);
        var banks=new LinkedHashMap<String,List<JsonNode>>();
        for(var row:rows){
            var q=json.createObjectNode().put("id",row.get("id").toString()).put("prompt",row.get("prompt").toString())
                .put("correctOption",row.get("correct_option").toString()).put("explanation",row.get("explanation").toString())
                .put("moduleId",row.get("module_id").toString()).put("moduleTitle",row.get("module_title").toString());
            q.set("options",parse(row.get("options_json")));
            banks.computeIfAbsent(row.get("module_id").toString(),k->new ArrayList<>()).add(q);
        }
        var selected=selectBalanced(banks,10);
        int expectedModules=kind.equals("LEVEL_TEST")?db.queryForObject("select count(*) from study_modules where level_id=?",Integer.class,reference):1;
        require(banks.size()==expectedModules&&selected.size()==10,"Ngân hàng kiểm tra cần đủ 10 câu mới và bao phủ các module để bắt đầu; không dùng câu luyện tập thay thế");
        return createSnapshot(u,kind,reference,key,selected);
    }
    private Object createSnapshot(User u,String kind,String reference,String key,List<JsonNode> selected){
        int required=requiredCorrect(kind,selected.size());var snapshot=json.createArrayNode();selected.forEach(snapshot::add);
        var keys=new GeneratedKeyHolder();db.update(c->{var s=c.prepareStatement("insert into study_attempts(user_id,kind,reference_id,request_key,required_correct,questions_json,answers_json) values(?,?,?,?,?,?,'{}')",Statement.RETURN_GENERATED_KEYS);s.setLong(1,u.id);s.setString(2,kind);s.setString(3,reference);s.setString(4,key);s.setInt(5,required);s.setString(6,snapshot.toString());return s;},keys);
        return view(u,Objects.requireNonNull(keys.getKey()).longValue());
    }
    /** Cover every module first, then distribute the remaining slots round-robin. */
    static List<JsonNode> selectBalanced(Map<String,List<JsonNode>> banks,int limit){
        var groups=new ArrayList<List<JsonNode>>();for(var bank:banks.values()){var copy=new ArrayList<>(bank);Collections.shuffle(copy);groups.add(copy);}
        Collections.shuffle(groups);var selected=new ArrayList<JsonNode>();int index=0;
        while(selected.size()<limit){boolean added=false;for(var group:groups)if(index<group.size()&&selected.size()<limit){selected.add(group.get(index));added=true;}if(!added)break;index++;}
        Collections.shuffle(selected);return selected;
    }
    private Map<String,Object> attempt(User u,long id,boolean lock){
        var rows=db.queryForList("select * from study_attempts where id=? and user_id=?"+(lock?" for update":""),id,u.id);
        if(rows.isEmpty())throw new ApiException(HttpStatus.NOT_FOUND,"ATTEMPT_NOT_FOUND","Không tìm thấy lượt làm của bạn");
        var row=rows.getFirst();String kind=row.get("kind").toString(),reference=row.get("reference_id").toString();referenceUnlocked(u.id,kind,reference);
        // A review created before sequential locking must not reveal a later module.
        if(kind.equals("LEVEL_REVIEW")){
            var barrier=firstUnfinishedModule(u.id,Integer.parseInt(reference));
            if(barrier!=null){
                var allowed=new HashSet<>(db.queryForList("select l.id from study_lessons l join study_modules m on m.id=l.module_id where m.level_id=? and m.ordinal_no<=?",String.class,Integer.parseInt(reference),barrier.ordinal()));
                for(var question:parse(row.get("questions_json")))if(!allowed.contains(question.path("lessonId").asText()))
                    throw new ApiException(HttpStatus.FORBIDDEN,"MODULE_LOCKED","Lượt ôn tập có nội dung thuộc module chưa mở. Hãy tạo lượt ôn tập mới cho các module đã mở.");
            }
        }
        return row;
    }
    private Object view(User u,long id){
        var a=attempt(u,id,false);boolean submitted=!"IN_PROGRESS".equals(a.get("status"));var qs=parse(a.get("questions_json"));var answers=parse(a.get("answers_json"));var safe=json.createArrayNode();
        for(var question:qs){var q=(ObjectNode)question.deepCopy();if(submitted){var answer=answers.path(q.path("id").asText());q.put("answer",answer.asText());q.put("correct",answer.asText().equals(q.path("correctOption").asText()));}else{q.remove("correctOption");q.remove("explanation");}safe.add(q);}
        var out=new LinkedHashMap<String,Object>();String kind=a.get("kind").toString(),reference=a.get("reference_id").toString();
        out.put("id",id);out.put("kind",kind);out.put("referenceId",reference);out.put("status",a.get("status"));out.put("levelId",levelOf(kind,reference));out.put("questions",safe);out.put("answers",answers);out.put("requiredCorrect",a.get("required_correct"));out.put("totalQuestions",qs.size());
        out.put("requiredCorrect",requiredCorrect(kind,qs.size()));
        if(submitted){out.put("correctCount",a.get("correct_count"));out.put("awardedXp",a.getOrDefault("awarded_xp",0));}
        String title=kind.equals("LESSON")?lessonRow(reference).get("title").toString():kind.startsWith("MODULE_")?moduleRow(reference).get("title").toString():db.queryForObject("select title from study_levels where id=?",String.class,Integer.parseInt(reference));out.put("title",title);return out;
    }
    private Object save(User u,JsonNode p,boolean submit){
        long id=attemptId(p);var a=attempt(u,id,true);if(!"IN_PROGRESS".equals(a.get("status")))return view(u,id);
        JsonNode questions=parse(a.get("questions_json")),answers=validateAnswers(questions,p.path("answers"),submit);
        if(!submit){db.update("update study_attempts set answers_json=? where id=?",answers.toString(),id);return view(u,id);}
        String kind=a.get("kind").toString();int correct=score(questions,answers),required=requiredCorrect(kind,questions.size());boolean passed=correct>=required;
        String status=kind.endsWith("TEST")?(passed?"PASSED":"FAILED"):kind.equals("LESSON")?(passed?"COMPLETED":"FAILED"):"COMPLETED";
        db.update("update study_attempts set answers_json=?,correct_count=?,status=?,submitted_at=current_timestamp(6) where id=?",answers.toString(),correct,status,id);
        if(kind.equals("LESSON")&&passed)db.update("insert into study_progress(user_id,lesson_id,completed_at) values(?,?,current_timestamp(6)) on duplicate key update completed_at=coalesce(completed_at,values(completed_at))",u.id,a.get("reference_id"));
        if(kind.equals("MODULE_TEST")&&passed)db.update("insert ignore into study_module_mastery(user_id,module_id) values(?,?)",u.id,a.get("reference_id"));
        if(kind.equals("LEVEL_TEST")&&status.equals("PASSED"))placement.advance(u.id,Integer.parseInt(a.get("reference_id").toString())+1);
        dailyQuests.recordProgress(u.id,"CORRECT_COUNT",correct);
        int streak=0,best=0;
        for(var question:questions){
            streak=question.path("correctOption").asText().equals(answers.path(question.path("id").asText()).asText())?streak+1:0;
            best=Math.max(best,streak);
        }
        dailyQuests.recordProgress(u.id,"STREAK_CORRECT",best);
        if(kind.endsWith("REVIEW")){
            dailyQuests.recordProgress(u.id,"PRACTICE_COUNT",1);
            if(questions.size()>=10&&correct==questions.size())dailyQuests.recordProgress(u.id,"PERFECT_PRACTICE",1);
        }
        if(correct>=masteryThreshold(questions.size())){
            int awarded=rewards.award(u.id,kind,a.get("reference_id").toString(),id);
            db.update("update study_attempts set awarded_xp=? where id=?",awarded,id);
            dailyQuests.recordLearningDay(u.id);
            dailyQuests.recordProgress(u.id,"QUALITY_STUDY",1);
        }
        events.publishEvent(new ProgressChanged(u.username));return view(u,id);
    }
    static int masteryThreshold(int count){return (count*4+4)/5;}
    static int requiredCorrect(String kind,int count){return kind.equals("LESSON")||kind.endsWith("TEST")?masteryThreshold(count):0;}
    ObjectNode validateAnswers(JsonNode questions,JsonNode input,boolean complete){
        require(input.isObject(),"Câu trả lời không hợp lệ");var clean=json.createObjectNode();var validIds=new HashSet<String>();
        for(var q:questions){String id=q.path("id").asText();validIds.add(id);var answer=input.get(id);if(answer!=null){require(answer.isTextual()&&answer.asText().matches("[ABCD]"),"Đáp án không hợp lệ");clean.put(id,answer.asText());}else require(!complete,"Hãy trả lời đầy đủ các câu hỏi trước khi nộp");}
        input.fieldNames().forEachRemaining(id->{require(validIds.contains(id),"Câu hỏi không thuộc lượt làm này");});return clean;
    }
    static int score(JsonNode questions,JsonNode answers){int correct=0;for(var q:questions)if(q.path("correctOption").asText().equals(answers.path(q.path("id").asText()).asText()))correct++;return correct;}
}
