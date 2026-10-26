package com.grammarquest.service;

import com.grammarquest.repository.UserRepository;
import com.grammarquest.exception.ApiException;
import com.grammarquest.util.PvpRankRules;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

/** Hàng đợi trên RAM: một mục mỗi tài khoản, ràng buộc với socket đang ở đấu trường. */
@Service
public class ArenaMatchmaker {
    private final UserRepository users;
    private final JdbcTemplate db;
    private final ArenaMatchFactory factory;
    private final LinkedHashMap<String,Entry> queue=new LinkedHashMap<>();
    private static class Entry {
        String username,socket; long level,joined; int elo; Map<String,Object> room; String error;
        Entry(String username,String socket,long level,int elo,long now){
            this.username=username;this.socket=socket;this.level=level;this.elo=elo;this.joined=now;
        }
    }
    public ArenaMatchmaker(UserRepository users,JdbcTemplate db,ArenaMatchFactory factory){this.users=users;this.db=db;this.factory=factory;}
    public static int allowedGap(long joined,long now){return now-joined>=30_000?2:now-joined>=15_000?1:0;}
    public static int allowedEloGap(long joined,long now){return now-joined>=30_000?600:now-joined>=15_000?300:150;}
    private ApiException bad(String code,String message){return new ApiException(HttpStatus.CONFLICT,code,message);}
    public synchronized Map<String,Object> join(String username,String socket){
        var user=users.findByUsernameIgnoreCase(username).orElseThrow();
        if(user.locked||!"LEARNER".equals(user.role))throw bad("LEARNER_ONLY","Chỉ học viên được tìm trận");
        Instant nowInstant = Instant.now();
        if(user.pvpBanUntil != null && user.pvpBanUntil.isAfter(nowInstant)) {
            long secs = Math.max(1, Duration.between(nowInstant, user.pvpBanUntil).getSeconds());
            throw new ApiException(HttpStatus.FORBIDDEN, "MATCHMAKING_BANNED",
                "Bạn đang bị cấm ghép trận tạm thời do từ chối xác nhận trận quá " + PvpRankRules.MAX_DECLINE_COUNT + " lần. Còn lại " + secs + " giây.");
        }
        var existing=queue.get(username);
        if(existing!=null&&existing.error!=null&&existing.socket.equals(socket)){queue.remove(username);existing=null;}
        if(existing!=null){if(!existing.socket.equals(socket))throw bad("ALREADY_QUEUED","Tài khoản đang tìm trận ở tab khác");return view(existing,System.currentTimeMillis());}
        if(active(user.id))throw bad("ALREADY_IN_ROOM","Bạn đang ở một phòng đấu khác");
        Integer qCount = db.queryForObject("select count(*) from questions where published=true and (question_type is null or question_type='MCQ')",Integer.class);
        if(qCount == null || qCount < 10)throw bad("QUESTION_BANK_INCOMPLETE","Chưa đủ 10 câu hỏi để tìm trận");
        long now = System.currentTimeMillis();
        var entry=new Entry(username,socket,user.totalXp/1000+1,user.pvpElo,now);
        queue.put(username,entry);
        return view(entry,now);
    }
    private boolean active(long id){
        Integer n = db.queryForObject("select count(*) from arena_rooms where (host_id=? or guest_id=?) and status in ('WAITING','IN_PROGRESS')",Integer.class,id,id);
        Integer c = db.queryForObject("select count(*) from arena_rooms where (host_id=? or guest_id=?) and status='CONFIRMING'",Integer.class,id,id);
        return (n != null && n > 0) || (c != null && c > 0);
    }
    public synchronized Map<String,Object> status(String username,String socket){
        var entry=queue.get(username);
        if(entry==null||!entry.socket.equals(socket)) {
            var res = new LinkedHashMap<String,Object>();
            res.put("status","IDLE");
            users.findByUsernameIgnoreCase(username).ifPresent(u -> enrichUserMeta(res, u));
            return res;
        }
        return view(entry,System.currentTimeMillis());
    }
    public synchronized Map<String,Object> cancel(String username,String socket){
        var entry=queue.get(username);if(entry!=null&&entry.socket.equals(socket))queue.remove(username);
        var res = new LinkedHashMap<String,Object>();
        res.put("status","IDLE");
        users.findByUsernameIgnoreCase(username).ifPresent(u -> enrichUserMeta(res, u));
        return res;
    }
    public synchronized void disconnect(String socket){queue.values().removeIf(entry->entry.socket.equals(socket));}
    public synchronized Map<String,Map<String,Object>> tick(long now){
        Instant nowInstant = Instant.ofEpochMilli(now);
        // Xác minh lại level/ELO/quyền/trạng thái phòng trước khi ghép.
        for(var entry:queue.values())if(entry.room==null&&entry.error==null){
            var user=users.findByUsernameIgnoreCase(entry.username).orElse(null);
            if(user==null||user.locked||!"LEARNER".equals(user.role)||active(user.id))entry.error="Tài khoản không còn đủ điều kiện tìm trận";
            else if(user.pvpBanUntil!=null&&user.pvpBanUntil.isAfter(nowInstant))entry.error="Bạn đang bị tạm cấm ghép trận";
            else {
                entry.level=user.totalXp/1000+1;
                entry.elo=user.pvpElo;
            }
        }
        var waiting=queue.values().stream().filter(e->e.room==null&&e.error==null).toList();
        for(var a:waiting){
            if(a.room!=null||a.error!=null)continue;
            var b=waiting.stream().filter(e->e!=a&&e.room==null&&e.error==null)
                .filter(e->Math.abs(e.elo-a.elo)<=Math.min(allowedEloGap(a.joined,now),allowedEloGap(e.joined,now)))
                .min(Comparator.<Entry>comparingInt(e->Math.abs(e.elo-a.elo))
                    .thenComparingLong(e->e.joined)).orElse(null);
            if(b==null)continue;
            try{var rooms=factory.create(a.username,b.username);a.room=rooms.get(a.username);b.room=rooms.get(b.username);}
            catch(RuntimeException ex){a.error="Chưa thể tạo trận. Hãy thử tìm lại.";b.error=a.error;}
        }
        Map<String,Map<String,Object>> updates=new LinkedHashMap<>();
        queue.values().forEach(entry->updates.put(entry.socket,view(entry,now)));
        return updates;
    }
    public record QueueEntry(String username,String sessionId,long level,long queuedAt,long waitingSeconds,int allowedGap,int elo,int allowedEloGap) {}
    public synchronized List<QueueEntry> dashboardQueue(){
        long now=System.currentTimeMillis();
        return queue.values().stream().filter(e->e.room==null&&e.error==null)
            .map(e->new QueueEntry(e.username,e.socket,e.level,e.joined,Math.max(0,(now-e.joined)/1000),allowedGap(e.joined,now),e.elo,allowedEloGap(e.joined,now))).toList();
    }
    private void enrichUserMeta(Map<String,Object> map, com.grammarquest.entity.User u) {
        var rank = PvpRankRules.fromElo(u.pvpElo);
        map.put("elo", u.pvpElo);
        map.put("rankTier", rank.code());
        map.put("rankTitle", rank.title());
        map.put("declineCount", u.pvpDeclineCount);
        map.put("maxDeclines", PvpRankRules.MAX_DECLINE_COUNT);
        Instant now = Instant.now();
        if (u.pvpBanUntil != null && u.pvpBanUntil.isAfter(now)) {
            map.put("banUntil", u.pvpBanUntil.toString());
            map.put("banRemainingSeconds", Math.max(1, Duration.between(now, u.pvpBanUntil).getSeconds()));
        } else {
            map.put("banUntil", null);
            map.put("banRemainingSeconds", 0);
        }
    }
    private Map<String,Object> view(Entry entry,long now){
        var result=new LinkedHashMap<String,Object>();
        result.put("status",entry.error!=null?"ERROR":entry.room!=null?"MATCHED":"WAITING");
        result.put("level",entry.level);
        result.put("elo",entry.elo);
        var rank = PvpRankRules.fromElo(entry.elo);
        result.put("rankTier",rank.code());
        result.put("rankTitle",rank.title());
        result.put("queuedAt",entry.joined);
        result.put("allowedGap",allowedGap(entry.joined,now));
        result.put("allowedEloGap",allowedEloGap(entry.joined,now));
        result.put("room",entry.room);
        result.put("message",entry.error);
        users.findByUsernameIgnoreCase(entry.username).ifPresent(u -> enrichUserMeta(result, u));
        return result;
    }
}
