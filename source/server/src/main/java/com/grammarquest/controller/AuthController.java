package com.grammarquest.controller;

import com.grammarquest.entity.*;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.*;
import com.grammarquest.util.PvpRankRules;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.Map;
import org.springframework.http.*;
import org.springframework.security.authentication.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final AuthenticationManager manager;
    private final HttpSessionSecurityContextRepository contextRepository;
    private final com.grammarquest.service.PlacementService placement;
    private final org.springframework.context.ApplicationEventPublisher events;

    public record UserRegistered(Long userId) {}

    public AuthController(
        UserRepository users,
        PasswordEncoder encoder,
        AuthenticationManager manager,
        HttpSessionSecurityContextRepository contextRepository,
        com.grammarquest.service.PlacementService placement,
        org.springframework.context.ApplicationEventPublisher events
    ) {
        this.users = users;
        this.encoder = encoder;
        this.manager = manager;
        this.contextRepository = contextRepository;
        this.placement = placement;
        this.events = events;
    }

    public record Register(
        @NotBlank @Size(min = 3, max = 80) String username,
        @NotBlank @Size(min = 2, max = 120) String displayName,
        @NotBlank @Size(min = 8, max = 100) String password
    ) {}

    public record Login(@NotBlank String username, @NotBlank String password) {}

    public record UpdateProfile(@NotBlank @Size(min = 2, max = 120) String displayName) {}

    public record Profile(
        Long id,
        String username,
        String displayName,
        String role,
        long totalXp,
        long level,
        long xpInLevel,
        boolean placementEligible,
        int pvpElo,
        int pvpPeakElo,
        String pvpRankTier,
        String pvpRankTitle,
        int pvpWins,
        int pvpLosses,
        int pvpDraws,
        int pvpWinStreak,
        String equippedFrame,
        String equippedBadge
    ) {
        public Profile(
            Long id,
            String username,
            String displayName,
            String role,
            long totalXp,
            long level,
            long xpInLevel,
            boolean placementEligible
        ) {
            this(
                id,
                username,
                displayName,
                role,
                totalXp,
                level,
                xpInLevel,
                placementEligible,
                1000,
                1000,
                "BRONZE",
                "Đồng",
                0,
                0,
                0,
                0,
                "FRAME_DEFAULT",
                null
            );
        }

        public static Profile from(User u) {
            var rank = PvpRankRules.fromElo(u.pvpElo);
            return new Profile(
                u.id,
                u.username,
                u.displayName,
                u.role,
                u.totalXp,
                u.totalXp / 1000 + 1,
                u.totalXp % 1000,
                u.placementEligible,
                u.pvpElo,
                u.pvpPeakElo,
                rank.code(),
                rank.title(),
                u.pvpWins,
                u.pvpLosses,
                u.pvpDraws,
                u.pvpWinStreak,
                u.equippedFrame != null ? u.equippedFrame : "FRAME_DEFAULT",
                u.equippedBadge
            );
        }
    }

    @GetMapping("/csrf")
    public Map<String, String> csrf(CsrfToken token) {
        return Map.of("token", token.getToken());
    }

    @org.springframework.transaction.annotation.Transactional
    @PostMapping("/register")
    public ResponseEntity<Profile> register(@Valid @RequestBody Register body) {
        String name = body.username().trim().toLowerCase();
        if (users.existsByUsernameIgnoreCase(name)) throw new ApiException(
            HttpStatus.CONFLICT,
            "USERNAME_TAKEN",
            "Tên đăng nhập đã được dùng"
        );
        User user = new User(name, body.displayName().trim(), encoder.encode(body.password()));
        user.placementEligible = true;
        user = users.save(user);
        placement.enrollNewUser(user.id);
        events.publishEvent(new UserRegistered(user.id));
        return ResponseEntity.status(201).body(Profile.from(user));
    }

    @PostMapping("/login")
    public Profile login(
        @Valid @RequestBody Login body,
        HttpServletRequest request,
        HttpServletResponse response
    ) {
        Authentication auth;
        try {
            auth = manager.authenticate(
                new UsernamePasswordAuthenticationToken(body.username(), body.password())
            );
        } catch (AuthenticationException e) {
            throw new ApiException(
                HttpStatus.UNAUTHORIZED,
                "LOGIN_FAILED",
                "Tài khoản hoặc mật khẩu không đúng"
            );
        }
        request.getSession(true);
        request.changeSessionId();
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(auth);
        SecurityContextHolder.setContext(context);
        contextRepository.saveContext(context, request, response);
        return Profile.from(users.findByUsernameIgnoreCase(auth.getName()).orElseThrow());
    }

    @PatchMapping("/me")
    @org.springframework.transaction.annotation.Transactional
    public Profile updateProfile(Authentication auth, @Valid @RequestBody UpdateProfile body) {
        String displayName = body.displayName() == null ? "" : body.displayName().strip();
        if (
            displayName.length() < 2 ||
            displayName.length() > 120 ||
            displayName.chars().anyMatch(Character::isISOControl)
        ) throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "INVALID_DISPLAY_NAME",
            "Tên hiển thị cần có từ 2 đến 120 ký tự trên một dòng."
        );
        // Update only the name: concurrent PvP rewards/equipment cannot be overwritten.
        users.updateDisplayName(auth.getName(), displayName);
        User user = users.findByUsernameIgnoreCase(auth.getName()).orElseThrow();
        if (user.locked) throw new ApiException(
            HttpStatus.FORBIDDEN,
            "ACCOUNT_LOCKED",
            "Tài khoản đã bị khóa"
        );
        return Profile.from(user);
    }

    @GetMapping("/me")
    public Profile me(Authentication auth) {
        User user = users.findByUsernameIgnoreCase(auth.getName()).orElseThrow();
        if (user.locked) throw new ApiException(
            HttpStatus.FORBIDDEN,
            "ACCOUNT_LOCKED",
            "Tài khoản đã bị khóa"
        );
        return Profile.from(user);
    }
}
