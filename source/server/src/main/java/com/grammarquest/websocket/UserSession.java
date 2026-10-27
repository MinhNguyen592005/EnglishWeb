package com.grammarquest.websocket;

/** Trạng thái client trên RAM, thu hồi khi socket đóng. */
public class UserSession {

    // Cấp phát tài nguyên: mỗi socket giữ tối đa một bộ đề/trạng thái lượt làm trên RAM.
    private com.grammarquest.service.LearningService.AttemptView activeAttempt;
    private final long connectedAt = System.currentTimeMillis();
    private long attemptAllocatedAt, examAllocatedAt, arenaAllocatedAt, messagesReceived, messagesSent;

    public synchronized void received() {
        messagesReceived++;
    }

    public synchronized void sent() {
        messagesSent++;
    }

    private Long activeExamId;
    private Long activeArenaId;
    private int allocatedArenaQuestions;

    public synchronized void allocateArena(Long id, int count) {
        if (!java.util.Objects.equals(activeArenaId, id)) arenaAllocatedAt =
            id == null ? 0 : System.currentTimeMillis();
        activeArenaId = id;
        allocatedArenaQuestions = count;
    }

    private int allocatedExamQuestions;

    public synchronized void allocateExam(Long id, int count) {
        if (!java.util.Objects.equals(activeExamId, id)) examAllocatedAt =
            id == null ? 0 : System.currentTimeMillis();
        activeExamId = id;
        allocatedExamQuestions = count;
    }

    public synchronized void allocateAttempt(
        com.grammarquest.service.LearningService.AttemptView attempt
    ) {
        if (!java.util.Objects.equals(activeAttemptId(), attempt.id())) attemptAllocatedAt =
            System.currentTimeMillis();
        activeAttempt = "IN_PROGRESS".equals(attempt.status()) ? attempt : null;
    }

    public synchronized void releaseAttempt() {
        activeAttempt = null;
    } // Thu hồi tài nguyên bộ đề.

    public synchronized Long activeAttemptId() {
        return activeAttempt == null ? null : activeAttempt.id();
    }

    public final Long userId;
    public final String username;
    private volatile String currentActivity = "CONNECTED";
    private String page = "";
    private String topic = "";
    private String lesson = "";
    private long lastInteractionAt = System.currentTimeMillis();
    private boolean idleReminderSent;

    public synchronized boolean claimIdleReminder(long now) {
        if (idleReminderSent || now - lastInteractionAt < 120_000) return false;
        idleReminderSent = true;
        return true;
    }

    private volatile long lastPongAt = System.currentTimeMillis();

    public void pong() {
        lastPongAt = System.currentTimeMillis();
    }

    public long lastPongAt() {
        return lastPongAt;
    }

    public UserSession(Long userId, String username) {
        this.userId = userId;
        this.username = username;
    }

    public String getCurrentActivity() {
        return currentActivity;
    }

    public synchronized void setCurrentActivity(String activity) {
        currentActivity = activity;
    }

    public synchronized void update(String activity, String page, String topic, String lesson) {
        this.currentActivity = activity;
        this.page = page;
        this.topic = topic;
        this.lesson = lesson;
        touch();
    }

    public synchronized void touch() {
        lastInteractionAt = System.currentTimeMillis();
        idleReminderSent = false;
    }

    public record Detail(
        String sessionId,
        Long userId,
        String username,
        String currentActivity,
        String page,
        String topic,
        String lesson,
        long lastInteractionAt,
        long idleSeconds,
        Long activeAttemptId,
        int allocatedQuestions,
        long lastPongAt,
        Long activeExamId,
        int allocatedExamQuestions,
        Long activeArenaId,
        int allocatedArenaQuestions,
        long connectedAt,
        long attemptAllocatedAt,
        long examAllocatedAt,
        long arenaAllocatedAt,
        long messagesReceived,
        long messagesSent
    ) {}

    public synchronized Detail detail(String sessionId) {
        return new Detail(
            sessionId,
            userId,
            username,
            currentActivity,
            page,
            topic,
            lesson,
            lastInteractionAt,
            Math.max(0, (System.currentTimeMillis() - lastInteractionAt) / 1000),
            activeAttemptId(),
            activeAttempt == null ? 0 : activeAttempt.questions().size(),
            lastPongAt,
            activeExamId,
            allocatedExamQuestions,
            activeArenaId,
            allocatedArenaQuestions,
            connectedAt,
            activeAttempt == null ? 0 : attemptAllocatedAt,
            examAllocatedAt,
            arenaAllocatedAt,
            messagesReceived,
            messagesSent
        );
    }
}
