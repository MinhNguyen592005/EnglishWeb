package com.grammarquest.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.grammarquest.controller.AdminController;
import com.grammarquest.controller.TeacherDashboardController;
import com.grammarquest.exception.ApiException;
import jakarta.validation.Validation;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class SocketWorkspaceServiceTest {

    @Test
    void rejectsMalformedSocketDecisionsBeforeCallingTransactionalController() throws Exception {
        var admin = mock(AdminController.class);
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var service = new SocketWorkspaceService(
                admin,
                mock(TeacherDashboardController.class),
                factory.getValidator()
            );
            var json = new ObjectMapper();
            for (String payload : new String[] {
                "{\"reportId\":1.5,\"action\":\"LOCK\",\"source\":\"CLASS\"}",
                "{\"reportId\":1,\"action\":\"LOCK\",\"source\":\"UNKNOWN\"}",
                "{\"reportId\":1,\"action\":\"\",\"source\":\"CLASS\"}",
                json.writeValueAsString(
                    Map.of(
                        "reportId",
                        1,
                        "action",
                        "WARN",
                        "source",
                        "USER",
                        "note",
                        "x".repeat(501)
                    )
                ),
            })
                assertThrows(ApiException.class, () ->
                    service.decide("admin", json.readTree(payload))
                );
            verifyNoInteractions(admin);
            when(admin.decide(any(), eq(1L), any())).thenReturn(Map.of("status", "RESOLVED"));
            assertEquals(
                Map.of("status", "RESOLVED"),
                service.decide(
                    "admin",
                    json.readTree("{\"reportId\":1,\"action\":\"WARN\",\"source\":\"USER\"}")
                )
            );
            verify(admin).decide(
                argThat(auth -> auth.getName().equals("admin")),
                eq(1L),
                eq(new AdminController.Decision("WARN", "", "USER"))
            );
        }
    }

    @Test
    void delegatesEverySnapshotToRoleCheckedController() {
        var admin = mock(AdminController.class);
        var teacher = mock(TeacherDashboardController.class);
        var service = new SocketWorkspaceService(
            admin,
            teacher,
            mock(jakarta.validation.Validator.class)
        );
        when(teacher.overview(any())).thenThrow(
            new ApiException(HttpStatus.FORBIDDEN, "TEACHER_ONLY", "Denied")
        );
        when(admin.reports(any())).thenThrow(
            new ApiException(HttpStatus.FORBIDDEN, "ADMIN_ONLY", "Denied")
        );
        assertThrows(ApiException.class, () -> service.snapshot("learner", "TEACHER"));
        assertThrows(ApiException.class, () -> service.snapshot("learner", "REPORTS"));
        verify(teacher).overview(argThat(auth -> auth.getName().equals("learner")));
        verify(admin).reports(argThat(auth -> auth.getName().equals("learner")));
    }
}
