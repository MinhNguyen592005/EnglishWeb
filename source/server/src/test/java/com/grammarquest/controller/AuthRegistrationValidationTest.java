package com.grammarquest.controller;

import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class AuthRegistrationValidationTest {
    @Test void passwordLimitUsesUtf8Bytes() {
        assertDoesNotThrow(() -> AuthController.validatePassword("a".repeat(72)));
        assertDoesNotThrow(() -> AuthController.validatePassword("€".repeat(24)));
        assertEquals("PASSWORD_TOO_LONG", assertThrows(com.grammarquest.exception.ApiException.class,
            () -> AuthController.validatePassword("a".repeat(73))).code);
        assertEquals("PASSWORD_TOO_LONG", assertThrows(com.grammarquest.exception.ApiException.class,
            () -> AuthController.validatePassword("€".repeat(25))).code);
    }
    @Test void validatesNamesAfterTrimming() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            var invalid = new AuthController.Register(" a ", " b ", "password123");
            var fields = validator.validate(invalid).stream().map(v -> v.getPropertyPath().toString()).toList();
            assertTrue(fields.contains("username"));
            assertTrue(fields.contains("displayName"));
            var valid = new AuthController.Register("  ALICE  ", "  Alice  ", "password123");
            assertTrue(validator.validate(valid).isEmpty());
            assertEquals("alice", valid.username());
            assertEquals("Alice", valid.displayName());
        }
    }
}
