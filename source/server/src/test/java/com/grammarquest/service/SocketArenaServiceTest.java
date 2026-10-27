package com.grammarquest.service;
import com.grammarquest.controller.*;
import com.grammarquest.exception.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.junit.jupiter.api.Test;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import org.mockito.ArgumentCaptor;
import org.springframework.security.core.Authentication;

class SocketArenaServiceTest {
    private final ArenaController arena=mock(ArenaController.class);
    private final ArenaChatController chat=mock(ArenaChatController.class);
    private final SocketArenaService service=new SocketArenaService(arena,chat,mock(JdbcTemplate.class));
    private final ObjectMapper json=new ObjectMapper();
    @Test void answerUsesAuthenticatedUsernameAndValidatesPayload() throws Exception {
        when(arena.answer(any(),eq(7L),any())).thenReturn(Map.of("id",7L));
        service.action("alice","ARENA_ANSWER",json.readTree("{\"roomId\":7,\"roundNo\":2,\"option\":\"B\"}"));
        var auth=ArgumentCaptor.forClass(Authentication.class);
        verify(arena).answer(auth.capture(),eq(7L),eq(new ArenaController.Answer(2,"B")));
        assertEquals("alice",auth.getValue().getName());
        assertThrows(ApiException.class,()->service.action("alice","ARENA_ANSWER",json.readTree("{\"roomId\":7,\"roundNo\":999,\"option\":\"A\"}")));
    }
    @Test void chatAndReportsRetainControllerPermissionChecks() throws Exception {
        service.action("alice","ARENA_CHAT",json.readTree("{\"roomId\":7,\"body\":\"Hello\"}"));
        verify(chat).send(any(),eq(7L),eq(new ArenaChatController.NewMessage("Hello")));
        service.action("alice","ARENA_REPORT",json.readTree("{\"roomId\":7,\"messageId\":8,\"reason\":\"Spam\"}"));
        verify(chat).report(any(),eq(7L),eq(8L),eq(new ArenaChatController.Report("Spam")));
        assertThrows(ApiException.class,()->service.action("alice","ARENA_CHAT",json.readTree("{\"roomId\":7,\"body\":\" \"}")));
    }
}
