package com.grammarquest.security;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import com.grammarquest.exception.ApiException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class AnswerRateLimiterTest {
    @Test void sharedWindowCaseInsensitiveCooldownAndNoPermanentLock(){
        var events=mock(ApplicationEventPublisher.class);var limiter=new AnswerRateLimiter(events);
        long now=1_000_000_000L;for(int i=0;i<10;i++)limiter.check(i%2==0?"Alice":"alice",now);
        assertEquals("ANSWER_RATE_LIMIT",assertThrows(ApiException.class,()->limiter.check("alice",now)).code);
        verify(events).publishEvent(new AnswerRateLimiter.Limited("alice",11));
        assertDoesNotThrow(()->limiter.check("bob",now));
        assertThrows(ApiException.class,()->limiter.check("ALICE",now+9_000_000_000L));
        assertDoesNotThrow(()->limiter.check("alice",now+10_000_000_000L));
    }
}
