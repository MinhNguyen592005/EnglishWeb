package com.grammarquest.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.util.*;

@Component
public class RealtimeNotifier {
    private final SimpMessagingTemplate broker;
    private final JdbcTemplate db;
    private final org.springframework.context.ApplicationEventPublisher events;
    public record Reported(long targetId,long reporterId,String source,long reportId) {}
    public RealtimeNotifier(SimpMessagingTemplate broker, JdbcTemplate db,org.springframework.context.ApplicationEventPublisher events) { this.broker=broker; this.db=db;this.events=events; }
    public void reported(long targetId,long reporterId,String source,long reportId) {
        // Chỉ gửi sau COMMIT: rollback không tạo thông báo giả.
        afterCommit(()->events.publishEvent(new Reported(targetId,reporterId,source,reportId)));
    }
    private void afterCommit(Runnable action) {
        if(TransactionSynchronizationManager.isSynchronizationActive())
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { action.run(); }
            });
        else action.run();
    }
    public void arena(long roomId) {
        var usernames=db.queryForList("select u.username from arena_rooms r join users u on u.id=r.host_id where r.id=? union select u.username from arena_rooms r join users u on u.id=r.guest_id where r.id=?",String.class,roomId,roomId);
        afterCommit(() -> usernames.forEach(name -> broker.convertAndSendToUser(name,"/queue/arena",Map.of("roomId",roomId))));
    }
    public void classroom(long classId) {
        var usernames=db.queryForList("select u.username from classrooms c join users u on u.id=c.teacher_id where c.id=? union select u.username from class_members m join users u on u.id=m.user_id where m.class_id=?",String.class,classId,classId);
        afterCommit(() -> usernames.forEach(name -> broker.convertAndSendToUser(name,"/queue/classes",Map.of("classId",classId))));
    }
}
