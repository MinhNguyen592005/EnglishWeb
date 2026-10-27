package com.grammarquest.service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
/** Cấp phát một gói đề bất biến mỗi phòng; nhiều client giữ tham chiếu cùng gói. Không phát đáp án đúng. */
@Service
public class ArenaSnapshotStore {
    public record Question(int roundNo,String prompt,List<String> options) {}
    private static class Packet {final List<Question> questions;final Set<String> clients=new HashSet<>();Packet(List<Question> questions){this.questions=List.copyOf(questions);}}
    private final ConcurrentHashMap<Long,Packet> packets=new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String,Long> bindings=new ConcurrentHashMap<>();
    private final JdbcTemplate db;
    public ArenaSnapshotStore(JdbcTemplate db){this.db=db;}
    public int acquire(String client,long room){
        bindings.compute(client,(key,old)->{
            if(old!=null&&old!=room)releaseRoom(client,old);
            packets.compute(room,(id,packet)->{
                if(packet==null)packet=new Packet(db.query("select round_no,prompt,option_a,option_b,option_c,option_d from arena_rounds where room_id=? order by round_no",(rs,n)->new Question(rs.getInt(1),rs.getString(2),List.of(rs.getString(3),rs.getString(4),rs.getString(5),rs.getString(6))),room));
                packet.clients.add(client);return packet;
            });return room;
        });
        var packet=packets.get(room);return packet==null?0:packet.questions.size();
    }
    private void releaseRoom(String client,long room){packets.computeIfPresent(room,(id,packet)->{packet.clients.remove(client);return packet.clients.isEmpty()?null:packet;});}
    // Thu hồi tài nguyên: gói chỉ bỏ khỏi RAM khi không còn client tham chiếu.
    public void release(String client){bindings.computeIfPresent(client,(key,room)->{releaseRoom(client,room);return null;});}
    public Question question(String client,int round){var room=bindings.get(client);var packet=room==null?null:packets.get(room);return packet==null?null:packet.questions.stream().filter(q->q.roundNo()==round).findFirst().orElse(null);}
    public int packetCount(){return packets.size();}
}
