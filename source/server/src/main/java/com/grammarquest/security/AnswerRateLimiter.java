package com.grammarquest.security;

import com.grammarquest.exception.ApiException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** Một cửa sổ chung theo tài khoản cho REST, raw WS và STOMP. Không khóa tài khoản/IP. */
@Component
public class AnswerRateLimiter {

    private static class Window {

        final ArrayDeque<Long> times = new ArrayDeque<>();
        long until, last;
    }

    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
    private final ApplicationEventPublisher events;

    public record Limited(String username, int count) {}

    public AnswerRateLimiter(ApplicationEventPublisher events) {
        this.events = events;
    }

    public void check(String username) {
        check(username, System.nanoTime());
    }

    void check(String username, long now) {
        String key = username.toLowerCase(Locale.ROOT);
        var window = windows.computeIfAbsent(key, k -> new Window());
        boolean notify = false;
        int count = 0;
        synchronized (window) {
            window.last = now;
            if (now < window.until) throw limited();
            while (!window.times.isEmpty() && now - window.times.peekFirst() >= 1_000_000_000L)
                window.times.removeFirst();
            window.times.addLast(now);
            count = window.times.size();
            if (count > 10) {
                window.until = now + 10_000_000_000L;
                window.times.clear();
                notify = true;
            }
        }
        if (notify) {
            events.publishEvent(new Limited(key, count));
            throw limited();
        }
    }

    private ApiException limited() {
        return new ApiException(
            HttpStatus.TOO_MANY_REQUESTS,
            "ANSWER_RATE_LIMIT",
            "Bạn gửi đáp án quá nhanh. Hãy chờ 10 giây rồi thử lại."
        );
    }

    @org.springframework.scheduling.annotation.Scheduled(fixedDelay = 60000)
    public void cleanup() {
        long now = System.nanoTime();
        windows.forEach((key, w) -> {
            synchronized (w) {
                if (now - w.last > 120_000_000_000L) windows.remove(key, w);
            }
        });
    }
}
