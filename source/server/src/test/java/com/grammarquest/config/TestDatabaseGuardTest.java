package com.grammarquest.config;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class TestDatabaseGuardTest {

    @Test
    void rejectsProductionDatabaseInTestProfile() {
        var env = new MockEnvironment()
            .withProperty("spring.profiles.active", "test")
            .withProperty("DB_TEST_NAME", "grammar_quest");
        assertThrows(IllegalStateException.class, () ->
            new TestDatabaseGuard().postProcessEnvironment(env, null)
        );
    }

    @Test
    void rejectsDatasourceOverrideToWrongDatabase() {
        var env = new MockEnvironment()
            .withProperty("spring.profiles.active", "test")
            .withProperty("spring.datasource.url", "jdbc:mysql://localhost:3306/grammar_quest");
        assertThrows(IllegalStateException.class, () ->
            new TestDatabaseGuard().postProcessEnvironment(env, null)
        );
    }
}
