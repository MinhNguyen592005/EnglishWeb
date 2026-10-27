package com.grammarquest.config;

import java.util.Arrays;
import java.util.regex.Pattern;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;

/** Fails before Flyway or Hibernate can connect to an unintended database. */
public class TestDatabaseGuard implements EnvironmentPostProcessor {

    private static final Pattern DATABASE = Pattern.compile("^jdbc:mysql://[^/]+/([^?;]+).*$");

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment env, SpringApplication application) {
        boolean test =
            Arrays.asList(env.getActiveProfiles()).contains("test") ||
            "test".equals(env.getProperty("spring.profiles.active"));
        if (!test) return;
        String name = env.getProperty("DB_TEST_NAME", "grammar_quest_test");
        String normal = env.getProperty("DB_NAME", "grammar_quest");
        String url = env.getProperty("spring.datasource.url");
        if (url == null) url = env.getProperty("SPRING_DATASOURCE_URL");
        if (
            !name.endsWith("_test") || name.equalsIgnoreCase(normal)
        ) throw new IllegalStateException("Test database phải có hậu tố _test và khác DB_NAME");
        if (url != null) {
            var matcher = DATABASE.matcher(url);
            if (
                !matcher.matches() || !matcher.group(1).equals(name)
            ) throw new IllegalStateException("Datasource test không trỏ tới DB_TEST_NAME");
        }
    }
}
