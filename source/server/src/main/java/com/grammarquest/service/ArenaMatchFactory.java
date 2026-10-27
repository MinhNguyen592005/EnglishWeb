package com.grammarquest.service;

import com.grammarquest.controller.ArenaController;
import com.grammarquest.repository.UserRepository;
import java.util.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ArenaMatchFactory {

    private final ArenaController arena;
    private final UserRepository users;

    public ArenaMatchFactory(ArenaController arena, UserRepository users) {
        this.arena = arena;
        this.users = users;
    }

    @Transactional
    public Map<String, Map<String, Object>> create(String first, String second) {
        var a = users.findByUsernameIgnoreCase(first).orElseThrow();
        var b = users.findByUsernameIgnoreCase(second).orElseThrow();
        for (long id : java.util.stream.LongStream.of(a.id, b.id).sorted().toArray())
            users.findWithLockById(id).orElseThrow();
        var authA = new UsernamePasswordAuthenticationToken(first, null, List.of());
        var authB = new UsernamePasswordAuthenticationToken(second, null, List.of());
        var hostSnapshot = arena.createMatched(authA, authB);
        long id = ((Number) hostSnapshot.get("id")).longValue();
        return Map.of(first, hostSnapshot, second, arena.get(authB, id));
    }
}
