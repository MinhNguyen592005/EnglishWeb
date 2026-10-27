package com.grammarquest.config;

import com.grammarquest.entity.User;
import com.grammarquest.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@Profile("dev")
@ConditionalOnProperty(name = "app.seed-demo", havingValue = "true")
public class DemoSeed implements CommandLineRunner {

    private final UserRepository users;
    private final PasswordEncoder encoder;

    @Value("${DEMO_PASSWORD:}")
    private String password;

    public DemoSeed(UserRepository users, PasswordEncoder encoder) {
        this.users = users;
        this.encoder = encoder;
    }

    @Override
    public void run(String... args) {
        if (password.length() < 8) throw new IllegalStateException(
            "Đặt DEMO_PASSWORD tối thiểu 8 ký tự trước khi seed"
        );
        create("admin_demo", "Quản trị viên", "ADMIN");
        create("teacher_demo", "Giáo viên", "TEACHER");
        create("learner_one", "Minh", "LEARNER");
        create("learner_two", "Linh", "LEARNER");
    }

    private void create(String username, String name, String role) {
        if (users.existsByUsernameIgnoreCase(username)) return;
        User user = new User(username, name, encoder.encode(password));
        user.role = role;
        users.save(user);
    }
}
