package com.grammarquest.service;

import com.grammarquest.repository.UserRepository;
import com.grammarquest.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.*;

/** Hàng đợi trên RAM: một mục mỗi tài khoản, ràng buộc với socket đang ở đấu trường. */
@Service
public class ArenaMatchmaker {
    private final UserRepository users;
    private final JdbcTemplate db;
    private final ArenaMatchFactory factory;
    private final LinkedHashMap<String,Entry> queue=new LinkedHashMap<>();
    private static class Entry {
        String username,socket; long level,joined; Map<String,Object> room; String error;
        Entry(String username,String socket,long level,long now){this.username=username;this.socket=socket;this.level=level;this.joined=now;}
    }
    public ArenaMatchmaker(UserRepository users,JdbcTemplate db,ArenaMatchFactory factory){this.users=users;this.db=db;this.factory=factory;}
    public static int allowedGap(long joined,long now){return now-joined>=30_000?2:now-joined>=15_000?1:0;}
    private ApiException bad(String code,String message){return new ApiException(HttpStatus.CONFLICT,code,message);}
    public synchronized Map<String,Object> join(String username,String socket){
        var user=users.findByUsernameIgnoreCase(username).orElseThrow();
        if(user.locked||!"LEARNER".equals(user.role))throw bad("LEARNER_ONLY","Chỉ học viên được tìm trận");
        var existing=queue.get(username);
        if(existing!=null&&existing.error!=null&&existing.socket.equals(socket)){queue.remove(username);existing=null;}
        if(existing!=null){if(!existing.socket.equals(socket))throw bad("ALREADY_QUEUED","Tài khoản đang tìm trận ở tab khác");return view(existing,System.currentTimeMillis());}
        if(active(user.id))throw bad("ALREADY_IN_ROOM","Bạn đang ở một phòng đấu khác");
        if(db.queryForObject("select count(*) from questions where published=true",Integer.class)<10)throw bad("QUESTION_BANK_INCOMPLETE","Chưa đủ 10 câu hỏi để tìm trận");
        var entry=new Entry(username,socket,user.totalXp/1000+1,System.currentTimeMillis());queue.put(username,entry);
        return view(entry,System.currentTimeMillis());
    }
    private boolean active(long id){return db.queryForObject("select count(*) from arena_rooms where (host_id=? or guest_id=?) and status in ('WAITING','IN_PROGRESS')",Integer.class,id,id)>0;}
    public synchronized Map<String,Object> status(String username,String socket){
        var entry=queue.get(username);return entry==null||!entry.socket.equals(socket)?Map.of("status","IDLE"):view(entry,System.currentTimeMillis());
    }
    public synchronized Map<String,Object> cancel(String username,String socket){
        var entry=queue.get(username);if(entry!=null&&entry.socket.equals(socket))queue.remove(username);
        return Map.of("status","IDLE");
    }
    public synchronized void disconnect(String socket){queue.values().removeIf(entry->entry.socket.equals(socket));}
    public synchronized Map<String,Map<String,Object>> tick(long now){
        // Xác minh lại level/quyền/trạng thái phòng trước khi ghép.
        for(var entry:queue.values())if(entry.room==null&&entry.error==null){
            var user=users.findByUsernameIgnoreCase(entry.username).orElse(null);
            if(user==null||user.locked||!"LEARNER".equals(user.role)||active(user.id))entry.error="Tài khoản không còn đủ điều kiện tìm trận";
            else entry.level=user.totalXp/1000+1;
        }
        var waiting=queue.values().stream().filter(e->e.room==null&&e.error==null).toList();
        for(var a:waiting){
            if(a.room!=null||a.error!=null)continue;
            var b=waiting.stream().filter(e->e!=a&&e.room==null&&e.error==null)
                .filter(e->Math.abs(e.level-a.level)<=Math.min(allowedGap(a.joined,now),allowedGap(e.joined,now)))
                .min(Comparator.<Entry>comparingLong(e->Math.abs(e.level-a.level)).thenComparingLong(e->e.joined)).orElse(null);
            if(b==null)continue;
            try{var rooms=factory.create(a.username,b.username);a.room=rooms.get(a.username);b.room=rooms.get(b.username);}
            catch(RuntimeException ex){a.error="Chưa thể tạo trận. Hãy thử tìm lại.";b.error=a.error;}
        }
        Map<String,Map<String,Object>> updates=new LinkedHashMap<>();
        queue.values().forEach(entry->updates.put(entry.socket,view(entry,now)));
        return updates;
    }
    public record QueueEntry(String username,String sessionId,long level,long queuedAt,long waitingSeconds,int allowedGap) {}
    public synchronized List<QueueEntry> dashboardQueue(){
        long now=System.currentTimeMillis();
        return queue.values().stream().filter(e->e.room==null&&e.error==null)
            .map(e->new QueueEntry(e.username,e.socket,e.level,e.joined,Math.max(0,(now-e.joined)/1000),allowedGap(e.joined,now))).toList();
    }
    private Map<String,Object> view(Entry entry,long now){
        var result=new LinkedHashMap<String,Object>();
        result.put("status",entry.error!=null?"ERROR":entry.room!=null?"MATCHED":"WAITING");
        result.put("level",entry.level);result.put("queuedAt",entry.joined);result.put("allowedGap",allowedGap(entry.joined,now));
        result.put("room",entry.room);result.put("message",entry.error);return result;
    }
}
