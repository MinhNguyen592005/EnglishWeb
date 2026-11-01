package com.grammarquest.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.grammarquest.entity.User;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

class ProfileUpdateTest {

    private final UserRepository users = mock(UserRepository.class);
    private final AuthController controller = new AuthController(
        users,
        null,
        null,
        null,
        null,
        null
    );
    private final UsernamePasswordAuthenticationToken auth =
        new UsernamePasswordAuthenticationToken("self", null, List.of());

    @ParameterizedTest
    @ValueSource(strings = { "LEARNER", "TEACHER", "ADMIN" })
    void eachRoleUpdatesOnlyOwnNameAndPreservesOtherProfileFields(String role) {
        var current = new User("self", "Tên cũ", "hash");
        current.id = 7L;
        current.displayName = "Nguyễn Minh Anh";
        current.role = role;
        current.totalXp = 4200;
        current.equippedFrame = "FRAME_GOLD";
        current.equippedBadge = "BADGE_FIRST_WIN";
        when(users.findByUsernameIgnoreCase("self")).thenReturn(Optional.of(current));

        var profile = controller.updateProfile(
            auth,
            new AuthController.UpdateProfile("  Nguyễn Minh Anh  ")
        );

        assertEquals("Nguyễn Minh Anh", profile.displayName());
        assertEquals("self", profile.username());
        assertEquals(role, profile.role());
        assertEquals(4200, profile.totalXp());
        assertEquals("FRAME_GOLD", profile.equippedFrame());
        assertEquals("BADGE_FIRST_WIN", profile.equippedBadge());
        assertEquals("hash", current.passwordHash);
        verify(users).updateDisplayName("self", "Nguyễn Minh Anh");
        verify(users, never()).save(any());
    }

    @Test
    void rejectsNamesThatBecomeInvalidAfterTrimmingWithoutWriting() {
        for (String name : new String[] { null, "", "   ", " a ", "x".repeat(121), "Minh\nAnh" }) {
            var error = assertThrows(ApiException.class, () ->
                controller.updateProfile(auth, new AuthController.UpdateProfile(name))
            );
            assertEquals(HttpStatus.BAD_REQUEST, error.status);
        }
        verifyNoInteractions(users);
    }

    @Test
    void rejectsLockedAccount() {
        var locked = new User("self", "Tên cũ", "hash");
        locked.id = 7L;
        locked.locked = true;
        when(users.findByUsernameIgnoreCase("self")).thenReturn(Optional.of(locked));
        var error = assertThrows(ApiException.class, () ->
            controller.updateProfile(auth, new AuthController.UpdateProfile("Tên mới"))
        );
        assertEquals(HttpStatus.FORBIDDEN, error.status);
        assertEquals("Tên cũ", locked.displayName);
        verify(users, never()).save(any());
    }
}
