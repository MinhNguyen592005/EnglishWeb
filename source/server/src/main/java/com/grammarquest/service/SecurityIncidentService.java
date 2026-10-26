package com.grammarquest.service;

import com.grammarquest.entity.User;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import com.grammarquest.security.BehaviorMonitor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.sql.*;
import java.util.*;

@Service
public class SecurityIncidentService {
    public record Alert(long id,String username,String severity,String message) {}
    public record Resolved(long id,String username,String decision,String message) {}
    private final JdbcTemplate db;
    private final UserRepository users;
    private final ApplicationEventPublisher events;
    public SecurityIncidentService(JdbcTemplate db,UserRepository users,ApplicationEventPublisher events){this.db=db;this.users=users;this.events=events;}
    @EventListener
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void detected(BehaviorMonitor.Detected signal){
        var ids=signal.username()==null?List.<Long>of():db.queryForList("select id from users where username=?",Long.class,signal.username());
        Long userId=ids.isEmpty()?null:ids.getFirst();
        String message=signal.rule().title+": ít nhất "+signal.count()+" sự kiện trong "+signal.rule().seconds+" giây. Cần quản trị viên xem xét.";
        var key=new GeneratedKeyHolder();
        db.update(c->{
            var s=c.prepareStatement("insert into security_incidents(user_id,username,peer_address,session_id,rule_code,severity,message,event_count,window_seconds,occurred_at) values(?,?,?,?,?,?,?,?,?,?)",Statement.RETURN_GENERATED_KEYS);
            if(userId==null)s.setNull(1,Types.BIGINT);else s.setLong(1,userId);
            s.setString(2,signal.username());s.setString(3,limit(signal.address(),128));s.setString(4,limit(signal.sessionId(),128));
            s.setString(5,signal.rule().name());s.setString(6,signal.rule().severity);s.setString(7,message);
            s.setInt(8,signal.count());s.setInt(9,signal.rule().seconds);s.setTimestamp(10,Timestamp.from(signal.occurredAt()));return s;
        },key);
        events.publishEvent(new Alert(Objects.requireNonNull(key.getKey()).longValue(),signal.username(),signal.rule().severity,message));
    }
    private static String limit(String value,int max){return value==null?null:value.substring(0,Math.min(value.length(),max));}
    private User admin(String username){
        var actor=users.findByUsernameIgnoreCase(username).orElseThrow(()->new ApiException(HttpStatus.UNAUTHORIZED,"UNAUTHENTICATED","Vui lòng đăng nhập"));
        if(actor.locked||!"ADMIN".equals(actor.role))throw new ApiException(HttpStatus.FORBIDDEN,"ADMIN_ONLY","Chỉ quản trị viên được phép xử lý cảnh báo");
        return actor;
    }
    @Transactional(readOnly=true)
    public List<Map<String,Object>> list(String username){
        admin(username);
        return db.queryForList("select s.id,s.user_id as userId,s.username,s.peer_address as peerAddress,s.rule_code as ruleCode,s.severity,s.message,s.event_count as eventCount,s.window_seconds as windowSeconds,s.status,s.decision,s.note,s.occurred_at as occurredAt,s.resolved_at as resolvedAt,u.username as resolvedBy from security_incidents s left join users u on u.id=s.resolved_by order by case when s.status='OPEN' then 0 else 1 end,s.occurred_at desc,s.id desc limit 200");
    }
    @Transactional
    public void decide(String username,long id,String decision,String note){
        User actor=admin(username);
        if(!Set.of("WARN","LOCK","DISMISS").contains(decision))throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_DECISION","Cách xử lý không hợp lệ");
        var rows=db.queryForList("select * from security_incidents where id=? for update",id);
        if(rows.isEmpty())throw new ApiException(HttpStatus.NOT_FOUND,"INCIDENT_NOT_FOUND","Không tìm thấy cảnh báo");
        var incident=rows.getFirst();
        if(!"OPEN".equals(incident.get("status")))throw new ApiException(HttpStatus.CONFLICT,"ALREADY_RESOLVED","Cảnh báo đã được xử lý");
        String targetName=(String)incident.get("username");
        if(!"DISMISS".equals(decision)){
            if(!(incident.get("user_id") instanceof Number userId))throw new ApiException(HttpStatus.BAD_REQUEST,"NO_ACCOUNT","Cảnh báo này không gắn với tài khoản; chỉ có thể ghi chú và bỏ qua");
            User target=users.findWithLockById(userId.longValue()).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"USER_NOT_FOUND","Tài khoản không còn tồn tại"));
            targetName=target.username;
            if("LOCK".equals(decision)){
                if("ADMIN".equals(target.role)&&!target.locked&&db.queryForList("select id from users where role='ADMIN' and locked=false order by id for update",Long.class).size()<=1)
                    throw new ApiException(HttpStatus.CONFLICT,"LAST_ADMIN","Không thể khóa admin đang hoạt động cuối cùng");
                target.locked=true;users.save(target);
            }
        }
        db.update("update security_incidents set status='RESOLVED',decision=?,note=?,resolved_by=?,resolved_at=current_timestamp(6) where id=?",decision,note,actor.id,id);
        db.update("insert into audit_logs(actor_id,action,target_type,target_id,detail) values(?,?,?,?,?)",actor.id,"SECURITY_"+decision,"SECURITY_INCIDENT",id,note);
        String message="LOCK".equals(decision)?"Quản trị viên đã khóa tài khoản sau khi xem xét cảnh báo hoạt động bất thường. Vui lòng liên hệ hỗ trợ.":"WARN".equals(decision)?"Quản trị viên nhắc nhở bạn ngừng gửi yêu cầu hoặc tin nhắn dồn dập. Hãy liên hệ hỗ trợ nếu bạn không thực hiện các thao tác này.":"Quản trị viên đã xem xét và bỏ qua cảnh báo hoạt động bất thường.";
        events.publishEvent(new Resolved(id,targetName,decision,message));
    }
}
