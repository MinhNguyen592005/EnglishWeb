package com.grammarquest.security;

import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.mockito.ArgumentCaptor;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BehaviorMonitorTest {
    @Test void slidingWindowExpiresAndOnlyFlagsAtThreshold(){
        var events=mock(ApplicationEventPublisher.class);var now=new AtomicLong();
        var monitor=new BehaviorMonitor(events,now::get);
        for(int i=0;i<7;i++)monitor.observe(BehaviorMonitor.Rule.CHAT_SPAM,"alice",null,"tab1");
        verifyNoInteractions(events);
        now.set(10_000_000_000L);
        monitor.observe(BehaviorMonitor.Rule.CHAT_SPAM,"alice",null,"tab1");
        verifyNoInteractions(events);
        for(int i=0;i<7;i++)monitor.observe(BehaviorMonitor.Rule.CHAT_SPAM,"alice",null,"tab2");
        var detected=ArgumentCaptor.forClass(BehaviorMonitor.Detected.class);
        verify(events).publishEvent(detected.capture());
        assertEquals(8,detected.getValue().count());assertEquals("tab2",detected.getValue().sessionId());
    }
    @Test void sharedAccountAcrossTabsHasCooldownWithoutBlockingOtherAccounts(){
        var events=mock(ApplicationEventPublisher.class);var now=new AtomicLong();
        var monitor=new BehaviorMonitor(events,now::get);
        for(int i=0;i<4;i++)monitor.observe(BehaviorMonitor.Rule.CHAT_SPAM,"ALICE",null,"a");
        for(int i=0;i<4;i++)monitor.observe(BehaviorMonitor.Rule.CHAT_SPAM,"alice",null,"b");
        for(int i=0;i<1000;i++)monitor.observe(BehaviorMonitor.Rule.CHAT_SPAM,"alice",null,"a");
        verify(events,times(1)).publishEvent(any(BehaviorMonitor.Detected.class));
        for(int i=0;i<7;i++)monitor.observe(BehaviorMonitor.Rule.CHAT_SPAM,"bob",null,"c");
        verify(events,times(1)).publishEvent(any(BehaviorMonitor.Detected.class));
        now.set(60_000_000_000L);
        for(int i=0;i<8;i++)monitor.observe(BehaviorMonitor.Rule.CHAT_SPAM,"alice",null,"a");
        verify(events,times(2)).publishEvent(any(BehaviorMonitor.Detected.class));
    }
    @Test void anonymousPeersAreSeparateAndMemoryIsBoundedAndExpires(){
        var events=mock(ApplicationEventPublisher.class);var now=new AtomicLong();
        var monitor=new BehaviorMonitor(events,now::get);
        for(int i=0;i<10010;i++)monitor.observe(BehaviorMonitor.Rule.REQUEST_BURST,null,"peer"+i,null);
        assertEquals(10000,monitor.trackedWindows());
        now.set(180_000_000_000L);monitor.cleanup();assertEquals(0,monitor.trackedWindows());
        verifyNoInteractions(events);
    }
    @Test void answerLimitCarriesActualEvidenceAndStorageFailureDoesNotFailUserAction(){
        var events=mock(ApplicationEventPublisher.class);var monitor=new BehaviorMonitor(events,()->0L);
        monitor.answerLimited(new AnswerRateLimiter.Limited("alice",11));
        var detected=ArgumentCaptor.forClass(BehaviorMonitor.Detected.class);verify(events).publishEvent(detected.capture());
        assertEquals(11,detected.getValue().count());assertEquals(1,detected.getValue().rule().seconds);
        doThrow(new IllegalStateException("DB unavailable")).when(events).publishEvent(any(BehaviorMonitor.Detected.class));
        assertDoesNotThrow(()->monitor.answerLimited(new AnswerRateLimiter.Limited("bob",11)));
    }
}
