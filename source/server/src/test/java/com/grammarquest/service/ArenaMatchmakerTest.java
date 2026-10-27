package com.grammarquest.service;
import com.grammarquest.entity.User;
import com.grammarquest.repository.UserRepository;
import com.grammarquest.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class ArenaMatchmakerTest {
    private final UserRepository users=mock(UserRepository.class);
    private final JdbcTemplate db=mock(JdbcTemplate.class);
    private final ArenaMatchFactory factory=mock(ArenaMatchFactory.class);
    private final ArenaMatchmaker queue=new ArenaMatchmaker(users,db,factory);
    ArenaMatchmakerTest(){
        when(db.queryForObject(eq("select count(*) from questions where published=true and deleted=false and admin_blocked=false and owner_id is null and (question_type is null or question_type='MCQ')"),eq(Integer.class))).thenReturn(10);
        when(db.queryForObject(eq("select count(*) from arena_rooms where (host_id=? or guest_id=?) and status in ('WAITING','IN_PROGRESS')"),eq(Integer.class),anyLong(),anyLong())).thenReturn(0);
    }
    private void user(String name,long id,long level){
        var user=new User(name,name,"unused");user.id=id;user.totalXp=(level-1)*1000;user.role="LEARNER";
        when(users.findByUsernameIgnoreCase(name)).thenReturn(Optional.of(user));
    }
    private void matched(String a,String b){when(factory.create(a,b)).thenReturn(Map.of(a,Map.of("id",9L),b,Map.of("id",9L)));}
    @Test void dashboardQueueContainsWaitingOnlyAndReleasesDisconnectedEntries(){
        user("a",1,3);user("b",2,3);matched("a","b");queue.join("a","s1");
        var row=queue.dashboardQueue().getFirst();assertEquals("a",row.username());assertEquals(3,row.level());assertEquals("s1",row.sessionId());
        queue.disconnect("s1");assertTrue(queue.dashboardQueue().isEmpty());
        queue.join("a","s1");queue.join("b","s2");queue.tick(System.currentTimeMillis());assertTrue(queue.dashboardQueue().isEmpty());
    }
    @Test void sameLevelMatchesImmediately(){
        user("a",1,3);user("b",2,3);matched("a","b");
        queue.join("a","s1");queue.join("b","s2");
        var updates=queue.tick(System.currentTimeMillis());
        assertEquals("MATCHED",updates.get("s1").get("status"));assertEquals("MATCHED",updates.get("s2").get("status"));
        verify(factory,times(1)).create("a","b");
    }
    @Test void accountLevelNeverBlocksEqualEloOpponents(){
        user("a",1,1);user("b",2,100);matched("a","b");
        queue.join("a","s1");queue.join("b","s2");
        assertEquals("MATCHED",queue.tick(System.currentTimeMillis()).get("s1").get("status"));
    }
    @Test void eloWindowsExpandAfterFifteenAndThirtySeconds(){
        user("a",1,1);user("b",2,100);matched("a","b");
        users.findByUsernameIgnoreCase("b").orElseThrow().pvpElo=1250;
        queue.join("a","s1");queue.join("b","s2");long now=System.currentTimeMillis();
        assertEquals("WAITING",queue.tick(now).get("s1").get("status"));
        assertEquals("MATCHED",queue.tick(now+16000).get("s1").get("status"));
        user("c",3,2);user("d",4,90);matched("c","d");
        users.findByUsernameIgnoreCase("d").orElseThrow().pvpElo=1500;
        queue.join("c","s3");queue.join("d","s4");now=System.currentTimeMillis();
        assertEquals("WAITING",queue.tick(now+16000).get("s3").get("status"));
        assertEquals("MATCHED",queue.tick(now+31000).get("s3").get("status"));
    }
    @Test void duplicateAccountAndDisconnectAreHandled(){
        user("a",1,3);queue.join("a","s1");assertThrows(ApiException.class,()->queue.join("a","other"));
        queue.disconnect("s1");assertEquals("IDLE",queue.status("a","s1").get("status"));
        queue.join("a","other");queue.cancel("a","other");assertTrue(queue.tick(System.currentTimeMillis()).isEmpty());
    }
    @Test void failedRoomCreationDoesNotReportAMatch(){
        user("a",1,3);user("b",2,3);queue.join("a","s1");queue.join("b","s2");
        when(factory.create("a","b")).thenThrow(new IllegalStateException("database failure"));
        assertEquals("ERROR",queue.tick(System.currentTimeMillis()).get("s1").get("status"));
    }
    @Test void repeatPairIsSkippedButOtherOpponentsStillMatch(){
        user("a",1,1);user("b",2,1);
        when(db.queryForList(startsWith("select least(host_id,guest_id)"),any(Object[].class))).thenReturn(List.of(Map.of("firstId",1L,"secondId",2L)));
        queue.join("a","s1");queue.join("b","s2");
        var blocked=queue.tick(System.currentTimeMillis());
        assertEquals("WAITING",blocked.get("s1").get("status"));
        assertEquals(RankedPairRules.NOTICE,blocked.get("s1").get("pairingNotice"));
        verifyNoInteractions(factory);
        user("c",3,1);matched("a","c");queue.join("c","s3");
        assertEquals("MATCHED",queue.tick(System.currentTimeMillis()).get("s1").get("status"));
        verify(factory).create("a","c");
        verify(factory,never()).create("a","b");
    }
}
