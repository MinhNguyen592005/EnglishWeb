package com.grammarquest.config;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.grammarquest.entity.User;
import com.grammarquest.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class ThreeAccountSeedTest {

    @Test
    void createsThreeRolesWithRequestedPasswordAndSkipsExistingAccounts() {
        UserRepository users = mock(UserRepository.class);
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        ThreeAccountSeed seed = new ThreeAccountSeed(users, encoder);
        seed.run();
        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(users, times(3)).save(saved.capture());
        assertEquals(
            java.util.List.of("ADMIN", "TEACHER", "LEARNER"),
            saved
                .getAllValues()
                .stream()
                .map(u -> u.role)
                .toList()
        );
        assertEquals(
            java.util.List.of("admin1", "teacher1", "student1"),
            saved
                .getAllValues()
                .stream()
                .map(u -> u.username)
                .toList()
        );
        for (User user : saved.getAllValues()) {
            assertTrue(encoder.matches("12345678", user.passwordHash));
            assertFalse(user.placementEligible);
        }
        assertTrue(
            encoder.matches(
                "12345678",
                "$2a$10$WVdsnCee/rSEhScVkASMCe2fsAqLMOOWmq9aUH/4NzR5x1fchAOje"
            )
        );
        clearInvocations(users);
        when(users.existsByUsernameIgnoreCase(anyString())).thenReturn(true);
        seed.run();
        verify(users, never()).save(any());
    }
}
