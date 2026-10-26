package com.grammarquest.service;

import com.grammarquest.util.BossRules;
import com.grammarquest.entity.*;
import com.grammarquest.repository.*;
import com.grammarquest.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;

@Service
public class LearningService {
    @org.springframework.beans.factory.annotation.Autowired
    private PlacementService placement;
    @org.springframework.beans.factory.annotation.Autowired
    private StudyRewardService studyRewards;
    private final UserRepository users;
    private final LessonRepository lessons;
    private final QuestionRepository questions;
    private final AttemptRepository attempts;
    private final AttemptItemRepository items;
    private final XpLedgerRepository xp;
    private final JdbcTemplate db;
    private final DailyQuestService dailyQuests;
    public LearningService(UserRepository users, LessonRepository lessons, QuestionRepository questions,
                           AttemptRepository attempts, AttemptItemRepository items, XpLedgerRepository xp, JdbcTemplate db) {
        this.users=users; this.lessons=lessons; this.questions=questions; this.attempts=attempts; this.items=items; this.xp=xp; this.db=db;
        this.dailyQuests=null;
    }
    @org.springframework.beans.factory.annotation.Autowired
    public LearningService(UserRepository users, LessonRepository lessons, QuestionRepository questions,
                           AttemptRepository attempts, AttemptItemRepository items, XpLedgerRepository xp, JdbcTemplate db,
                           DailyQuestService dailyQuests) {
        this.users=users; this.lessons=lessons; this.questions=questions; this.attempts=attempts; this.items=items; this.xp=xp; this.db=db;
        this.dailyQuests=dailyQuests;
    }
    public record LessonView(Long id, String topicSlug, String topicTitle, int topicSortOrder, String title, String summary, String theory, int ordinalNo,
                             String difficulty, String status, boolean chapterCompleted) {}
    public record QuestionView(int ordinalNo, String questionType, String prompt, List<String> options, String answer,
                               Boolean correct, String correctOption, String explanation) {}
    public record AttemptView(Long id, String kind, String status, Long lessonId, int totalQuestions,
                              int requiredCorrect, int correctCount, double bossHp, int awardedXp,
                              List<QuestionView> questions) {}
    public record AnswerView(int ordinalNo, boolean correct, String correctOption, String explanation,
                             int correctCount, double bossHp, boolean finished, boolean won, int awardedXp) {}
    public record TopicView(String slug, String title, String description, String outcome, int sortOrder,
                            String planetStyle, boolean unlocked, boolean chapterCompleted, int lessonCount) {}

