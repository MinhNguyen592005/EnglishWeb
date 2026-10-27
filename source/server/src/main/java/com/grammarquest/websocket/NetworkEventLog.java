package com.grammarquest.websocket;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.List;

/** Nhật ký mạng có giới hạn trong RAM; không giữ vô hạn theo thời gian chạy. */
public class NetworkEventLog {
    public record Event(long id, String time, String level, String message) {}
    private final ArrayDeque<Event> events=new ArrayDeque<>();
    private long sequence;
    public synchronized void add(String level,String message) {
        if(events.size()>=200) events.removeFirst();
        events.addLast(new Event(++sequence,Instant.now().toString(),level,message));
    }
    public synchronized List<Event> snapshot() { return List.copyOf(events); }
}
