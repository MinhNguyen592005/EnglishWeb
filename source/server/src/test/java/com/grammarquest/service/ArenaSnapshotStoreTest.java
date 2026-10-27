package com.grammarquest.service;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class ArenaSnapshotStoreTest {
    @Test void roomPacketSharedAndOnlyReleasedAfterLastClient(){
        var db=mock(JdbcTemplate.class);when(db.query(anyString(),any(RowMapper.class),eq(7L))).thenReturn(List.of(new ArenaSnapshotStore.Question(1,"Prompt",List.of("A","B","C","D"))));
        var store=new ArenaSnapshotStore(db);assertEquals(1,store.acquire("a",7));assertEquals(1,store.acquire("b",7));assertEquals(1,store.packetCount());
        assertEquals("Prompt",store.question("a",1).prompt());assertNull(store.question("a",2));
        verify(db,times(1)).query(anyString(),any(RowMapper.class),eq(7L));store.release("a");assertEquals(1,store.packetCount());assertNull(store.question("a",1));store.release("b");assertEquals(0,store.packetCount());
    }
}
