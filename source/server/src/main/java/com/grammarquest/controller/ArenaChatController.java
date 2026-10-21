package com.grammarquest.controller;

import com.grammarquest.entity.User;
import com.grammarquest.repository.UserRepository;
import com.grammarquest.exception.ApiException;
import com.grammarquest.service.RealtimeNotifier;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.sql.Statement;
import java.util.*;

@RestController @RequestMapping("/api/v1/arena/rooms/{roomId}/messages")
public class ArenaChatController {
    private final JdbcTemplate db;
    private final UserRepository users;
    private final RealtimeNotifier notifier;
    public ArenaChatController(JdbcTemplate db, UserRepository users, RealtimeNotifier notifier) {
        this.db=db; this.users=users; this.notifier=notifier;
    }
    public record NewMessage(@NotBlank @Size(max=1000) String body) {}
    public record Report(@NotBlank @Size(max=500) String reason) {}

    private User current(Authentication auth) {
        User user=users.findByUsernameIgnoreCase(auth.getName()).orElseThrow();
        if(user.locked) throw new ApiException(HttpStatus.FORBIDDEN,"ACCOUNT_LOCKED","Tài khoản đã bị khóa");
        if(user.role.equals("ADMIN")) throw new ApiException(HttpStatus.FORBIDDEN,"ADMIN_ONLY_MANAGEMENT","Quản trị viên chỉ sử dụng chức năng quản trị");
        if(!user.role.equals("LEARNER")) throw new ApiException(HttpStatus.FORBIDDEN,"LEARNER_ONLY","Chỉ học viên được tham gia đấu trường");
        return user;
    }
    private Map<String,Object> room(long roomId, User user, boolean lock) {
        var rooms=db.queryForList("select host_id,guest_id,status from arena_rooms where id=?"+(lock?" for update":""),roomId);
        if(rooms.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND,"ROOM_NOT_FOUND","Không tìm thấy phòng đấu");
        Map<String,Object> room=rooms.getFirst();
        long host=((Number)room.get("host_id")).longValue();
        Object guest=room.get("guest_id");
        if(host!=user.id && (guest==null || ((Number)guest).longValue()!=user.id))
            throw new ApiException(HttpStatus.FORBIDDEN,"ARENA_FORBIDDEN","Bạn không thuộc phòng đấu này");
        return room;
    }
    @GetMapping public List<Map<String,Object>> list(Authentication auth, @PathVariable long roomId) {
        room(roomId,current(auth),false);
        return db.queryForList("select m.id,m.room_id as roomId,m.user_id as userId,u.display_name as displayName,m.body,m.created_at as createdAt from arena_messages m join users u on u.id=m.user_id where m.room_id=? order by m.id desc limit 100",roomId).reversed();
    }
    @PostMapping @Transactional public Map<String,Object> send(Authentication auth,@PathVariable long roomId,@Valid @RequestBody NewMessage body) {
        User user=current(auth);
        Map<String,Object> room=room(roomId,user,true);
        if(!Set.of("WAITING","IN_PROGRESS").contains(room.get("status")))
            throw new ApiException(HttpStatus.CONFLICT,"ROOM_CLOSED","Không thể nhắn tin sau khi phòng kết thúc");
        Integer muted=db.queryForObject("select count(*) from chat_mutes where user_id=? and expires_at>current_timestamp(6)",Integer.class,user.id);
        if(muted!=null&&muted>0) throw new ApiException(HttpStatus.FORBIDDEN,"CHAT_MUTED","Bạn đang bị tạm cấm chat");
        Integer recent=db.queryForObject("select count(*) from arena_messages where user_id=? and created_at>date_sub(current_timestamp(6),interval 10 second)",Integer.class,user.id);
        if(recent!=null&&recent>=5) throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"CHAT_RATE_LIMIT","Hãy chờ trước khi gửi thêm tin");
        var key=new GeneratedKeyHolder();
        String message=body.body().trim();
        db.update(c -> {
            var ps=c.prepareStatement("insert into arena_messages(room_id,user_id,body) values(?,?,?)",Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1,roomId); ps.setLong(2,user.id); ps.setString(3,message); return ps;
        },key);
        long id=Objects.requireNonNull(key.getKey()).longValue();
        db.update("update arena_rooms set state_version=state_version+1 where id=?",roomId);
        notifier.arena(roomId);
        return db.queryForMap("select m.id,m.room_id as roomId,m.user_id as userId,u.display_name as displayName,m.body,m.created_at as createdAt from arena_messages m join users u on u.id=m.user_id where m.id=?",id);
    }
    @PostMapping("/{messageId}/report") @Transactional public Map<String,Object> report(Authentication auth,@PathVariable long roomId,@PathVariable long messageId,@Valid @RequestBody Report body) {
        User user=current(auth);
        room(roomId,user,false);
        var messages=db.queryForList("select user_id from arena_messages where id=? and room_id=?",messageId,roomId);
        if(messages.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND,"MESSAGE_NOT_FOUND","Không tìm thấy tin nhắn");
        if(((Number)messages.getFirst().get("user_id")).longValue()==user.id)
            throw new ApiException(HttpStatus.BAD_REQUEST,"SELF_REPORT","Không thể báo cáo tin nhắn của chính bạn");
        int inserted=db.update("insert ignore into arena_reports(reporter_id,message_id,reason) values(?,?,?)",user.id,messageId,body.reason().trim());
        if(inserted==0) throw new ApiException(HttpStatus.CONFLICT,"ALREADY_REPORTED","Bạn đã báo cáo tin nhắn này");
        long reportId=db.queryForObject("select id from arena_reports where reporter_id=? and message_id=?",Long.class,user.id,messageId);
        notifier.reported(((Number)messages.getFirst().get("user_id")).longValue(),user.id,"ARENA",reportId);
        return Map.of("status","OPEN");
    }
}
