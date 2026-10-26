package com.grammarquest.service;

import com.grammarquest.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

/** Count only completed ranked games; cancelled confirmations and friendlies never consume a slot. */
public final class RankedPairRules {
    public static final int MAX_MATCHES=3;
    public static final String NOTICE="Hai tài khoản đã đấu đủ 3 trận xếp hạng trong 24 giờ. Hệ thống đang tìm đối thủ khác; bạn vẫn có thể đấu giao hữu.";
    private final JdbcTemplate db;
    public RankedPairRules(JdbcTemplate db){this.db=db;}
    public static String pairKey(long first,long second){return Math.min(first,second)+":"+Math.max(first,second);}
    /** One history query per matchmaking tick, rather than a query for every possible pair. */
    public Set<String> blockedPairs(Collection<Long> users,Instant now){
        var ids=users.stream().distinct().toList();
        if(ids.size()<2)return Set.of();
        String slots=String.join(",",Collections.nCopies(ids.size(),"?"));
        var args=new ArrayList<Object>();args.add(Timestamp.from(now.minusSeconds(86400)));args.addAll(ids);args.addAll(ids);
        var rows=db.queryForList("select least(host_id,guest_id) as firstId,greatest(host_id,guest_id) as secondId from arena_rooms where is_matchmade=true and status='FINISHED' and settled_at>=? and host_id in ("+slots+") and guest_id in ("+slots+") group by least(host_id,guest_id),greatest(host_id,guest_id) having count(*)>=3",args.toArray());
        var result=new HashSet<String>();
        for(var row:rows)result.add(pairKey(((Number)row.get("firstId")).longValue(),((Number)row.get("secondId")).longValue()));
        return result;
    }
    public boolean allowed(long first,long second,Instant now){
        Integer count=db.queryForObject("select count(*) from arena_rooms where is_matchmade=true and status='FINISHED' and settled_at>=? and ((host_id=? and guest_id=?) or (host_id=? and guest_id=?))",Integer.class,Timestamp.from(now.minusSeconds(86400)),first,second,second,first);
        return count==null||count<MAX_MATCHES;
    }
    public void requireAllowed(long first,long second){
        if(!allowed(first,second,Instant.now()))throw new ApiException(HttpStatus.CONFLICT,"RANKED_PAIR_LIMIT",NOTICE);
    }
}
