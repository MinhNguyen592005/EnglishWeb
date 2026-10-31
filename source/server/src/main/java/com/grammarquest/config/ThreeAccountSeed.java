package com.grammarquest.config;

import com.grammarquest.entity.User;
import com.grammarquest.repository.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Profile("dev")
@ConditionalOnProperty(name = "app.seed-three-accounts", havingValue = "true")
public class ThreeAccountSeed implements CommandLineRunner {

    private final UserRepository users;
    private final PasswordEncoder encoder;

    public ThreeAccountSeed(UserRepository users, PasswordEncoder encoder) {
        this.users = users;
        this.encoder = encoder;
    }

    @Override
    @Transactional
    public void run(String... args) {
        create("admin1", "Quản trị viên", "ADMIN");
        create("teacher1", "Giáo viên", "TEACHER");
        create("student1", "Sinh viên", "LEARNER");
    }

    private void create(String username, String displayName, String role) {
        if (users.existsByUsernameIgnoreCase(username)) return;
        User user = new User(username, displayName, encoder.encode("12345678"));
        user.role = role;
        user.placementEligible = false;
        users.save(user);
    }
}
