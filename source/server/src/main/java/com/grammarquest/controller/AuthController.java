package com.grammarquest.controller;

import com.grammarquest.entity.*;
import com.grammarquest.repository.*;
import com.grammarquest.exception.ApiException;
import com.grammarquest.util.PvpRankRules;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.*;
import org.springframework.security.authentication.*;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.web.csrf.CsrfToken;
import java.util.Map;

@RestController @RequestMapping("/api/v1/auth")
public class AuthController {
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final AuthenticationManager manager;
    private final HttpSessionSecurityContextRepository contextRepository;
    private final com.grammarquest.service.PlacementService placement;
    public AuthController(UserRepository users, PasswordEncoder encoder, AuthenticationManager manager,
                          HttpSessionSecurityContextRepository contextRepository,com.grammarquest.service.PlacementService placement) {
        this.users=users; this.encoder=encoder; this.manager=manager; this.contextRepository=contextRepository;this.placement=placement;
    }
    public record Register(@NotBlank @Size(min=3,max=80) String username,
                           @NotBlank @Size(min=2,max=120) String displayName,
                           @NotBlank @Size(min=8,max=100) String password) {
        public Register {
            username = username == null ? null : username.trim().toLowerCase(java.util.Locale.ROOT);
            displayName = displayName == null ? null : displayName.trim();
        }
    }
    public record Login(@NotBlank String username, @NotBlank String password) {}
    public record Profile(
        Long id, String username, String displayName, String role,
        long totalXp, long level, long xpInLevel, boolean placementEligible,
        int pvpElo, int pvpPeakElo, String pvpRankTier, String pvpRankTitle,
        int pvpWins, int pvpLosses, int pvpDraws, int pvpWinStreak,
        String equippedFrame, String equippedBadge
    ) {
        public Profile(Long id, String username, String displayName, String role, long totalXp, long level, long xpInLevel, boolean placementEligible) {
            this(id, username, displayName, role, totalXp, level, xpInLevel, placementEligible,
                 1000, 1000, "BRONZE", "Đồng", 0, 0, 0, 0, "FRAME_DEFAULT", null);
        }
        public static Profile from(User u) {
            var rank = PvpRankRules.fromElo(u.pvpElo);
            return new Profile(
                u.id, u.username, u.displayName, u.role,
                u.totalXp, u.totalXp/1000+1, u.totalXp%1000, u.placementEligible,
                u.pvpElo, u.pvpPeakElo, rank.code(), rank.title(),
                u.pvpWins, u.pvpLosses, u.pvpDraws, u.pvpWinStreak,
                u.equippedFrame != null ? u.equippedFrame : "FRAME_DEFAULT", u.equippedBadge
            );
        }
    }
    @GetMapping("/csrf") public Map<String,String> csrf(CsrfToken token) { return Map.of("token", token.getToken()); }
    static void validatePassword(String password) {
        if(password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length>72)
            throw new ApiException(HttpStatus.BAD_REQUEST,"PASSWORD_TOO_LONG","Mật khẩu không được vượt quá 72 byte UTF-8");
    }
    @org.springframework.transaction.annotation.Transactional
    @PostMapping("/register") public ResponseEntity<Profile> register(@Valid @RequestBody Register body) {
        validatePassword(body.password());
        String name=body.username();
        if(users.existsByUsernameIgnoreCase(name)) throw new ApiException(HttpStatus.CONFLICT,"USERNAME_TAKEN","Tên đăng nhập đã được dùng");
        User user=new User(name,body.displayName().trim(),encoder.encode(body.password()));user.placementEligible=true;user=users.save(user);
        placement.enrollNewUser(user.id);
        return ResponseEntity.status(201).body(Profile.from(user));
    }
    @PostMapping("/login") public Profile login(@Valid @RequestBody Login body, HttpServletRequest request, HttpServletResponse response) {
        validatePassword(body.password());
        Authentication auth;
        try { auth=manager.authenticate(new UsernamePasswordAuthenticationToken(body.username(),body.password())); }
        catch(AuthenticationException e) { throw new ApiException(HttpStatus.UNAUTHORIZED,"LOGIN_FAILED","Tài khoản hoặc mật khẩu không đúng"); }
        request.getSession(true);
        request.changeSessionId();
        var context=SecurityContextHolder.createEmptyContext(); context.setAuthentication(auth);
        SecurityContextHolder.setContext(context);
        contextRepository.saveContext(context,request,response);
        return Profile.from(users.findByUsernameIgnoreCase(auth.getName()).orElseThrow());
    }
    @GetMapping("/me") public Profile me(Authentication auth) {
        User user=users.findByUsernameIgnoreCase(auth.getName()).orElseThrow();
        if(user.locked) throw new ApiException(HttpStatus.FORBIDDEN,"ACCOUNT_LOCKED","Tài khoản đã bị khóa");
        return Profile.from(user);
    }
}
