package com.grammarquest.controller;

import com.grammarquest.entity.*;
import com.grammarquest.repository.*;
import com.grammarquest.exception.ApiException;
import com.grammarquest.service.RealtimeNotifier;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.Duration;
import java.util.*;

@RestController @RequestMapping("/api/v1/arena")
public class ArenaController {
    private final JdbcTemplate db;
    private final UserRepository users;
    private final RealtimeNotifier notifier;
    private final com.grammarquest.service.DailyQuestService dailyQuestService;
    public ArenaController(JdbcTemplate db, UserRepository users, RealtimeNotifier notifier) {
        this(db, users, notifier, null);
    }
    @org.springframework.beans.factory.annotation.Autowired
    public ArenaController(JdbcTemplate db, UserRepository users, RealtimeNotifier notifier,
                           com.grammarquest.service.DailyQuestService dailyQuestService) {
        this.db=db; this.users=users; this.notifier=notifier; this.dailyQuestService=dailyQuestService;
    }
    public record Join(@NotBlank String code) {}
    public record Ready(boolean ready) {}
    public record Answer(int roundNo,@NotBlank String option) {}
    private User current(Authentication a) {
        User u=users.findByUsernameIgnoreCase(a.getName()).orElseThrow();
        if(u.locked) throw new ApiException(HttpStatus.FORBIDDEN,"ACCOUNT_LOCKED","Tài khoản đã bị khóa");
        if(u.role.equals("ADMIN")) throw new ApiException(HttpStatus.FORBIDDEN,"ADMIN_ONLY_MANAGEMENT","Quản trị viên chỉ sử dụng chức năng quản trị");
        if(!u.role.equals("LEARNER")) throw new ApiException(HttpStatus.FORBIDDEN,"LEARNER_ONLY","Chỉ học viên được tham gia đấu trường");
        return u;
    }
    private ApiException bad(String code,String message) { return new ApiException(HttpStatus.CONFLICT,code,message); }
    private Map<String,Object> locked(long id) {
        var rows=db.queryForList("select * from arena_rooms where id=? for update",id);
        if(rows.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND,"ROOM_NOT_FOUND","Không tìm thấy phòng đấu");
        return rows.getFirst();
    }
    private void participant(Map<String,Object> room, User u) {
        if(!Objects.equals(((Number)room.get("host_id")).longValue(),u.id)&&
           !Objects.equals(room.get("guest_id")==null?null:((Number)room.get("guest_id")).longValue(),u.id))
            throw new ApiException(HttpStatus.FORBIDDEN,"ARENA_FORBIDDEN","Bạn không thuộc phòng đấu này");
    }
    private boolean host(Map<String,Object> r,User u) { return ((Number)r.get("host_id")).longValue()==u.id; }
    private void noActive(long userId) {
        Integer n=db.queryForObject("select count(*) from arena_rooms where (host_id=? or guest_id=?) and status in ('WAITING','IN_PROGRESS')",Integer.class,userId,userId);
        if(n!=null&&n>0) throw bad("ALREADY_IN_ROOM","Bạn đang ở một phòng đấu khác");
    }
    @GetMapping("/mine") @Transactional public Map<String,Object> mine(Authentication a) {
        User u=current(a);
        var ids=db.queryForList("select id from arena_rooms where (host_id=? or guest_id=?) and status in ('WAITING','IN_PROGRESS') order by id desc limit 1",Long.class,u.id,u.id);
        return ids.isEmpty()?Map.of():get(a,ids.getFirst());
    }
    @GetMapping("/history") public List<Map<String,Object>> history(Authentication a) {
        User u=current(a);
        return db.queryForList("select r.id,r.code,r.status,r.host_id as hostId,r.guest_id as guestId,h.display_name as hostName,g.display_name as guestName,r.host_score as hostScore,r.guest_score as guestScore,r.winner_id as winnerId,r.created_at as createdAt from arena_rooms r join users h on h.id=r.host_id left join users g on g.id=r.guest_id where (r.host_id=? or r.guest_id=?) and r.status='FINISHED' order by r.id desc limit 50",u.id,u.id);
    }
    @PostMapping("/rooms") @Transactional public Map<String,Object> create(Authentication a) {
        User u=current(a); users.findWithLockById(u.id).orElseThrow(); noActive(u.id);
        String code;
        do { code=UUID.randomUUID().toString().substring(0,8).toUpperCase(); }
        while(db.queryForObject("select count(*) from arena_rooms where code=?",Integer.class,code)>0);
        var key=new GeneratedKeyHolder(); String value=code;
        db.update(c -> { var ps=c.prepareStatement("insert into arena_rooms(code,host_id) values(?,?)",Statement.RETURN_GENERATED_KEYS); ps.setString(1,value); ps.setLong(2,u.id); return ps; },key);
        long id=Objects.requireNonNull(key.getKey()).longValue(); notifier.arena(id);
        return snapshot(locked(id),u);
    }
    @PostMapping("/join") @Transactional public Map<String,Object> join(Authentication a,@Valid @RequestBody Join body) {
        User u=current(a);
        users.findWithLockById(u.id).orElseThrow();
        var ids=db.queryForList("select id from arena_rooms where code=?",Long.class,body.code().trim().toUpperCase());
        if(ids.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND,"ROOM_NOT_FOUND","Mã phòng không tồn tại");
        Map<String,Object> r=locked(ids.getFirst());
        if(host(r,u)||Objects.equals(r.get("guest_id")==null?null:((Number)r.get("guest_id")).longValue(),u.id)) return snapshot(r,u);
        noActive(u.id);
        if(!"WAITING".equals(r.get("status"))||r.get("guest_id")!=null) throw bad("ROOM_FULL","Phòng đã đủ người hoặc đã bắt đầu");
        db.update("update arena_rooms set guest_id=?,guest_ready=false,state_version=state_version+1 where id=?",u.id,ids.getFirst());
        notifier.arena(ids.getFirst());
        return snapshot(locked(ids.getFirst()),u);
    }
    @GetMapping("/rooms/{id}") @Transactional public Map<String,Object> get(Authentication a,@PathVariable long id) {
        User u=current(a); Map<String,Object> r=locked(id); participant(r,u);
        r=presence(r,u);
        settle(r); return snapshot(locked(id),u);
    }
    @PostMapping("/rooms/{id}/ready") @Transactional public Map<String,Object> ready(Authentication a,@PathVariable long id,@Valid @RequestBody Ready body) {
        User u=current(a); Map<String,Object> r=locked(id); participant(r,u);
        if(!"WAITING".equals(r.get("status"))) throw bad("ROOM_STARTED","Trận đấu đã bắt đầu");
        db.update("update arena_rooms set "+(host(r,u)?"host_ready":"guest_ready")+"=?,state_version=state_version+1 where id=?",body.ready(),id);
        notifier.arena(id);
        return snapshot(locked(id),u);
    }
    @PostMapping("/rooms/{id}/start") @Transactional public Map<String,Object> start(Authentication a,@PathVariable long id) {
        User u=current(a); Map<String,Object> r=locked(id);
        if(!host(r,u)) throw new ApiException(HttpStatus.FORBIDDEN,"HOST_ONLY","Chỉ chủ phòng được bắt đầu");
        if(!"WAITING".equals(r.get("status"))||r.get("guest_id")==null||!Boolean.TRUE.equals(r.get("host_ready"))||!Boolean.TRUE.equals(r.get("guest_ready")))
            throw bad("NOT_READY","Cần hai người chơi cùng sẵn sàng");
        var ids=db.queryForList("select id from questions where published=true and (question_type is null or question_type='MCQ') order by rand() limit 10",Long.class);
        if(ids.size()<10) throw bad("QUESTION_BANK_INCOMPLETE","Cần ít nhất 10 câu hỏi để thi đấu");
        for(int i=0;i<10;i++) db.update("insert into arena_rounds(room_id,round_no,question_id,prompt,option_a,option_b,option_c,option_d,correct_option,explanation) select ?,?,id,prompt,option_a,option_b,option_c,option_d,correct_option,explanation from questions where id=?",id,i+1,ids.get(i));
        Instant now=Instant.now();
        db.update("update arena_rounds set started_at=? where room_id=? and round_no=1",Timestamp.from(now),id);
        db.update("update arena_rooms set status='IN_PROGRESS',current_round=1,round_deadline_at=?,host_seen_at=?,guest_seen_at=?,state_version=state_version+1 where id=?",Timestamp.from(now.plusSeconds(20)),Timestamp.from(now),Timestamp.from(now),id);
        notifier.arena(id);
        return snapshot(locked(id),u);
    }
    @PostMapping("/rooms/{id}/answers") @Transactional public Map<String,Object> answer(Authentication a,@PathVariable long id,@Valid @RequestBody Answer body) {
        User u=current(a); Map<String,Object> r=locked(id); participant(r,u);
        r=presence(r,u);
        if("IN_PROGRESS".equals(r.get("status"))&&r.get("pause_started_at")!=null) throw bad("MATCH_PAUSED","Trận đang tạm dừng để chờ người chơi kết nối lại");
        if(body.roundNo()!=((Number)r.get("current_round")).intValue()) throw bad("STALE_ROUND","Câu hỏi đã chuyển vòng");
        settle(r); r=locked(id);
        if(!"IN_PROGRESS".equals(r.get("status"))) throw bad("MATCH_FINISHED","Trận đấu đã kết thúc");
        if(body.roundNo()!=((Number)r.get("current_round")).intValue()) throw bad("STALE_ROUND","Câu hỏi đã hết giờ");
        String option=body.option().toUpperCase();
        if(!option.matches("[ABCD]")) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_OPTION","Đáp án phải là A, B, C hoặc D");
        String field=host(r,u)?"host":"guest";
        int round=((Number)r.get("current_round")).intValue();
        var old=db.queryForMap("select host_answer,guest_answer from arena_rounds where room_id=? and round_no=?",id,round);
        if(old.get(field+"_answer")!=null) {
            if(!option.equals(old.get(field+"_answer"))) throw bad("ALREADY_ANSWERED","Bạn đã trả lời vòng này");
            return snapshot(r,u);
        }
        db.update("update arena_rounds set "+field+"_answer=?,"+field+"_answered_at=? where room_id=? and round_no=?",option,Timestamp.from(Instant.now()),id,round);
        db.update("update arena_rooms set state_version=state_version+1 where id=?",id);
        notifier.arena(id);
        settle(locked(id));
        return snapshot(locked(id),u);
    }
    @PostMapping("/rooms/{id}/leave") @Transactional public Map<String,Object> leave(Authentication a,@PathVariable long id) {
        User u=current(a); Map<String,Object> r=locked(id); participant(r,u);
        if("WAITING".equals(r.get("status"))) {
            if(host(r,u)&&r.get("guest_id")!=null) db.update("update arena_rooms set host_id=guest_id,guest_id=null,host_ready=guest_ready,guest_ready=false,state_version=state_version+1 where id=?",id);
            else if(host(r,u)) db.update("update arena_rooms set status='CANCELLED',state_version=state_version+1 where id=?",id);
            else db.update("update arena_rooms set guest_id=null,guest_ready=false,state_version=state_version+1 where id=?",id);
        } else if("IN_PROGRESS".equals(r.get("status"))) {
            long winner=host(r,u)?((Number)r.get("guest_id")).longValue():((Number)r.get("host_id")).longValue();
            db.update("update arena_rooms set status='FINISHED',winner_id=?,pause_started_at=null,paused_user_id=null,round_deadline_at=null,state_version=state_version+1 where id=?",winner,id);
        }
        notifier.arena(id);
        return snapshot(locked(id),u);
    }
    private Map<String,Object> presence(Map<String,Object> r,User u) {
        if(!"IN_PROGRESS".equals(r.get("status"))) return r;
        long id=((Number)r.get("id")).longValue();
        Instant now=Instant.now();
        Timestamp pause=(Timestamp)r.get("pause_started_at");
        Long pausedId=r.get("paused_user_id")==null?null:((Number)r.get("paused_user_id")).longValue();
        if(pause!=null&&now.isAfter(pause.toInstant().plusSeconds(30))) {
            long winner=Objects.equals(pausedId,((Number)r.get("host_id")).longValue())?((Number)r.get("guest_id")).longValue():((Number)r.get("host_id")).longValue();
            db.update("update arena_rooms set status='FINISHED',winner_id=?,round_deadline_at=null,pause_started_at=null,paused_user_id=null,state_version=state_version+1 where id=?",winner,id);
            if (dailyQuestService != null) {
                dailyQuestService.recordProgress(winner, "ARENA_WIN", 1);
            }
            notifier.arena(id);
            return locked(id);
        }
        boolean isHost=host(r,u);
        db.update("update arena_rooms set "+(isHost?"host_seen_at":"guest_seen_at")+"=? where id=?",Timestamp.from(now),id);
        if(pause!=null) {
            if(Objects.equals(pausedId,u.id)) {
                Instant next=((Timestamp)r.get("round_deadline_at")).toInstant().plus(Duration.between(pause.toInstant(),now));
                db.update("update arena_rooms set round_deadline_at=?,pause_started_at=null,paused_user_id=null,state_version=state_version+1 where id=?",Timestamp.from(next),id);
                notifier.arena(id);
            }
            return locked(id);
        }
        Timestamp other=(Timestamp)r.get(isHost?"guest_seen_at":"host_seen_at");
        if(other!=null&&other.toInstant().plusSeconds(8).isBefore(now)) {
            Instant since=other.toInstant().plusSeconds(8);
            long absent=((Number)r.get(isHost?"guest_id":"host_id")).longValue();
            if(now.isAfter(since.plusSeconds(30))) {
                db.update("update arena_rooms set status='FINISHED',winner_id=?,round_deadline_at=null,state_version=state_version+1 where id=?",u.id,id);
            } else {
                db.update("update arena_rooms set pause_started_at=?,paused_user_id=?,state_version=state_version+1 where id=?",Timestamp.from(since),absent,id);
            }
            notifier.arena(id);
        }
        return locked(id);
    }
    private void settle(Map<String,Object> r) {
        if(!"IN_PROGRESS".equals(r.get("status"))||r.get("pause_started_at")!=null) return;
        long id=((Number)r.get("id")).longValue(); int no=((Number)r.get("current_round")).intValue();
        var round=db.queryForMap("select correct_option,host_answer,guest_answer from arena_rounds where room_id=? and round_no=?",id,no);
        if(!(round.get("host_answer")!=null&&round.get("guest_answer")!=null)&&
            ((Timestamp)r.get("round_deadline_at")).toInstant().isAfter(Instant.now())) return;
        int hs=Objects.equals(round.get("host_answer"),round.get("correct_option"))?1:0;
        int gs=Objects.equals(round.get("guest_answer"),round.get("correct_option"))?1:0;
        db.update("update arena_rounds set closed=true where room_id=? and round_no=?",id,no);
        int hostScore=((Number)r.get("host_score")).intValue()+hs;
        int guestScore=((Number)r.get("guest_score")).intValue()+gs;
        if(no>=((Number)r.get("question_limit")).intValue()) {
            Long winner=null;
            if(hostScore!=guestScore) winner=hostScore>guestScore?((Number)r.get("host_id")).longValue():((Number)r.get("guest_id")).longValue();
            else {
                var speed=db.queryForMap("select coalesce(sum(case when host_answer=correct_option then timestampdiff(microsecond,started_at,host_answered_at) else 0 end),0) as hostTime,coalesce(sum(case when guest_answer=correct_option then timestampdiff(microsecond,started_at,guest_answered_at) else 0 end),0) as guestTime from arena_rounds where room_id=?",id);
                long h=((Number)speed.get("hostTime")).longValue(),g=((Number)speed.get("guestTime")).longValue();
                if(h!=g) winner=h<g?((Number)r.get("host_id")).longValue():((Number)r.get("guest_id")).longValue();
            }
            db.update("update arena_rooms set status='FINISHED',host_score=?,guest_score=?,winner_id=?,round_deadline_at=null,state_version=state_version+1 where id=?",hostScore,guestScore,winner,id);
            if (dailyQuestService != null) {
                long hostId = ((Number) r.get("host_id")).longValue();
                Long guestId = r.get("guest_id") == null ? null : ((Number) r.get("guest_id")).longValue();
                dailyQuestService.recordProgress(hostId, "ARENA_PLAY", 1);
                if (guestId != null) dailyQuestService.recordProgress(guestId, "ARENA_PLAY", 1);
                if (winner != null) dailyQuestService.recordProgress(winner, "ARENA_WIN", 1);
            }
        } else {
            Instant next=Instant.now();
            db.update("update arena_rounds set started_at=? where room_id=? and round_no=?",Timestamp.from(next),id,no+1);
            db.update("update arena_rooms set host_score=?,guest_score=?,current_round=?,round_deadline_at=?,state_version=state_version+1 where id=?",hostScore,guestScore,no+1,Timestamp.from(next.plusSeconds(20)),id);
        }
        notifier.arena(id);
    }
    /** Vòng đồng hồ server: hết giờ vẫn chuyển vòng dù không có request của client. */
    @Transactional
    public void advance(long id) {
        var room=locked(id);
        if(!"IN_PROGRESS".equals(room.get("status")))return;
        var pause=(Timestamp)room.get("pause_started_at");
        if(pause!=null&&Instant.now().isAfter(pause.toInstant().plusSeconds(30))) {
            long absent=((Number)room.get("paused_user_id")).longValue();
            long winner=absent==((Number)room.get("host_id")).longValue()?((Number)room.get("guest_id")).longValue():((Number)room.get("host_id")).longValue();
            db.update("update arena_rooms set status='FINISHED',winner_id=?,round_deadline_at=null,pause_started_at=null,paused_user_id=null,state_version=state_version+1 where id=?",winner,id);
            if (dailyQuestService != null) {
                dailyQuestService.recordProgress(winner, "ARENA_WIN", 1);
            }
            notifier.arena(id);
        } else settle(room);
    }
    private Map<String,Object> snapshot(Map<String,Object> r,User u) {
        long id=((Number)r.get("id")).longValue();
        boolean isHost=host(r,u);
        Map<String,Object> out=new LinkedHashMap<>();
        out.put("id",id); out.put("code",r.get("code")); out.put("status",r.get("status"));
        out.put("stateVersion",r.get("state_version"));
        out.put("pausedUserId",r.get("paused_user_id"));
        out.put("pauseExpiresAt",r.get("pause_started_at")==null?null:((Timestamp)r.get("pause_started_at")).toInstant().plusSeconds(30));
        out.put("hostId",r.get("host_id")); out.put("guestId",r.get("guest_id"));
        out.put("hostName",db.queryForObject("select display_name from users where id=?",String.class,r.get("host_id")));
        out.put("guestName",r.get("guest_id")==null?null:db.queryForObject("select display_name from users where id=?",String.class,r.get("guest_id")));
        out.put("hostReady",r.get("host_ready")); out.put("guestReady",r.get("guest_ready"));
        out.put("hostScore",r.get("host_score")); out.put("guestScore",r.get("guest_score"));
        out.put("currentRound",r.get("current_round")); out.put("questionLimit",r.get("question_limit"));
        out.put("deadlineAt",r.get("round_deadline_at")); out.put("winnerId",r.get("winner_id")); out.put("isHost",isHost);
        int no=((Number)r.get("current_round")).intValue();
        if(no>0) {
            var q=db.queryForMap("select round_no,prompt,option_a,option_b,option_c,option_d,host_answer,guest_answer from arena_rounds where room_id=? and round_no=?",id,no);
            if("IN_PROGRESS".equals(r.get("status"))) {
                out.put("question",Map.of("roundNo",no,"prompt",q.get("prompt"),"options",List.of(q.get("option_a"),q.get("option_b"),q.get("option_c"),q.get("option_d"))));
                out.put("myAnswer",q.get(isHost?"host_answer":"guest_answer"));
                out.put("opponentAnswered",q.get(isHost?"guest_answer":"host_answer")!=null);
            }
            int previous="FINISHED".equals(r.get("status"))?no:no-1;
            if(previous>0) {
                var result=db.queryForMap("select round_no,correct_option,host_answer,guest_answer,explanation,closed from arena_rounds where room_id=? and round_no=?",id,previous);
                if(Boolean.TRUE.equals(result.get("closed"))) out.put("lastResult",Map.of("roundNo",previous,"correctOption",result.get("correct_option"),"explanation",result.get("explanation"),"hostCorrect",Objects.equals(result.get("host_answer"),result.get("correct_option")),"guestCorrect",Objects.equals(result.get("guest_answer"),result.get("correct_option"))));
            }
        }
        return out;
    }
}
