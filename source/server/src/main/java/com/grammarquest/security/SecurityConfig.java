package com.grammarquest.security;

import com.grammarquest.domain.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.cors.CorsConfiguration;
import java.util.List;

@Configuration
public class SecurityConfig {
    @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }
    @Bean UserDetailsService userDetailsService(UserRepository users) {
        return username -> users.findByUsernameIgnoreCase(username)
            .map(u -> org.springframework.security.core.userdetails.User.withUsername(u.username)
                .password(u.passwordHash).roles(u.role).accountLocked(u.locked).build())
            .orElseThrow(() -> new org.springframework.security.core.userdetails.UsernameNotFoundException("Không tìm thấy tài khoản"));
    }
    @Bean AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception {
        return configuration.getAuthenticationManager();
    }
    @Bean HttpSessionSecurityContextRepository securityContextRepository() { return new HttpSessionSecurityContextRepository(); }
    @Bean SecurityFilterChain filterChain(HttpSecurity http, @Value("${app.allowed-origin}") String origin,
                                          HttpSessionSecurityContextRepository contextRepository,
                                          ObjectMapper json) throws Exception {
        var csrf = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrf.setCookieCustomizer(cookie -> cookie.path("/").sameSite("Lax"));
        var handler = new CsrfTokenRequestAttributeHandler();
        handler.setCsrfRequestAttributeName(null);
        http.cors(cors -> cors.configurationSource(request -> {
            var config = new CorsConfiguration();
            config.setAllowedOrigins(List.of(origin.split("\\s*,\\s*")));
            config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
            config.setAllowedHeaders(List.of("Content-Type", "X-XSRF-TOKEN", "X-Request-Id"));
            config.setAllowCredentials(true);
            return config;
        })).csrf(c -> c.csrfTokenRepository(csrf).csrfTokenRequestHandler(handler))
          .securityContext(c -> c.securityContextRepository(contextRepository))
          .authorizeHttpRequests(a -> a
              .requestMatchers(HttpMethod.GET, "/api/v1/auth/csrf").permitAll()
              .requestMatchers(HttpMethod.POST, "/api/v1/auth/login", "/api/v1/auth/register").permitAll()
              .requestMatchers("/error").permitAll()
              .anyRequest().authenticated())
          .exceptionHandling(e -> e.authenticationEntryPoint((req,res,ex) -> {
              res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
              res.setContentType("application/json;charset=UTF-8");
              json.writeValue(res.getWriter(),java.util.Map.of("code","UNAUTHENTICATED","message","Vui lòng đăng nhập","fields",java.util.Map.of(),"requestId",java.util.Objects.toString(req.getAttribute("requestId"),"")));
          }).accessDeniedHandler((req,res,ex) -> {
              res.setStatus(HttpServletResponse.SC_FORBIDDEN);
              res.setContentType("application/json;charset=UTF-8");
              json.writeValue(res.getWriter(),java.util.Map.of("code","FORBIDDEN","message","Không có quyền hoặc CSRF token không hợp lệ","fields",java.util.Map.of(),"requestId",java.util.Objects.toString(req.getAttribute("requestId"),"")));
          }))
          .logout(l -> l.logoutUrl("/api/v1/auth/logout").invalidateHttpSession(true)
              .deleteCookies("JSESSIONID").logoutSuccessHandler((req,res,auth) -> res.setStatus(204)));
        return http.build();
    }
}
