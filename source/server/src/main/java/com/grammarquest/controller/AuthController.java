package com.grammarquest.controller;

import com.grammarquest.entity.*;
import com.grammarquest.repository.*;
import com.grammarquest.exception.ApiException;
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
                           @NotBlank @Size(min=8,max=100) String password) {}
    public record Login(@NotBlank String username, @NotBlank String password) {}
    public record Profile(Long id, String username, String displayName, String role, long totalXp, long level, long xpInLevel,boolean placementEligible) {
        public static Profile from(User u) { return new Profile(u.id,u.username,u.displayName,u.role,u.totalXp,u.totalXp/1000+1,u.totalXp%1000,u.placementEligible); }
    }
    @GetMapping("/csrf") public Map<String,String> csrf(CsrfToken token) { return Map.of("token", token.getToken()); }
    @org.springframework.transaction.annotation.Transactional
    @PostMapping("/register") public ResponseEntity<Profile> register(@Valid @RequestBody Register body) {
        String name=body.username().trim().toLowerCase();
        if(users.existsByUsernameIgnoreCase(name)) throw new ApiException(HttpStatus.CONFLICT,"USERNAME_TAKEN","Tên đăng nhập đã được dùng");
        User user=new User(name,body.displayName().trim(),encoder.encode(body.password()));user.placementEligible=true;user=users.save(user);
        placement.enrollNewUser(user.id);
        return ResponseEntity.status(201).body(Profile.from(user));
    }
    @PostMapping("/login") public Profile login(@Valid @RequestBody Login body, HttpServletRequest request, HttpServletResponse response) {
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
