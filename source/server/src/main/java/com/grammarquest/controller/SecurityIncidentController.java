package com.grammarquest.controller;

import com.grammarquest.service.SecurityIncidentService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/admin/security-incidents")
public class SecurityIncidentController {
    private final SecurityIncidentService service;
    public SecurityIncidentController(SecurityIncidentService service){this.service=service;}
    public record Decision(@NotBlank @Pattern(regexp="WARN|LOCK|DISMISS") String action,@NotNull @Size(max=500) String note) {}
    @GetMapping public List<Map<String,Object>> list(Authentication auth){return service.list(auth.getName());}
    @PostMapping("/{id}/decision") public Map<String,Boolean> decide(Authentication auth,@PathVariable long id,@Valid @RequestBody Decision body){
        service.decide(auth.getName(),id,body.action(),body.note());return Map.of("ok",true);
    }
}