    private User current(String username) {
        User user=users.findByUsernameIgnoreCase(username).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED,"UNAUTHENTICATED","Vui lòng đăng nhập"));
        if(user.locked) throw new ApiException(HttpStatus.FORBIDDEN,"ACCOUNT_LOCKED","Tài khoản đã bị khóa");
        if(user.role.equals("ADMIN")) throw new ApiException(HttpStatus.FORBIDDEN,"ADMIN_ONLY_MANAGEMENT","Quản trị viên chỉ sử dụng chức năng quản trị");
        if(user.placementEligible&&user.role.equals("LEARNER"))placement.requireCompleted(user);
        return user;
    }
    private User learner(String username) {
        User user=current(username);
        if(!user.role.equals("LEARNER"))
            throw new ApiException(HttpStatus.FORBIDDEN,"LEARNER_ONLY","Chỉ học viên được tham gia học tập và làm bài");
        return user;
    }
    private boolean passed(Long userId, String kind, Long lessonId) {
        return attempts.findByUserIdAndStatusAndKindOrderByCompletedAtDesc(userId,"WON",kind)
            .stream().anyMatch(a -> Objects.equals(a.lessonId,lessonId));
    }
    private String chapterRewardKey(String topicSlug) {
        return "CHAPTER_BOSS:"+(topicSlug.equals("conditionals")?"chapter":topicSlug);
    }
    private boolean chapterPassed(Long userId, String topicSlug) {
        return xp.existsByUserIdAndRewardKey(userId,chapterRewardKey(topicSlug));
    }
    private List<String> publishedTopics() {
        return db.queryForList("select t.slug from topics t where t.published=true and exists (select 1 from lessons l where l.topic_slug=t.slug and l.published=true) order by t.sort_order,t.slug",String.class);
    }
    private boolean topicUnlocked(User user, String slug) {
        List<String> ordered=publishedTopics();
        int position=ordered.indexOf(slug);
        return position>=0 && (position==0 || chapterPassed(user.id,ordered.get(position-1)));
    }
    private String topicTitle(String slug) {
        return db.queryForObject("select title from topics where slug=?",String.class,slug);
    }
    private int topicSortOrder(String slug) {
        return db.queryForObject("select sort_order from topics where slug=?",Integer.class,slug);
    }
    public record RoadmapData(List<TopicView> topics,List<LessonView> lessons) {}
    // One request-local snapshot: fixed query count, no DB calls inside lesson/topic loops.
    private RoadmapData buildRoadmap(User user) {
        var topicRows=db.queryForList("select slug,title,description,outcome,sort_order as sortOrder,planet_style as planetStyle from topics where published=true order by sort_order,slug");
        var byTopic=lessons.roadmapLessons().stream().collect(java.util.stream.Collectors.groupingBy(LessonOutline::topicSlug));
        var completed=new HashSet<>(attempts.completedLessonIds(user.id));
        var rewards=new HashSet<>(xp.rewardKeys(user.id));
        List<TopicView> topicViews=new ArrayList<>();List<LessonView> lessonViews=new ArrayList<>();
        String previousTopic=null;
        for(var row:topicRows){
            String slug=(String)row.get("slug");var entries=byTopic.getOrDefault(slug,List.of());
            if(entries.isEmpty())continue;
            boolean open=previousTopic==null||rewards.contains(chapterRewardKey(previousTopic));
            boolean chapterDone=rewards.contains(chapterRewardKey(slug));
            String title=(String)row.get("title");int order=((Number)row.get("sortOrder")).intValue();
            topicViews.add(new TopicView(slug,title,(String)row.get("description"),(String)row.get("outcome"),order,(String)row.get("planetStyle"),open,chapterDone,entries.size()));
            var ordinalIndex=new TreeMap<Integer,LessonOutline>();
            entries.forEach(l->ordinalIndex.putIfAbsent(l.ordinalNo(),l));
            for(var l:entries){
                var previous=ordinalIndex.lowerEntry(l.ordinalNo());
                boolean available=open&&(previous==null||completed.contains(previous.getValue().id()));
                lessonViews.add(new LessonView(l.id(),slug,title,order,l.title(),l.summary(),null,l.ordinalNo(),l.difficulty(),completed.contains(l.id())?"COMPLETED":available?"AVAILABLE":"LOCKED",chapterDone));
            }
            previousTopic=slug;
        }
        lessonViews.sort(Comparator.comparingInt(LessonView::ordinalNo));
        return new RoadmapData(List.copyOf(topicViews),List.copyOf(lessonViews));
    }
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public RoadmapData roadmap(String username){return buildRoadmap(learner(username));}
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public List<TopicView> listTopics(String username){return buildRoadmap(learner(username)).topics();}
    private boolean unlocked(User user, Lesson lesson) {
        if(!topicUnlocked(user,lesson.topicSlug)) return false;
        return lessons.findByPublishedTrueOrderByOrdinalNoAsc().stream()
            .filter(l -> Objects.equals(l.topicSlug,lesson.topicSlug)&&l.ordinalNo<lesson.ordinalNo)
            .max(Comparator.comparingInt(l -> l.ordinalNo))
            .map(prev -> passed(user.id,"LESSON_BOSS",prev.id)).orElse(true);
    }
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public List<LessonView> listLessons(String username){return buildRoadmap(current(username)).lessons();}
    @Transactional(readOnly=true)
    public LessonView lesson(String username, Long id) {
        User user=learner(username);
        Lesson lesson=lessons.findById(id).filter(l -> l.published && publishedTopics().contains(l.topicSlug))
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"LESSON_NOT_FOUND","Không tìm thấy bài học"));
        if(!unlocked(user,lesson)) throw new ApiException(HttpStatus.FORBIDDEN,"LESSON_LOCKED","Hãy hoàn thành boss bài trước");
        String status=passed(user.id,"LESSON_BOSS",id)?"COMPLETED":"AVAILABLE";
        return new LessonView(lesson.id,lesson.topicSlug,topicTitle(lesson.topicSlug),topicSortOrder(lesson.topicSlug),lesson.title,lesson.summary,lesson.theory,lesson.ordinalNo,
                              lesson.difficulty,status,chapterPassed(user.id,lesson.topicSlug));
    }
    @Transactional
    public AttemptView start(String username, String kind, Long lessonId) {
        return startInternal(username,kind,lessonId,false);
    }
    @Transactional
    public AttemptView startAssignment(String username, Long lessonId, Long teacherId) {
        return startInternal(username,"PRACTICE",lessonId,true,teacherId);
    }
    private AttemptView startInternal(String username, String kind, Long lessonId, boolean assignment) {
        return startInternal(username,kind,lessonId,assignment,null);
    }
    private AttemptView startInternal(String username, String kind, Long lessonId, boolean assignment, Long teacherId) {
        User user=learner(username);
        if(!Set.of("PRACTICE","LESSON_BOSS","CHAPTER_BOSS").contains(kind))
            throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_KIND","Loại lượt làm không hợp lệ");
        Lesson lesson=null;
        String chapterTopic=null;
        if(!kind.equals("CHAPTER_BOSS")) {
            if(lessonId==null) throw new ApiException(HttpStatus.BAD_REQUEST,"LESSON_REQUIRED","Cần chọn bài học");
            lesson=lessons.findById(lessonId)
                .filter(l -> l.published && publishedTopics().contains(l.topicSlug)).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"LESSON_NOT_FOUND","Không tìm thấy bài học"));
            if(!assignment&&!unlocked(user,lesson)) throw new ApiException(HttpStatus.FORBIDDEN,"LESSON_LOCKED","Hãy hoàn thành boss bài trước");
        } else {
            chapterTopic=lessonId==null?"conditionals":lessons.findById(lessonId).filter(l -> l.published)
                .map(l -> l.topicSlug).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"LESSON_NOT_FOUND","Không tìm thấy bài học"));
            if(!topicUnlocked(user,chapterTopic)) throw new ApiException(HttpStatus.FORBIDDEN,"CHAPTER_LOCKED","Chủ đề này chưa mở khóa");
            String topic=chapterTopic;
            List<Lesson> chapterLessons=lessons.findByPublishedTrueOrderByOrdinalNoAsc().stream()
                .filter(l -> l.topicSlug.equals(topic)).toList();
            if(chapterLessons.isEmpty()||chapterLessons.stream().anyMatch(l -> !passed(user.id,"LESSON_BOSS",l.id)))
                throw new ApiException(HttpStatus.FORBIDDEN,"CHAPTER_LOCKED","Hãy hoàn thành tất cả boss bài học của chủ đề trước");
        }
        int count=BossRules.questionCount(kind);
        List<Question> bank=new ArrayList<>();
        if(assignment&&teacherId!=null) {
            List<Question> owned=new ArrayList<>(questions.findByLessonIdAndOwnerIdAndTeacherActiveTrue(lesson.id,teacherId));
            Collections.shuffle(owned);
            bank.addAll(owned);
        }
        Set<Long> chapterLessons=new HashSet<>();
        if(kind.equals("CHAPTER_BOSS")) {
            String topic=chapterTopic;
            lessons.findByPublishedTrueOrderByOrdinalNoAsc().stream().filter(l -> l.topicSlug.equals(topic)).forEach(l -> chapterLessons.add(l.id));
        }
        List<Question> common=new ArrayList<>(kind.equals("CHAPTER_BOSS")
            ? questions.findByPublishedTrue().stream().filter(q -> chapterLessons.contains(q.lessonId) && (q.questionType == null || q.questionType.equals("MCQ"))).toList()
            : questions.findByLessonIdAndPublishedTrue(lesson.id).stream().filter(q -> q.questionType == null || q.questionType.equals("MCQ")).toList());
        Collections.shuffle(common);
        bank.addAll(common);
        if(bank.size()<count) throw new ApiException(HttpStatus.CONFLICT,"QUESTION_BANK_INCOMPLETE","Bộ câu hỏi chưa đủ để bắt đầu");
        Attempt a=attempts.save(new Attempt(user.id,lessonId,kind,count,BossRules.requiredCorrect(kind)));
        List<AttemptItem> snapshots=new ArrayList<>();
        for(int i=0;i<count;i++) snapshots.add(new AttemptItem(a.id,i+1,bank.get(i)));
        items.saveAll(snapshots);
        return view(a,snapshots);
    }
    @Transactional(readOnly=true)
    public AttemptView get(String username, Long id) {
        User user=learner(username);
        Attempt a=attempts.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"ATTEMPT_NOT_FOUND","Không tìm thấy lượt làm"));
        if(!a.userId.equals(user.id)) throw new ApiException(HttpStatus.FORBIDDEN,"FORBIDDEN","Không thể xem lượt làm này");
        return view(a,items.findByAttemptIdOrderByOrdinalNoAsc(id));
    }
    private AttemptView view(Attempt a, List<AttemptItem> entries) {
        boolean finished=!a.status.equals("IN_PROGRESS");
        List<QuestionView> visible=entries.stream().map(i -> new QuestionView(i.ordinalNo,type(i),i.prompt,
            textQuestion(i)?List.of():List.of(i.optionA,i.optionB,i.optionC,i.optionD),answerOf(i),
            answerOf(i)==null?null:correct(i),
            finished||(a.kind.equals("PRACTICE")&&answerOf(i)!=null)?correctAnswer(i):null,
            finished||(a.kind.equals("PRACTICE")&&answerOf(i)!=null)?i.explanation:null)).toList();
        return new AttemptView(a.id,a.kind,a.status,a.lessonId,a.totalQuestions,a.requiredCorrect,a.correctCount,
            BossRules.hp(a.kind,a.correctCount),a.awardedXp,visible);
    }
    @Transactional
    public AnswerView answer(String username, Long id, int ordinal, String option) {
        User user=learner(username);
        Attempt a=attempts.findWithLockById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"ATTEMPT_NOT_FOUND","Không tìm thấy lượt làm"));
        if(!a.userId.equals(user.id)) throw new ApiException(HttpStatus.FORBIDDEN,"FORBIDDEN","Không thể làm lượt này");
        List<AttemptItem> entries=items.findByAttemptIdOrderByOrdinalNoAsc(id);
        if(ordinal<1||ordinal>entries.size()) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_QUESTION","Số câu không hợp lệ");
        AttemptItem item=entries.get(ordinal-1);
        if(textQuestion(item)) {
            if(option==null||option.isBlank()||option.length()>255) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_ANSWER","Câu trả lời phải có từ 1 đến 255 ký tự");
            option=option.trim();
        } else if(option==null||!option.matches("[ABCD]")) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_OPTION","Đáp án phải là A, B, C hoặc D");
        if(answerOf(item)!=null && !answerOf(item).equals(option)) throw new ApiException(HttpStatus.CONFLICT,"ALREADY_ANSWERED","Câu này đã được trả lời");
        if(answerOf(item)==null) {
            if(!a.status.equals("IN_PROGRESS")) throw new ApiException(HttpStatus.CONFLICT,"ATTEMPT_FINISHED","Lượt làm đã kết thúc");
            if(entries.stream().anyMatch(i -> i.ordinalNo<ordinal && answerOf(i)==null))
                throw new ApiException(HttpStatus.CONFLICT,"ANSWER_ORDER","Hãy trả lời theo thứ tự");
            if(textQuestion(item)) item.textAnswer=option; else item.answer=option;
            item.answeredAt=Instant.now();
            if(correct(item)) {
                a.correctCount++;
                if (dailyQuests != null) {
                    dailyQuests.recordProgress(user.id, "CORRECT_COUNT", 1);
                    if (a.kind.equals("LESSON_BOSS") || a.kind.equals("CHAPTER_BOSS")) {
                        int damage = (int)Math.floor(BossRules.hp(a.kind, a.correctCount - 1))
                            - (int)Math.floor(BossRules.hp(a.kind, a.correctCount));
                        dailyQuests.recordProgress(user.id, "BOSS_DAMAGE", damage);
                    }
                    int currentStreak = 0;
                    for (int idx = 0; idx < ordinal; idx++) {
                        if (correct(entries.get(idx))) currentStreak++;
                        else currentStreak = 0;
                    }
                    if (currentStreak >= 5) {
                        dailyQuests.recordProgress(user.id, "STREAK_CORRECT", currentStreak);
                    }
                }
            }
            if(entries.stream().allMatch(i -> answerOf(i)!=null)) complete(a);
        }
        boolean reveal=a.kind.equals("PRACTICE")||!a.status.equals("IN_PROGRESS");
        return new AnswerView(ordinal,correct(item),reveal?correctAnswer(item):null,reveal?item.explanation:null,
            a.correctCount,BossRules.hp(a.kind,a.correctCount),!a.status.equals("IN_PROGRESS"),a.status.equals("WON"),a.awardedXp);
    }
    private String type(AttemptItem item) { return item.questionType==null?"MCQ":item.questionType; }
    private boolean textQuestion(AttemptItem item) { return !"MCQ".equals(type(item)); }
    private String answerOf(AttemptItem item) { return textQuestion(item)?item.textAnswer:item.answer; }
    private String correctAnswer(AttemptItem item) { return textQuestion(item)?item.acceptedAnswer:item.correctOption; }
    private String normalize(String value) { return value==null?"":value.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+"," ").replaceAll("[.!?]+$","").trim(); }
    private boolean correct(AttemptItem item) { return textQuestion(item)?normalize(item.textAnswer).equals(normalize(item.acceptedAnswer)):Objects.equals(item.answer,item.correctOption); }
    private void complete(Attempt a) {
        boolean won=a.kind.equals("PRACTICE")||a.correctCount>=a.requiredCorrect;
        a.status=won?"WON":"LOST"; a.completedAt=Instant.now();
        if (dailyQuests != null) {
            if(a.correctCount>=((a.totalQuestions*4+4)/5)) {
                dailyQuests.recordLearningDay(a.userId);
                dailyQuests.recordProgress(a.userId,"QUALITY_STUDY",1);
            }
            if (a.kind.equals("PRACTICE")) {
                dailyQuests.recordProgress(a.userId, "PRACTICE_COUNT", 1);
                if (a.correctCount == a.totalQuestions) {
                    dailyQuests.recordProgress(a.userId, "PERFECT_PRACTICE", 1);
                }
            } else if (won && (a.kind.equals("LESSON_BOSS") || a.kind.equals("CHAPTER_BOSS"))) {
                dailyQuests.recordProgress(a.userId, "BOSS_WIN", 1);
            }
            try {
                Integer count = db.queryForObject("select count(1) from assignment_attempts where attempt_id=?", Integer.class, a.id);
                if (count != null && count > 0) {
                    dailyQuests.recordProgress(a.userId, "CLASS_ASSIGNMENT", 1);
                }
            } catch (Exception ignored) {}
        }
        if(a.kind.equals("PRACTICE")&&a.correctCount>=((a.totalQuestions*4+4)/5)&&studyRewards!=null)
            a.awardedXp=studyRewards.award(a.userId,"PRACTICE","",a.id);
        if(won&&!a.kind.equals("PRACTICE")) {
            String key=a.kind.equals("CHAPTER_BOSS")
                ? chapterRewardKey(a.lessonId==null?"conditionals":lessons.findById(a.lessonId).orElseThrow().topicSlug)
                : a.kind+":"+a.lessonId;
            User user=users.findWithLockById(a.userId).orElseThrow();
            if(!xp.existsByUserIdAndRewardKey(user.id,key)) {
                a.awardedXp=BossRules.firstWinXp(a.kind);
                xp.save(new XpLedger(user.id,key,a.awardedXp));
                user.totalXp+=a.awardedXp;
            }
        }
    }
    @Transactional(readOnly=true)
    public List<AttemptView> history(String username) {
        User user=learner(username);
        return attempts.findTop20ByUserIdOrderByIdDesc(user.id).stream()
            .map(a -> view(a,items.findByAttemptIdOrderByOrdinalNoAsc(a.id))).toList();
    }
}
