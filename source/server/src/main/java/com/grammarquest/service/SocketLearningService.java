package com.grammarquest.service;
import com.grammarquest.repository.TopicRepository;
import com.grammarquest.repository.LessonRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

@Service
public class SocketLearningService {
    private final LearningService learning;
    private final TopicRepository topics;
    private final LessonRepository lessons;
    private final AssignmentAnswerGuard guard;
    private final org.springframework.jdbc.core.JdbcTemplate db;
    public SocketLearningService(LearningService learning, TopicRepository topics, LessonRepository lessons, AssignmentAnswerGuard guard,org.springframework.jdbc.core.JdbcTemplate db) {
        this.learning=learning; this.topics=topics; this.lessons=lessons; this.guard=guard; this.db=db;
    }
    public LearningService.AttemptView start(String username,String kind,Long lessonId) { return learning.start(username,kind,lessonId); }
    public LearningService.AttemptView attempt(String username,long id) { return learning.get(username,id); }
    public LearningService.AnswerView answer(String username,long id,int ordinal,String option) {
        learning.get(username,id); // Xác minh sở hữu trước khi kiểm tra hạn nộp.
        guard.check(id);
        return learning.answer(username,id,ordinal,option);
    }
    public record Activity(String action, String topic, String lesson) {}
    @Transactional(readOnly=true)
    public Activity activity(String username,String path,String topicSlug) {
        if(path.matches("/attempts/[0-9]+(/result)?")) {
            long id=Long.parseLong(path.split("/")[2]);
            var attempt=learning.get(username,id); // Kiểm tra lượt làm thuộc đúng tài khoản.
            var lesson=attempt.lessonId()==null?null:lessons.findById(attempt.lessonId()).orElse(null);
            String slug=lesson==null?"conditionals":lesson.topicSlug;
            String topic=topics.findById(slug).map(t->t.title).orElse(slug);
            String action=path.endsWith("/result")||!"IN_PROGRESS".equals(attempt.status()) ? "VIEWING_RESULT" :
                attempt.kind().equals("PRACTICE")?"PRACTICING":attempt.kind().equals("CHAPTER_BOSS")?"CHAPTER_BOSS":"LESSON_BOSS";
            return new Activity(action,topic,lesson==null?"":lesson.title);
        }
        if(path.matches("/lessons/[0-9]+")) {
            var lesson=learning.lesson(username,Long.parseLong(path.split("/")[2]));
            return new Activity("READING_LESSON_"+lesson.id(),lesson.topicTitle(),lesson.title());
        }
        if(path.equals("/roadmap")) {
            var visible=learning.listTopics(username);
            String topic=visible.stream().filter(t->t.slug().equals(topicSlug)&&t.unlocked())
                .findFirst().or(()->visible.stream().filter(LearningService.TopicView::unlocked).findFirst())
                .map(LearningService.TopicView::title).orElse("");
            return new Activity("VIEWING_ROADMAP",topic,"");
        }
        if(path.startsWith("/classes")) return new Activity("IN_CLASSROOM","","");
        if(path.equals("/arena")) {
            var rooms=db.queryForList("select r.id,r.status from arena_rooms r join users u on (r.host_id=u.id or r.guest_id=u.id) where u.username=? and r.status in ('WAITING','IN_PROGRESS') order by r.id desc limit 1",username);
            if(!rooms.isEmpty()) return new Activity("IN_PROGRESS".equals(rooms.getFirst().get("status"))?"PLAYING_PVP":"PVP_LOBBY","Phòng #"+rooms.getFirst().get("id"),"");
            return new Activity("PVP_LOBBY","","");
        }
        return new Activity(path.equals("/practice")?"CHOOSING_PRACTICE":path.equals("/dashboard")?"IN_LOBBY":"VIEWING_PAGE","","");
    }
    public record RoadmapTopic(LearningService.TopicView topic, List<LearningService.LessonView> lessons) {}
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public List<RoadmapTopic> roadmap(String username) {
        var data=learning.roadmap(username);
        var grouped=data.lessons().stream().collect(java.util.stream.Collectors.groupingBy(LearningService.LessonView::topicSlug));
        return data.topics().stream().map(t->new RoadmapTopic(t,grouped.getOrDefault(t.slug(),List.of()).stream().sorted(Comparator.comparingInt(LearningService.LessonView::ordinalNo)).toList())).toList();
    }

    public LearningService.LessonView theory(String username, long id) { return learning.lesson(username,id); }
}
