package com.grammarquest.security;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.time.Instant;
import java.util.*;
import java.util.function.LongSupplier;

/** Bounded sliding windows, shared by all tabs/transports of an authenticated account. */
@Component
public class BehaviorMonitor {
    public enum Rule {
        REQUEST_BURST(180,10,"WARNING","Gửi yêu cầu dồn dập"),
        SOCKET_BURST(80,10,"WARNING","Gửi gói WebSocket dồn dập"),
        CHAT_SPAM(8,10,"WARNING","Gửi tin nhắn quá nhanh"),
        LOGIN_FAILURES(8,60,"HIGH","Đăng nhập thất bại liên tục"),
        ACCESS_DENIED(6,60,"HIGH","Nhiều lần truy cập bị từ chối"),
        INVALID_PROTOCOL(10,60,"WARNING","Nhiều gói hoặc lệnh không hợp lệ"),
        ANSWER_BURST(1,1,"HIGH","Gửi đáp án vượt giới hạn");
        public final int threshold,seconds;
        public final String severity,title;
        Rule(int threshold,int seconds,String severity,String title){this.threshold=threshold;this.seconds=seconds;this.severity=severity;this.title=title;}
    }
    public record Detected(Rule rule,String username,String address,String sessionId,int count,Instant occurredAt) {}
    private record Key(String subject,Rule rule) {}
    private static class Window {
        final ArrayDeque<Long> times=new ArrayDeque<>();
        long lastSeen,lastAlert;boolean alerted;
    }
    private final LinkedHashMap<Key,Window> windows=new LinkedHashMap<>(16,0.75f,true);
    private final ApplicationEventPublisher events;
    private final LongSupplier clock;
    @org.springframework.beans.factory.annotation.Autowired
    public BehaviorMonitor(ApplicationEventPublisher events){this(events,System::nanoTime);}
    BehaviorMonitor(ApplicationEventPublisher events,LongSupplier clock){this.events=events;this.clock=clock;}
    public void observe(Rule rule,String username,String address,String sessionId){
        observe(rule,username,address,sessionId,0);
    }
    private void observe(Rule rule,String username,String address,String sessionId,int evidenceCount){
        String account=username==null||username.isBlank()?null:username.toLowerCase(Locale.ROOT);
        if(account==null&&(address==null||address.isBlank()))return;
        Detected detected=null;long now=clock.getAsLong();
        synchronized(windows){
            var key=new Key(account==null?"peer:"+address:"account:"+account,rule);
            var window=windows.get(key);
            if(window==null){
                if(windows.size()>=10000)windows.remove(windows.keySet().iterator().next());
                window=new Window();windows.put(key,window);
            }
            window.lastSeen=now;
            long interval=rule.seconds*1_000_000_000L;
            while(!window.times.isEmpty()&&now-window.times.peekFirst()>=interval)window.times.removeFirst();
            // Only the latest threshold samples are needed; a flood cannot grow this deque.
            if(window.times.size()>=rule.threshold)window.times.removeFirst();
            window.times.addLast(now);
            if(window.times.size()>=rule.threshold&&(!window.alerted||now-window.lastAlert>=60_000_000_000L)){
                window.alerted=true;window.lastAlert=now;
                detected=new Detected(rule,account,address,sessionId,Math.max(evidenceCount,window.times.size()),Instant.now());
            }
        }
        if(detected!=null){
            try{events.publishEvent(detected);}
            catch(RuntimeException ex){org.slf4j.LoggerFactory.getLogger(getClass()).error("Could not persist security detection for rule {}",rule,ex);}
        }
    }
    @EventListener public void answerLimited(AnswerRateLimiter.Limited event){observe(Rule.ANSWER_BURST,event.username(),null,null,event.count());}
    @Scheduled(fixedDelay=60000) public void cleanup(){
        long now=clock.getAsLong();
        synchronized(windows){windows.values().removeIf(w->now-w.lastSeen>=180_000_000_000L);}
    }
    int trackedWindows(){synchronized(windows){return windows.size();}}
}
