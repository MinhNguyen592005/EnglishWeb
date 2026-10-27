package com.grammarquest.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.grammarquest.websocket.SystemSocketHandler;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import java.util.Map;

@Service
public class ServerMonitorService {
    private final SystemSocketHandler sockets;
    private final ObjectMapper json;
    public ServerMonitorService(SystemSocketHandler sockets, ObjectMapper json) {
        this.sockets = sockets;
        this.json = json;
    }

    @Scheduled(fixedDelay = 2500)
    public void broadcastStats() throws JsonProcessingException {
        if(!sockets.hasTelemetrySubscribers())return;
        var clients=sockets.clientDetails();
        Runtime runtime = Runtime.getRuntime();
        // Heap JVM đang sử dụng (MiB), không phải RAM toàn máy hay riêng map session.
        long usedBytes = runtime.totalMemory() - runtime.freeMemory();
        double ram = Math.round(usedBytes / (1024.0 * 1024.0) * 100.0) / 100.0;
        var accounts = sockets.onlineAccounts();
        var data=new java.util.LinkedHashMap<String,Object>();
        data.put("capacity",sockets.capacityMetrics());
        data.put("queue",sockets.matchmakingQueue());data.put("alerts",sockets.systemAlerts(clients));
        data.putAll(Map.of(
                "connections", accounts.size(), "accounts", accounts, "clients", clients, "ram", ram,
                "activeSockets",sockets.connectionCount(),"heapCommitted",runtime.totalMemory()/(1024.0*1024.0),
                "heapMax",runtime.maxMemory()/(1024.0*1024.0),
                "activeSnapshots",clients.stream().mapToLong(c->(c.activeAttemptId()!=null?1:0)+(c.activeExamId()!=null?1:0)).sum()+sockets.arenaSnapshotCount(),
                "events",sockets.networkEvents()));
        String payload=json.writeValueAsString(Map.of("action","STATS_UPDATE","data",data));
        sockets.broadcastToAdmins(payload);
    }
}
