package com.grammarquest.service;

import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class RealtimeNotifierTest {

    @Test
    void reportsOnlyPublishAfterCommitAndNeverOnRollback() {
        var events = mock(ApplicationEventPublisher.class);
        var notifier = new RealtimeNotifier(
            mock(SimpMessagingTemplate.class),
            mock(JdbcTemplate.class),
            events
        );
        TransactionSynchronizationManager.initSynchronization();
        try {
            notifier.reported(2, 1, "USER", 7);
            verifyNoInteractions(events);
            TransactionSynchronizationManager.getSynchronizations().forEach(sync ->
                sync.afterCommit()
            );
            verify(events).publishEvent(new RealtimeNotifier.Reported(2, 1, "USER", 7));
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
        clearInvocations(events);
        TransactionSynchronizationManager.initSynchronization();
        try {
            notifier.reported(2, 1, "CLASS", 8);
            TransactionSynchronizationManager.getSynchronizations().forEach(sync ->
                sync.afterCompletion(1)
            );
            verifyNoInteractions(events);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }
}
