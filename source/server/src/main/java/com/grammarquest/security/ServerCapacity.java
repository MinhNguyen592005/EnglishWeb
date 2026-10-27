package com.grammarquest.security;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.LongAdder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Bounded admission, no waiting queue. REST, raw WebSocket and legacy STOMP share one budget. */
@Component
public class ServerCapacity {

    private final int maxSockets, maxSocketsPerAccount, maxRequests;
    private final Map<String, String> connections = new HashMap<>();
    private final Map<String, Integer> accountConnections = new HashMap<>();
    private final Semaphore requests;
    private final LongAdder rejectedRequests = new LongAdder(),
        rejectedConnections = new LongAdder();

    public ServerCapacity(
        @Value("${app.capacity.max-sockets:200}") int maxSockets,
        @Value("${app.capacity.max-sockets-per-account:5}") int perAccount,
        @Value("${app.capacity.max-concurrent-requests:32}") int maxRequests
    ) {
        if (maxSockets < 1 || perAccount < 1 || maxRequests < 1) throw new IllegalArgumentException(
            "Capacity limits must be positive"
        );
        this.maxSockets = maxSockets;
        this.maxSocketsPerAccount = perAccount;
        this.maxRequests = maxRequests;
        requests = new Semaphore(maxRequests);
    }

    public synchronized boolean register(String socketId, String username) {
        if (connections.containsKey(socketId)) return true;
        String account = username.toLowerCase(java.util.Locale.ROOT);
        if (
            connections.size() >= maxSockets ||
            accountConnections.getOrDefault(account, 0) >= maxSocketsPerAccount
        ) {
            rejectedConnections.increment();
            return false;
        }
        connections.put(socketId, account);
        accountConnections.merge(account, 1, Integer::sum);
        return true;
    }

    public synchronized void unregister(String socketId) {
        String account = connections.remove(socketId);
        if (account != null) accountConnections.computeIfPresent(account, (key, count) ->
            count <= 1 ? null : count - 1
        );
    }

    public boolean tryEnter() {
        boolean entered = requests.tryAcquire();
        if (!entered) rejectedRequests.increment();
        return entered;
    }

    public void leave() {
        requests.release();
    }

    public synchronized Map<String, Object> metrics() {
        return Map.of(
            "maxSockets",
            maxSockets,
            "maxSocketsPerAccount",
            maxSocketsPerAccount,
            "reservedSockets",
            connections.size(),
            "maxConcurrentRequests",
            maxRequests,
            "activeRequests",
            maxRequests - requests.availablePermits(),
            "rejectedRequests",
            rejectedRequests.sum(),
            "rejectedConnections",
            rejectedConnections.sum()
        );
    }
}
