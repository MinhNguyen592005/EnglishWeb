package com.grammarquest.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.grammarquest.repository.UserRepository;
import com.grammarquest.service.SocketLearningService;
import com.grammarquest.exception.ApiException;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;

import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.List;
import java.util.Comparator;

@Component
public class SystemSocketHandler extends TextWebSocketHandler {
    @org.springframework.beans.factory.annotation.Autowired
    private com.grammarquest.service.SocketWorkspaceService workspaces;
    private static class WorkspaceWatch {
        final String username,kind;
        String snapshot="";
        WorkspaceWatch(String username,String kind){this.username=username;this.kind=kind;}
    }
    // Cấp phát tài nguyên: một đăng ký workspace và JSON gần nhất trên mỗi socket.
    private final ConcurrentHashMap<String,WorkspaceWatch> workspaceWatches=new ConcurrentHashMap<>();
    private record SnapshotKey(String username,Long resourceId,Long secondaryId,String kind) {}
    private record EncodedSnapshot(Object data,String encoded) {}
    // Cache lasts for one scheduler tick only; never shared across different users.
    private EncodedSnapshot encodeSnapshot(Object data) throws com.fasterxml.jackson.core.JsonProcessingException {
        return new EncodedSnapshot(data,json.writeValueAsString(data));
    }
    private final ConcurrentHashMap<String,Long> eventCursors=new ConcurrentHashMap<>();
    @org.springframework.beans.factory.annotation.Autowired
    private com.grammarquest.security.ServerCapacity capacity;
    public Map<String,Object> capacityMetrics(){return capacity==null?Map.of():capacity.metrics();}
    @org.springframework.beans.factory.annotation.Autowired
    private com.grammarquest.service.SupportChatService support;
    // One support subscription per socket; history is in MySQL, not retained in this map.
    private final ConcurrentHashMap<String,Long> supportWatches=new ConcurrentHashMap<>();
    private final NetworkEventLog networkEvents=new NetworkEventLog();
    public List<NetworkEventLog.Event> networkEvents() { return networkEvents.snapshot(); }
    private static final Logger log = LoggerFactory.getLogger(SystemSocketHandler.class);
    private final com.grammarquest.security.AnswerRateLimiter limiter;
    private final com.grammarquest.service.ArenaSnapshotStore arenaSnapshots;
    private final ObjectMapper json;
    private final UserRepository users;
    private final SocketLearningService learning;
    private final com.grammarquest.service.ArenaMatchmaker matchmaker;
    private final com.grammarquest.service.SocketArenaService arenaSocket;
    private final com.grammarquest.service.LiveExamService exams;
    private final com.grammarquest.service.SocketClassroomService classrooms;
    private final com.grammarquest.service.LearnerReportService learnerReports;
    // Cấp phát RAM: snapshot hồ sơ nhỏ theo socket, chỉ push khi dữ liệu tài khoản thay đổi.
    private final ConcurrentHashMap<String,com.grammarquest.controller.AuthController.Profile> profiles=new ConcurrentHashMap<>();
    private static class ClassWatch {
        final String username;
        final Long classId,assignmentId;
        String snapshot="";
        ClassWatch(String username,Long classId,Long assignmentId){this.username=username;this.classId=classId;this.assignmentId=assignmentId;}
    }
    // Cấp phát tài nguyên: mỗi socket giữ một đăng ký lớp/danh sách và snapshot JSON riêng trên RAM.
    private final ConcurrentHashMap<String,ClassWatch> classWatches=new ConcurrentHashMap<>();
    private record ExamWatch(String username,long examId,String snapshot) {}
    // Cấp phát tài nguyên: một snapshot đề/bài làm cá nhân cho mỗi tab theo dõi kiểm tra.
    private final ConcurrentHashMap<String,ExamWatch> examWatches=new ConcurrentHashMap<>();
    private record ArenaWatch(String username,long roomId,long version) {}
    private final ConcurrentHashMap<String,ArenaWatch> arenaWatches=new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, UserSession> userSessions = new ConcurrentHashMap<>();
    public record OnlineAccount(Long id, String username) {}
    private final ConcurrentHashMap<String, OnlineAccount> accounts = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> accountRoles = new ConcurrentHashMap<>();
    // Cấp phát tài nguyên: mỗi kết nối giữ một session trong RAM, truy cập thread-safe.
    private final ConcurrentHashMap<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> roles = new ConcurrentHashMap<>();

    public SystemSocketHandler(ObjectMapper json, UserRepository users, SocketLearningService learning,com.grammarquest.service.ArenaMatchmaker matchmaker,com.grammarquest.service.SocketArenaService arenaSocket,com.grammarquest.service.LiveExamService exams,com.grammarquest.service.SocketClassroomService classrooms,com.grammarquest.service.LearnerReportService learnerReports,com.grammarquest.security.AnswerRateLimiter limiter,com.grammarquest.service.ArenaSnapshotStore arenaSnapshots) {
        this.json=json; this.users=users; this.learning=learning; this.matchmaker=matchmaker;this.arenaSocket=arenaSocket;
        this.exams=exams;
        this.classrooms=classrooms;
        this.learnerReports=learnerReports;this.limiter=limiter;this.arenaSnapshots=arenaSnapshots;
    }

    @org.springframework.context.event.EventListener
    public void sessionRevoked(com.grammarquest.security.SocketSessionRegistry.Revoked event){var socket=sessions.get(event.socketId());if(socket!=null)disconnect(socket,new CloseStatus(event.code(),event.reason()));}
    @org.springframework.context.event.EventListener
    public void answerThrottled(com.grammarquest.security.AnswerRateLimiter.Limited event){
        networkEvents.add("WARNING","Tạm dừng đáp án 10 giây cho '"+event.username()+"' ("+event.count()+" yêu cầu/giây); không chặn IP dùng chung.");
        accounts.forEach((id,account)->{if(account.username().equalsIgnoreCase(event.username())){var socket=sessions.get(id);if(socket!=null)disconnect(socket,new CloseStatus(4005,"Answer rate exceeded"));}});
    }
    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        var principal = session.getPrincipal();
        var user = principal == null ? null : users.findByUsernameIgnoreCase(principal.getName()).orElse(null);
        if (user == null || user.locked) {
            disconnect(session, user!=null&&user.locked?new CloseStatus(4003,"Account locked"):CloseStatus.POLICY_VIOLATION);
            return;
        }
        // Cấp phát tài nguyên: danh tính lấy từ phiên đăng nhập, không tin ID/username do client gửi.
        accounts.put(session.getId(), new OnlineAccount(user.id, user.username));
        userSessions.put(session.getId(), new UserSession(user.id,user.username));
        accountRoles.put(session.getId(), user.role);
        // Bộ đệm có giới hạn 512 KiB cho snapshot tối đa 100 tin nhắn Unicode, thời gian gửi 5 giây.
        sessions.put(session.getId(), new ConcurrentWebSocketSessionDecorator(session, 5000, 524288));
        roles.put(session.getId(), "GUEST");
        log.info("System client connected: id={}, connections={}", session.getId(), sessions.size());
        networkEvents.add("INFO","User '"+user.username+"' (ID "+user.id+") vừa mở luồng TCP/WebSocket "+session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String requestId = "";
        boolean admitted=false;
        try {
            var body = json.readTree(message.getPayload());
            if (body == null) return;
            requestId = body.path("requestId").asText("");
            if(capacity!=null){
                if(!capacity.tryEnter()){sendTo(session.getId(),"ERROR",Map.of("code","SERVER_BUSY","message","Máy chủ đang bận. Vui lòng thử lại sau vài giây.","retryAfterSeconds",3),requestId);return;}
                admitted=true;
            }
            var state = userSessions.get(session.getId());
            if (state == null) { disconnect(session, CloseStatus.POLICY_VIOLATION); return; }
            var authenticated=users.findByUsernameIgnoreCase(state.username).orElse(null);
            if(authenticated==null || authenticated.locked) {
                sendTo(session.getId(),"ACCOUNT_LOCKED",Map.of("message","Tài khoản không còn khả dụng hoặc đã bị khóa. Vui lòng liên hệ quản trị viên."),"");
                disconnect(session,new CloseStatus(4003,"Account unavailable")); return;
            }
            state.received();
            updateAccountRole(session.getId(),authenticated.role);
            if(!"ADMIN".equals(authenticated.role)) roles.put(session.getId(),"GUEST");
            String action=body.path("action").asText();
            if(java.util.Set.of("SUBMIT_ANSWER","ARENA_ANSWER","EXAM_ANSWER").contains(action))limiter.check(state.username);
            if(action.startsWith("SUPPORT_")){
                var payload=body.path("payload");Object result;
                switch(action){
                    case "SUPPORT_OPEN" -> {
                        var data=support.open(state.username,payload);long id=((Number)data.get("id")).longValue();
                        supportWatches.put(session.getId(),id);if(!sessions.containsKey(session.getId()))supportWatches.remove(session.getId());result=data;
                    }
                    case "SUPPORT_LIST" -> result=support.list(state.username);
                    case "SUPPORT_SEND" -> {result=support.send(state.username,payload);state.touch();}
                    case "SUPPORT_UNWATCH" -> {supportWatches.remove(session.getId());result=Map.of("ok",true);}
                    default -> throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST,"UNKNOWN_ACTION","Unknown support action");
                }
                sendTo(session.getId(),"SUPPORT_DATA",result,requestId);return;
            }
            if(action.startsWith("CLASS_")) {
                var payload=body.path("payload");
                if(action.equals("CLASS_UNWATCH")){releaseClass(session.getId());sendTo(session.getId(),"CLASS_DATA",Map.of("ok",true),requestId);return;}
                if(java.util.Set.of("CLASS_LIST","CLASS_OPEN","CLASS_RESULTS","CLASS_CLOSE_RESULTS").contains(action)) {
                    Long classId=action.equals("CLASS_LIST")?null:classrooms.id(payload,"classId");
                    Long assignmentId=action.equals("CLASS_RESULTS")?classrooms.id(payload,"assignmentId"):null;
                    // Chỉ cấp phát sau khi snapshot vượt qua kiểm tra quyền ở service.
                    var watch=new ClassWatch(state.username,classId,assignmentId);
                    synchronized(watch) {
                        var data=classrooms.snapshot(state.username,classId,assignmentId);
                        watch.snapshot=json.writeValueAsString(data);
                        var previous=classWatches.put(session.getId(),watch);
                        if(previous==null||!java.util.Objects.equals(previous.classId,classId))
                            networkEvents.add("SYS","Cấp phát đăng ký "+(classId==null?"danh sách lớp":"lớp #"+classId)+" cho '"+state.username+"'.");
                        sendTo(session.getId(),"CLASS_SNAPSHOT",data,requestId);
                    }
                    if(!action.equals("CLASS_LIST"))state.touch();
                    return;
                }
                var result=classrooms.action(state.username,action,payload);
                if(action.equals("CLASS_START_ASSIGNMENT"))updateAttempt(state,(com.grammarquest.service.LearningService.AttemptView)result);
                if(!action.equals("CLASS_LESSONS"))state.touch();
                sendTo(session.getId(),"CLASS_DATA",result,requestId);return;
            }
            if(action.startsWith("EXAM_")) {
                if(action.equals("EXAM_UNWATCH")) {releaseExam(session.getId());sendTo(session.getId(),"EXAM_DATA",Map.of("ok",true),requestId);return;}
                Object result=exams.action(state.username,action,body.path("payload"));
                if(result instanceof Map<?,?> data && data.get("id") instanceof Number id) {
                    var previous=examWatches.get(session.getId());
                    if(previous!=null&&previous.examId()!=id.longValue())releaseExam(session.getId());
                    if(!examWatches.containsKey(session.getId()))networkEvents.add("SYS","Cấp phát snapshot kiểm tra #"+id+" cho '"+state.username+"'.");
                    examWatches.put(session.getId(),new ExamWatch(state.username,id.longValue(),json.writeValueAsString(result)));
                    updateExamState(state,data);
                }
                if(!action.equals("EXAM_SYNC")&&!action.equals("EXAM_LIST"))state.touch();
                sendTo(session.getId(),"EXAM_DATA",result,requestId);return;
            }
            if(action.startsWith("ARENA_")) {
                if(action.equals("ARENA_UNWATCH")) {
                    releaseArena(session.getId());sendTo(session.getId(),"ARENA_DATA",Map.of("ok",true),requestId);return;
                }
                Object result=arenaSocket.action(state.username,action,body.path("payload"));
                if(java.util.Set.of("ARENA_OPEN","ARENA_CREATE","ARENA_JOIN","ARENA_READY","ARENA_START","ARENA_ANSWER").contains(action)) {
                    if(result instanceof Map<?,?> room&&room.get("id") instanceof Number number){
                        arenaWatches.put(session.getId(),new ArenaWatch(state.username,number.longValue(),-1));
                        allocateArena(session.getId(),room);
                    }
                    else releaseArena(session.getId());
                }
                if(action.equals("ARENA_LEAVE"))releaseArena(session.getId());
                state.touch();
                sendTo(session.getId(),"ARENA_DATA",result,requestId);return;
            }
            if(action.equals("SYSTEM_MONITOR_WATCH")||action.equals("SYSTEM_MONITOR_UNWATCH")){
                if(!"ADMIN".equals(authenticated.role))throw new ApiException(org.springframework.http.HttpStatus.FORBIDDEN,"ADMIN_ONLY","Admin only");
                roles.put(session.getId(),action.equals("SYSTEM_MONITOR_WATCH")?"ADMIN":"GUEST");
                if(action.equals("SYSTEM_MONITOR_WATCH"))eventCursors.put(session.getId(),0L);else eventCursors.remove(session.getId());
                sendTo(session.getId(),"SYSTEM_MONITOR_DATA",Map.of("ok",true),requestId);return;
            }
            if(action.equals("SYSTEM_REMIND")||action.equals("SYSTEM_DISCONNECT")){
                if(!"ADMIN".equals(authenticated.role))throw new ApiException(org.springframework.http.HttpStatus.FORBIDDEN,"ADMIN_ONLY","Chỉ Admin được quản lý kết nối");
                var p=body.path("payload");
                String targetId=p.path("sessionId").asText("");
                var target=sessions.get(targetId);var targetState=userSessions.get(targetId);
                if(target==null||targetState==null)throw new ApiException(org.springframework.http.HttpStatus.NOT_FOUND,"CLIENT_GONE","Client đã ngắt kết nối");
                if(targetId.equals(session.getId()))throw new ApiException(org.springframework.http.HttpStatus.CONFLICT,"SELF_ACTION","Hãy chọn socket khác với tab quản trị hiện tại");
                if(action.equals("SYSTEM_REMIND")){
                    String text=p.path("message").asText("").trim();
                    if(!p.path("message").isTextual()||text.isEmpty()||text.length()>300)throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST,"INVALID_MESSAGE","Lời nhắc phải có từ 1 đến 300 ký tự");
                    sendTo(targetId,"SYSTEM_NOTICE",Map.of("message",text),"");
                    networkEvents.add("INFO","Admin '"+state.username+"' đã gửi lời nhắc tới '"+targetState.username+"'.");
                }else{
                    sendTo(targetId,"SYSTEM_NOTICE",Map.of("message","Quản trị viên đã ngắt kết nối này. Tài nguyên của tab sẽ được thu hồi. Tải lại trang để kết nối lại."),"");
                    networkEvents.add("WARNING","Admin '"+state.username+"' đã ngắt socket của '"+targetState.username+"'; thu hồi tài nguyên của tab.");
                    disconnect(target,new CloseStatus(4006,"Disconnected by administrator"));
                }
                sendTo(session.getId(),"SYSTEM_ACTION_RESULT",Map.of("ok",true),requestId);return;
            }
            if(action.equals("TEACHER_OVERVIEW_WATCH")||action.equals("ADMIN_REPORTS_WATCH")){
                var watch=new WorkspaceWatch(state.username,action.startsWith("TEACHER")?"TEACHER":"REPORTS");
                synchronized(watch){
                    var data=workspaces.snapshot(watch.username,watch.kind);
                    watch.snapshot=json.writeValueAsString(data);
                    workspaceWatches.put(session.getId(),watch);
                    sendTo(session.getId(),"WORKSPACE_DATA",data,requestId);
                }
                return;
            }
            if(action.equals("WORKSPACE_UNWATCH")){
                workspaceWatches.remove(session.getId()); // Thu hồi tài nguyên khi rời trang.
                sendTo(session.getId(),"WORKSPACE_DATA",Map.of("ok",true),requestId);return;
            }
            if(action.equals("ADMIN_REPORT_DECIDE")){
                var result=workspaces.decide(state.username,body.path("payload"));
                state.touch();sendTo(session.getId(),"REPORT_DECISION_DATA",result,requestId);return;
            }
            switch (action) {
                case "ACCOUNT_GET" -> {sendTo(session.getId(),"ACCOUNT_DATA",com.grammarquest.controller.AuthController.Profile.from(authenticated),requestId);return;}
                case "REPORT_USER" -> {sendTo(session.getId(),"REPORT_DATA",learnerReports.report(state.username,body.path("payload")),requestId);state.touch();return;}
                case "QUEUE_JOIN" -> {
                    var result=matchmaker.join(state.username,session.getId());
                    state.update("MATCHMAKING","/arena","","");
                    networkEvents.add("INFO","User '"+state.username+"' vào hàng đợi PvP.");
                    sendTo(session.getId(),"MATCHMAKING_UPDATE",result,requestId);return;
                }
                case "QUEUE_STATUS" -> {sendTo(session.getId(),"MATCHMAKING_UPDATE",matchmaker.status(state.username,session.getId()),requestId);return;}
                case "QUEUE_CANCEL" -> {
                    if("MATCHMAKING".equals(state.getCurrentActivity()))state.update("PVP_LOBBY","/arena","","");
                    sendTo(session.getId(),"MATCHMAKING_UPDATE",matchmaker.cancel(state.username,session.getId()),requestId);return;
                }
                case "START_ATTEMPT" -> {
                    var payload=body.path("payload");
                    String kind=payload.path("kind").asText("");
                    var lessonId=payload.path("lessonId");
                    Long lesson=null;
                    if(!lessonId.isMissingNode() && !lessonId.isNull()) lesson=positiveId(lessonId);
                    var attempt=learning.start(state.username,kind,lesson);
                    updateAttempt(state,attempt);
                    sendTo(session.getId(),"ATTEMPT_DATA",attempt,requestId);
                    return;
                }
                case "GET_ATTEMPT" -> {
                    var attempt=learning.attempt(state.username,positiveId(body.path("payload").path("attemptId")));
                    updateAttempt(state,attempt);
                    sendTo(session.getId(),"ATTEMPT_DATA",attempt,requestId);
                    return;
                }
                case "SUBMIT_ANSWER" -> {
                    var payload=body.path("payload");
                    long id=positiveId(payload.path("attemptId"));
                    var ordinal=payload.path("ordinalNo");
                    var option=payload.path("option");
                    if(!ordinal.isIntegralNumber() || !ordinal.canConvertToInt() || ordinal.asInt()<1 || !option.isTextual() || option.asText().isBlank() || option.asText().length()>255)
                        throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST,"INVALID_ANSWER","Câu trả lời không hợp lệ");
                    // Chấm điểm/XP vẫn do service transaction quyết định, không tin trạng thái client/RAM.
                    var answer=learning.answer(state.username,id,ordinal.asInt(),option.asText());
                    updateAttempt(state,learning.attempt(state.username,id));
                    if(answer.finished()) userSessions.values().forEach(other -> {
                        if(java.util.Objects.equals(other.activeAttemptId(),id)) releaseSnapshot(other,"lượt làm đã hoàn thành ở tab khác");
                    });
                    sendTo(session.getId(),"ANSWER_RESULT",answer,requestId);
                    return;
                }
                case "CLIENT_INTERACTION" -> { state.touch(); return; }
                case "CLIENT_ACTIVITY" -> {
                    String path=body.path("payload").path("path").asText("");
                    String topic=body.path("payload").path("topicSlug").asText("");
                    if(path.length()>200 || topic.length()>80 || !path.startsWith("/")) return;
                    var activity=learning.activity(state.username,path,topic);
                    var examWatch=examWatches.get(session.getId());
                    if(examWatch!=null&&!path.startsWith("/classes/"))releaseExam(session.getId());
                    var classWatch=classWatches.get(session.getId());
                    if(classWatch!=null&&!path.equals(classWatch.classId==null?"/classes":"/classes/"+classWatch.classId))releaseClass(session.getId());
                    if(!path.equals("/arena")){matchmaker.cancel(state.username,session.getId());releaseArena(session.getId());}
                    if(state.activeAttemptId()!=null && !path.equals("/attempts/"+state.activeAttemptId())) releaseSnapshot(state,"rời trang làm bài");
                    state.update(activity.action(),path,activity.topic(),activity.lesson());
                    if(!requestId.isEmpty()) sendTo(session.getId(),"ACTIVITY_UPDATED",Map.of("ok",true),requestId);
                    return;
                }
                case "GET_ROADMAP" -> {
                    var roadmap = learning.roadmap(state.username);
                    String page=state.detail(session.getId()).page();
                    if(page.isEmpty() || page.equals("/roadmap")) state.setCurrentActivity("VIEWING_ROADMAP");
                    releaseSnapshot(state,"quay về lộ trình");
                    if(!body.path("payload").path("passive").asBoolean(false))state.touch();
                    sendTo(session.getId(), "ROADMAP_DATA", roadmap, requestId);
                    return;
                }
                case "VIEW_LESSON_THEORY" -> {
                    var id = body.path("payload").path("lessonId");
                    if (!id.isIntegralNumber() || !id.canConvertToLong() || id.asLong() <= 0) {
                        sendTo(session.getId(), "ERROR", Map.of("code","INVALID_LESSON_ID","message","ID bài học không hợp lệ"),requestId);
                        return;
                    }
                    var lesson = learning.theory(state.username,id.asLong());
                    releaseSnapshot(state,"chuyển sang đọc lý thuyết");
                    state.update("READING_LESSON_"+id.asLong(),"/lessons/"+id.asLong(),lesson.topicTitle(),lesson.title());
                    // Cấp phát tài nguyên học tập: tạo JSON chứa TEXT theory và push riêng socket yêu cầu.
                    sendTo(session.getId(), "LESSON_THEORY_DATA", lesson, requestId);
                    return;
                }
                case "AUTH" -> { }
                default -> {
                    sendTo(session.getId(),"ERROR",Map.of("code","UNKNOWN_ACTION","message","Action không được hỗ trợ"),requestId);
                    return;
                }
            }
            String role = body.path("payload").path("role").asText("GUEST");
            // AUTH chỉ đăng ký nhận telemetry; quyền ADMIN phải khớp tài khoản đã đăng nhập.
            roles.computeIfPresent(session.getId(), (id, old) ->
                "ADMIN".equals(role) && "ADMIN".equals(accountRoles.get(id)) ? "ADMIN" : "GUEST");
            if("ADMIN".equals(roles.get(session.getId())))eventCursors.put(session.getId(),0L);else eventCursors.remove(session.getId());
            log.info("System client role updated: id={}, role={}", session.getId(), roles.get(session.getId()));
        } catch (com.fasterxml.jackson.core.JsonProcessingException ex) {
            disconnect(session, CloseStatus.BAD_DATA);
        } catch (ApiException ex) {
            sendTo(session.getId(),"ERROR",Map.of("code",ex.code,"message",ex.getMessage()),requestId);
        } catch (RuntimeException ex) {
            log.error("Learning socket request failed",ex);
            sendTo(session.getId(),"ERROR",Map.of("code","SERVER_ERROR","message","Không thể tải dữ liệu học tập"),requestId);
        } finally {if(admitted)capacity.leave();}
    }

    @org.springframework.transaction.event.TransactionalEventListener(phase=org.springframework.transaction.event.TransactionPhase.AFTER_COMMIT)
    public void supportChanged(com.grammarquest.service.SupportChatService.Changed event){
        try {
        long threadId=((Number)event.conversation().get("id")).longValue();
        var currentUsers=new java.util.HashMap<Long,com.grammarquest.entity.User>();
        users.findAllById(accounts.values().stream().map(OnlineAccount::id).distinct().toList()).forEach(u->currentUsers.put(u.id,u));
        accounts.forEach((id,account)->{
            var user=currentUsers.get(account.id());
            if(user==null||user.locked||(!account.id().equals(event.ownerId())&&!"ADMIN".equals(user.role)))return;
            try{
                if(java.util.Objects.equals(supportWatches.get(id),threadId))sendTo(id,"SUPPORT_UPDATE",event.conversation(),"");
                if(account.id()==event.ownerId()&&event.reply())sendTo(id,"SUPPORT_NOTIFICATION",Map.of("threadId",threadId,"lastMessageId",event.conversation().get("lastMessageId")),"");
                if("ADMIN".equals(user.role))sendTo(id,"SUPPORT_THREAD_CHANGED",Map.of("threadId",threadId),"");
            }catch(IOException ex){log.debug("Support notification failed for {}",id,ex);}
        });
        } catch (RuntimeException ex) {
            // Tin nhắn đã COMMIT: lỗi push không được biến lần gửi thành thất bại.
            // Client có thể đọc lại lịch sử bền vững khi mở lại hoặc kết nối lại.
            log.warn("Could not deliver committed support message",ex);
        }
    }
    @org.springframework.context.event.EventListener
    public void reportReceived(com.grammarquest.service.RealtimeNotifier.Reported event) {
        accounts.forEach((id,account)->{
            try {
                if(account.id()==event.reporterId())sendTo(id,"REPORT_SUBMITTED",Map.of("source",event.source(),"reportId",event.reportId(),"status","OPEN","message","Server đã tiếp nhận báo cáo của bạn và chuyển đến quản trị viên để xem xét."),"");
                if(account.id()==event.targetId())sendTo(id,"REPORT_RECEIVED",Map.of("source",event.source(),"reportId",event.reportId(),"message","Tài khoản của bạn vừa nhận một báo cáo. Quản trị viên sẽ xem xét; bạn chưa bị xác định vi phạm. Hãy giữ tương tác lịch sự và tôn trọng mọi người."),"");
                if("ADMIN".equals(accountRoles.get(id)))sendTo(id,"REPORT_CREATED",Map.of("source",event.source(),"reportId",event.reportId()),"");
            }catch(Exception ex){log.debug("Report notification failed for {}",id,ex);}
        });
    }
    @org.springframework.transaction.event.TransactionalEventListener(phase=org.springframework.transaction.event.TransactionPhase.AFTER_COMMIT)
    public void reportResolved(com.grammarquest.service.ReportResolved event){
        String message=switch(event.decision()){
            case "DISMISS" -> "Quản trị viên đã xem xét và khép lại báo cáo liên quan đến bạn. Không áp dụng hình thức xử lý từ báo cáo này.";
            case "WARN" -> "Quản trị viên đã gửi cảnh báo đến tài khoản của bạn. Vui lòng tuân thủ quy định cộng đồng.";
            case "MUTE_24H" -> "Quản trị viên đã tạm cấm tài khoản của bạn nhắn tin trong 24 giờ.";
            case "LOCK" -> "Tài khoản của bạn đã bị quản trị viên khóa. Vui lòng liên hệ để được hỗ trợ.";
            default -> "Quản trị viên đã xem xét báo cáo liên quan đến tài khoản của bạn.";
        };
        String outcome=switch(event.decision()){
            case "DISMISS" -> "không áp dụng hình thức xử lý";
            case "WARN" -> "gửi cảnh báo đến tài khoản được báo cáo";
            case "MUTE_24H" -> "cấm tài khoản được báo cáo nhắn tin trong 24 giờ";
            case "LOCK" -> "khóa tài khoản được báo cáo";
            default -> "hoàn tất xem xét";
        };
        accounts.forEach((id,account)->{
            boolean reporter=account.id()==event.reporterId(),target=account.id()==event.targetId();
            if(!reporter&&!target)return;
            try{sendTo(id,"REPORT_DECISION",Map.of("source",event.source(),"reportId",event.reportId(),"decision",event.decision(),"recipient",reporter?"REPORTER":"TARGET","message",reporter?"Báo cáo #"+event.reportId()+" của bạn đã được quản trị viên xử lý: "+outcome+".":message),"");}
            catch(IOException ex){log.debug("Report decision notification failed for {}",id,ex);}
            finally{if(target&&"LOCK".equals(event.decision())){var socket=sessions.get(id);if(socket!=null)disconnect(socket,new CloseStatus(4003,"Account locked"));}}
        });
    }
    @org.springframework.scheduling.annotation.Scheduled(fixedDelay=1000)
    public void pushAccountUpdates() {
        var recipients=new java.util.HashMap<Long,java.util.List<String>>();
        accounts.forEach((id,account)->recipients.computeIfAbsent(account.id(),key->new java.util.ArrayList<>()).add(id));
        if(recipients.isEmpty())return;
        users.findAllById(recipients.keySet()).forEach(user->{
            var profile=com.grammarquest.controller.AuthController.Profile.from(user);
            recipients.getOrDefault(user.id,List.of()).forEach(id->{
                var account=accounts.get(id);if(account==null||!account.id().equals(user.id))return;
                try {
                    if(user.locked){sendTo(id,"ACCOUNT_LOCKED",Map.of("message","Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên để được hỗ trợ."),"");var socket=sessions.get(id);if(socket!=null)disconnect(socket,new CloseStatus(4003,"Account locked"));return;}
                    updateAccountRole(id,user.role);
                    var previous=profiles.put(id,profile);
                    if(!profile.equals(previous))sendTo(id,"ACCOUNT_UPDATE",profile,"");
                }catch(Exception ex){log.warn("Account push failed for {}",id,ex);}
            });
        });
    }

    private void updateAccountRole(String id,String role) {
        String oldRole=accountRoles.put(id,role);
        if(oldRole!=null&&!oldRole.equals(role)) {
            roles.put(id,"ADMIN".equals(role)?"ADMIN":"GUEST");
            supportWatches.remove(id);releaseClass(id);releaseExam(id);releaseArena(id);matchmaker.disconnect(id);
            var state=userSessions.get(id);if(state!=null)releaseSnapshot(state,"thay đổi quyền tài khoản");
        }
    }

    @SuppressWarnings("unchecked")
    private void allocateArena(String id,Map<?,?> room){
        if(!"IN_PROGRESS".equals(room.get("status"))){arenaSnapshots.release(id);var state=userSessions.get(id);if(state!=null)state.allocateArena(null,0);return;}
        long roomId=((Number)room.get("id")).longValue();int count=arenaSnapshots.acquire(id,roomId);
        var state=userSessions.get(id);if(state!=null){boolean fresh=!java.util.Objects.equals(state.detail(id).activeArenaId(),roomId);state.allocateArena(roomId,count);if(fresh)networkEvents.add("SYS","Cấp phát tham chiếu gói PvP #"+roomId+" ("+count+" câu) cho '"+state.username+"'.");}
        if(room.get("question") instanceof Map<?,?> visible&&visible.get("roundNo") instanceof Number number){
            var cached=arenaSnapshots.question(id,number.intValue());
            if(cached!=null)((Map<String,Object>)room).put("question",Map.of("roundNo",cached.roundNo(),"prompt",cached.prompt(),"options",cached.options()));
        }
    }
    private void releaseArena(String id){
        arenaWatches.remove(id);arenaSnapshots.release(id);var state=userSessions.get(id);
        if(state!=null){if(state.detail(id).activeArenaId()!=null)networkEvents.add("SYS","Thu hồi tham chiếu gói PvP của '"+state.username+"'.");state.allocateArena(null,0);}
    }
    public int arenaSnapshotCount(){return arenaSnapshots.packetCount();}
    private void releaseClass(String id) {
        // Thu hồi tài nguyên: bỏ đăng ký và snapshot khi rời lớp/đóng socket; DB không bị xóa.
        var watch=classWatches.remove(id);
        if(watch!=null)networkEvents.add("SYS","Thu hồi đăng ký lớp và snapshot của '"+watch.username+"'.");
    }
    @org.springframework.scheduling.annotation.Scheduled(fixedDelay=1000)
    public void pushClassroomUpdates() {
        var tick=new java.util.HashMap<SnapshotKey,EncodedSnapshot>();
        classWatches.forEach((id,watch)->{
            synchronized(watch) {
                if(classWatches.get(id)!=watch)return;
                try {
                    var socket=sessions.get(id);if(socket==null||!socket.isOpen()){releaseClass(id);return;}
                    var key=new SnapshotKey(watch.username,watch.classId,watch.assignmentId,"CLASS");
                    var cached=tick.get(key);
                    if(cached==null){cached=encodeSnapshot(classrooms.snapshot(watch.username,watch.classId,watch.assignmentId));tick.put(key,cached);}
                    var data=cached.data();String snapshot=cached.encoded();
                    if(!snapshot.equals(watch.snapshot)&&classWatches.get(id)==watch){
                        watch.snapshot=snapshot;sendTo(id,"CLASS_UPDATE",data,"");
                    }
                }catch(ApiException ex){
                    if(classWatches.remove(id,watch)){
                        networkEvents.add("SYS","Thu hồi đăng ký lớp của '"+watch.username+"' do không còn quyền truy cập.");
                        try{sendTo(id,"CLASS_ERROR",Map.of("message",ex.getMessage()),"");}catch(IOException ignored){}
                    }
                }catch(Exception ex){log.warn("Classroom push failed for {}",id,ex);}
            }
        });
    }

    private void updateExamState(UserSession state,Map<?,?> data) {
        long id=((Number)data.get("id")).longValue();
        state.allocateExam(id,((com.fasterxml.jackson.databind.JsonNode)data.get("questions")).size());
        state.setCurrentActivity(Boolean.TRUE.equals(data.get("owner"))?"MONITORING_EXAM":
            Boolean.TRUE.equals(data.get("submitted"))||Boolean.TRUE.equals(data.get("closed"))?"VIEWING_EXAM_RESULT":"TAKING_EXAM");
    }
    private void releaseExam(String id) {
        // Thu hồi tài nguyên: bỏ snapshot và liên kết client; dữ liệu bài làm đã lưu DB vẫn giữ nguyên.
        var previous=examWatches.remove(id);var state=userSessions.get(id);
        if(state!=null){state.allocateExam(null,0);if(previous!=null)state.setCurrentActivity("IN_CLASSROOM");}
        if(previous!=null)networkEvents.add("SYS","Thu hồi snapshot kiểm tra #"+previous.examId()+" của '"+previous.username()+"'.");
    }
    @org.springframework.scheduling.annotation.Scheduled(fixedDelay=1000)
    public void pushExamUpdates() {
        var tick=new java.util.HashMap<SnapshotKey,EncodedSnapshot>();
        examWatches.forEach((id,watch)->{
            try {
                var socket=sessions.get(id);if(socket==null||!socket.isOpen()){releaseExam(id);return;}
                // Kiểm tra lại quyền thành viên mỗi lần push; không rò đề/điểm cho người bị xóa khỏi lớp.
                var key=new SnapshotKey(watch.username(),watch.examId(),null,"EXAM");
                var cached=tick.get(key);
                if(cached==null){cached=encodeSnapshot(exams.view(watch.username(),watch.examId()));tick.put(key,cached);}
                @SuppressWarnings("unchecked") var data=(Map<String,Object>)cached.data();String snapshot=cached.encoded();
                if(!snapshot.equals(watch.snapshot())&&examWatches.replace(id,watch,new ExamWatch(watch.username(),watch.examId(),snapshot))) {
                    var state=userSessions.get(id);if(state!=null)updateExamState(state,data);
                    sendTo(id,"EXAM_UPDATE",data,"");
                }
            }catch(ApiException ex){releaseExam(id);try{sendTo(id,"EXAM_ERROR",Map.of("message",ex.getMessage()),"");}catch(IOException ignored){}}
            catch(Exception ex){log.warn("Exam push failed for {}",id,ex);}
        });
    }

    @org.springframework.scheduling.annotation.Scheduled(fixedDelay=1000)
    public void pushArenaUpdates() {
        // Cập nhật presence chỉ cho socket còn sống; payload luôn được cá nhân hóa theo người nhận.
        arenaWatches.forEach((id,watch)->{
            var socket=sessions.get(id);var state=userSessions.get(id);
            if(socket==null||!socket.isOpen()||state==null){if(arenaWatches.remove(id,watch))releaseArena(id);return;}
            if(System.currentTimeMillis()-state.lastPongAt()>25_000)return;
            try {
                var room=arenaSocket.room(watch.username(),watch.roomId());
                if(arenaWatches.get(id)!=watch)return;
                allocateArena(id,room);
                long version=((Number)room.get("stateVersion")).longValue();
                if(version!=watch.version()) {
                    sendTo(id,"ARENA_ROOM_UPDATE",room,"");
                    sendTo(id,"ARENA_MESSAGES_UPDATE",Map.of("roomId",watch.roomId(),"messages",arenaSocket.messages(watch.username(),watch.roomId())),"");
                    arenaWatches.replace(id,watch,new ArenaWatch(watch.username(),watch.roomId(),version));
                }
                if("FINISHED".equals(room.get("status"))||"CANCELLED".equals(room.get("status")))
                    arenaWatches.computeIfPresent(id,(key,current)->{if(current.roomId()!=watch.roomId())return current;arenaSnapshots.release(id);state.allocateArena(null,0);return null;});
            } catch(ApiException ex) {
                if(arenaWatches.remove(id,watch))releaseArena(id);
                try{sendTo(id,"ARENA_ERROR",Map.of("message",ex.getMessage()),"");}catch(IOException ignored){}
            } catch(Exception ex){log.warn("Arena push failed for {}",id,ex);}
        });
        arenaSocket.advance(); // Đồng hồ chạy trên server, không phụ thuộc client polling.
    }

    @org.springframework.scheduling.annotation.Scheduled(fixedDelay=2500)
    public void matchWaitingPlayers() {
        matchmaker.tick(System.currentTimeMillis()).forEach((id,data)->{
            var state=userSessions.get(id);
            if(state!=null&&"MATCHED".equals(data.get("status"))&&"MATCHMAKING".equals(state.getCurrentActivity())) {
                state.update("PLAYING_PVP","/arena","","");
                networkEvents.add("INFO","Đã ghép đối thủ và bắt đầu trận PvP cho '"+state.username+"'.");
            }
            try {sendTo(id,"MATCHMAKING_UPDATE",data,"");}
            catch(IOException ex){var socket=sessions.get(id);if(socket!=null)disconnect(socket,CloseStatus.SERVER_ERROR);}
        });
    }

    @Override
    protected void handlePongMessage(WebSocketSession session,PongMessage message) {
        var state=userSessions.get(session.getId()); if(state!=null) state.pong();
    }

    @org.springframework.scheduling.annotation.Scheduled(fixedDelay=10000)
    public void maintainConnections() { maintainConnections(System.currentTimeMillis()); }

    public void maintainConnections(long now) {
        userSessions.forEach((id,state)->{
            var socket=sessions.get(id); if(socket==null) return;
            var detail=state.detail(id);
            if(now-detail.lastInteractionAt()>=900_000) {
                networkEvents.add("WARNING","User ID "+state.userId+" không thao tác 15 phút; kick socket và thu hồi RAM");
                disconnect(socket,new CloseStatus(4001,"Idle timeout"));
            } else if(now-state.lastPongAt()>90_000) {
                networkEvents.add("WARNING","User ID "+state.userId+" không phản hồi Pong 90 giây; ngắt và thu hồi RAM");
                disconnect(socket,new CloseStatus(4002,"Heartbeat timeout"));
            } else {
                try { socket.sendMessage(new PingMessage()); }
                catch(IOException | RuntimeException ex) { disconnect(socket,CloseStatus.SERVER_ERROR); }
            }
        });
        remindIdleClients(now);
    }

    public void remindIdleClients(long now) {
        userSessions.forEach((id,state)->{
            var socket=sessions.get(id);
            if(socket==null || !socket.isOpen())return;
            var user=users.findByUsernameIgnoreCase(state.username).orElse(null);
            // Quyền thực từ DB: ADMIN không nhận lời nhắc học tập dù socket đăng ký GUEST.
            if(user==null || user.locked || "ADMIN".equals(user.role) || !state.claimIdleReminder(now))return;
            try {
                sendTo(id,"IDLE_REMINDER",Map.of("message","Nghỉ một chút rồi, mình tiếp tục chinh phục bài học nhé!"),"");
                networkEvents.add("INFO","Đã gửi lời nhắc tiếp tục học cho '"+state.username+"' sau 2 phút không thao tác.");
            } catch(IOException ex) { disconnect(socket,CloseStatus.SERVER_ERROR); }
        });
    }

    private long positiveId(com.fasterxml.jackson.databind.JsonNode value) {
        if(!value.isIntegralNumber() || !value.canConvertToLong() || value.asLong()<1)
            throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST,"INVALID_ID","ID không hợp lệ");
        return value.asLong();
    }
    private void releaseSnapshot(UserSession state,String reason) {
        var detail=state.detail("");
        if(detail.activeAttemptId()==null)return;
        state.releaseAttempt();
        networkEvents.add("SYS","Đã tự động xóa snapshot bài làm của '"+state.username+"', thu hồi "+detail.allocatedQuestions()+" câu hỏi khỏi RAM do "+reason+".");
    }

    private void updateAttempt(UserSession state,com.grammarquest.service.LearningService.AttemptView attempt) {
        Long previous=state.activeAttemptId();
        int previousQuestions=state.detail("").allocatedQuestions();
        String path="/attempts/"+attempt.id()+("IN_PROGRESS".equals(attempt.status())?"":"/result");
        var activity=learning.activity(state.username,path,"");
        state.update(activity.action(),path,activity.topic(),activity.lesson());
        state.allocateAttempt(attempt);
        if(previous!=null&&!java.util.Objects.equals(previous,state.activeAttemptId()))
            networkEvents.add("SYS","Đã xóa snapshot lượt #"+previous+" của '"+state.username+"', thu hồi "+previousQuestions+" câu hỏi khỏi RAM.");
        if(state.activeAttemptId()!=null&&!java.util.Objects.equals(previous,state.activeAttemptId()))
            networkEvents.add("SYS","Đã cấp phát gói đề #"+attempt.id()+" ("+attempt.questions().size()+" câu) trên RAM cho '"+state.username+"'.");
        log.debug("Attempt RAM allocated: user={}, attempt={}, questions={}",state.username,state.activeAttemptId(),
            "IN_PROGRESS".equals(attempt.status())?attempt.questions().size():0);
    }

    private void sendTo(String id,String action,Object payload,String requestId) throws IOException {
        var target=sessions.get(id);
        if(target!=null && target.isOpen()) {
            // Dùng decorator chung với telemetry để bảo vệ send đồng thời.
            try { var state=userSessions.get(id);if(state!=null)state.sent();target.sendMessage(new TextMessage(json.writeValueAsString(Map.of(
                "action",action,"payload",payload,"requestId",requestId)))); }
            catch(IOException | RuntimeException ex) { disconnect(target,CloseStatus.SERVER_ERROR); }
        }
    }

    public String currentActivity(String sessionId) {
        var state=userSessions.get(sessionId);
        return state==null?null:state.getCurrentActivity();
    }

    public List<UserSession.Detail> clientDetails() {
        return userSessions.entrySet().stream().map(entry->entry.getValue().detail(entry.getKey()))
            .sorted(Comparator.comparing(UserSession.Detail::userId).thenComparing(UserSession.Detail::sessionId)).toList();
    }

    public Object matchmakingQueue(){return matchmaker.dashboardQueue();}
    public record Alert(String key,String level,String message,String sessionId) {}
    public List<Alert> systemAlerts(){return systemAlerts(clientDetails());}
    public List<Alert> systemAlerts(List<UserSession.Detail> details){
        var result=new java.util.ArrayList<Alert>();long now=System.currentTimeMillis();
        var runtime=Runtime.getRuntime();
        if((runtime.totalMemory()-runtime.freeMemory())/(double)runtime.maxMemory()>=0.85)
            result.add(new Alert("heap","CRITICAL","Heap JVM đang sử dụng từ 85% giới hạn tối đa trở lên",""));
        for(var c:details){
            if(now-c.lastPongAt()>30_000)result.add(new Alert("pong-"+c.sessionId(),"WARNING",c.username()+": không nhận Pong hơn 30 giây",c.sessionId()));
            if(c.idleSeconds()>=120)result.add(new Alert("idle-"+c.sessionId(),"WARNING",c.username()+": không thao tác "+c.idleSeconds()+" giây",c.sessionId()));
            long allocated=java.util.stream.LongStream.of(c.activeAttemptId()!=null?c.attemptAllocatedAt():0,c.activeExamId()!=null?c.examAllocatedAt():0,c.activeArenaId()!=null?c.arenaAllocatedAt():0).filter(t->t>0).min().orElse(0);
            if(allocated>0&&now-allocated>900_000)result.add(new Alert("resource-"+c.sessionId(),"WARNING",c.username()+": giữ gói đề hơn 15 phút, cần xem xét",c.sessionId()));
        }
        networkEvents.snapshot().stream().filter(e->java.time.Instant.parse(e.time()).toEpochMilli()>now-60_000&&java.util.Set.of("WARNING","CRITICAL").contains(e.level()))
            .forEach(e->result.add(new Alert("event-"+e.id(),e.level(),e.message(),"")));
        return result;
    }
    public int connectionCount() { return sessions.size(); }

    public List<OnlineAccount> onlineAccounts() {
        sessions.forEach((id, session) -> { if (!session.isOpen()) release(id); });
        // Một tài khoản nhiều tab/socket vẫn chỉ tính một lần theo ID.
        return accounts.values().stream().distinct().sorted(Comparator.comparing(OnlineAccount::id)).toList();
    }

    public boolean hasTelemetrySubscribers(){return roles.containsValue("ADMIN");}
    public void broadcastToAdmins(String payload) {
        // Reuse authorization across tabs of the same account within this broadcast.
        var authorized=new java.util.HashMap<String,Boolean>();
        com.fasterxml.jackson.databind.JsonNode stats;
        try{var parsed=json.readTree(payload);stats="STATS_UPDATE".equals(parsed.path("action").asText())?parsed:null;}
        catch(Exception ignored){stats=null;}
        final var telemetry=stats;
        sessions.forEach((id, session) -> {
            if (!session.isOpen()) { release(id); return; }
            if (!"ADMIN".equals(roles.get(id))) return;
            var state=userSessions.get(id);
            boolean allowed=state!=null&&authorized.computeIfAbsent(state.username,name->users.findByUsernameIgnoreCase(name).map(user->!user.locked&&"ADMIN".equals(user.role)).orElse(false));
            if(!allowed) {
                roles.put(id,"GUEST"); return;
            }
            try {
                String outgoing=payload;
                long cursor=eventCursors.getOrDefault(id,0L),nextCursor=cursor;
                if(telemetry!=null){
                    var events=json.createArrayNode();
                    for(var event:telemetry.path("data").path("events")){
                        long eventId=event.path("id").asLong();
                        if(eventId>cursor)events.add(event);
                        nextCursor=Math.max(nextCursor,eventId);
                    }
                    var data=json.createObjectNode();data.setAll((com.fasterxml.jackson.databind.node.ObjectNode)telemetry.path("data"));
                    data.set("events",events);data.put("eventsDelta",true);
                    var root=json.createObjectNode();root.put("action","STATS_UPDATE");root.set("data",data);
                    outgoing=json.writeValueAsString(root);
                }
                session.sendMessage(new TextMessage(outgoing));
                final long deliveredCursor=nextCursor;
                if(telemetry!=null)eventCursors.computeIfPresent(id,(key,old)->Math.max(old,deliveredCursor));
            } catch (IOException | RuntimeException ex) {
                log.warn("System client send failed: id={}", id, ex);
                disconnect(session, CloseStatus.SERVER_ERROR);
            }
        });
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        release(session.getId());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.debug("System client transport error: id={}", session.getId(), exception);
        disconnect(session, CloseStatus.SERVER_ERROR);
    }

    private void disconnect(WebSocketSession session, CloseStatus status) {
        release(session.getId());
        try { if (session.isOpen()) session.close(status); }
        catch (IOException ex) { log.debug("System socket close failed", ex); }
    }

    @org.springframework.scheduling.annotation.Scheduled(fixedDelay=2500)
    public void pushWorkspaces(){
        var tick=new java.util.HashMap<SnapshotKey,EncodedSnapshot>();
        workspaceWatches.forEach((id,watch)->{synchronized(watch){
            if(workspaceWatches.get(id)!=watch)return;
            try{
                var key=new SnapshotKey(watch.username,null,null,watch.kind);
                var cached=tick.get(key);
                if(cached==null){cached=encodeSnapshot(workspaces.snapshot(watch.username,watch.kind));tick.put(key,cached);}
                var data=cached.data();String snapshot=cached.encoded();
                if(!snapshot.equals(watch.snapshot)){
                    sendTo(id,"WORKSPACE_UPDATE",Map.of("kind",watch.kind,"data",data),"");
                    watch.snapshot=snapshot;
                }
            }catch(ApiException ex){
                workspaceWatches.remove(id,watch);
                try{sendTo(id,"WORKSPACE_ERROR",Map.of("message",ex.getMessage()),"");}catch(IOException ignored){}
            }catch(Exception ex){log.warn("Workspace push failed for {}",id,ex);}
        }});
    }
    @org.springframework.transaction.event.TransactionalEventListener(phase=org.springframework.transaction.event.TransactionPhase.AFTER_COMMIT)
    public void curriculumChanged(com.grammarquest.service.CurriculumChanged event){
        sessions.forEach((id,socket)->{try{sendTo(id,"CURRICULUM_CHANGED",Map.of("changed",true),"");}catch(IOException ignored){}});
    }

    private void release(String id) {
        eventCursors.remove(id);
        supportWatches.remove(id);
        workspaceWatches.remove(id); // Thu hồi đăng ký/snapshot workspace khi ngắt kết nối.
        profiles.remove(id); // Thu hồi snapshot tài khoản khi socket đóng.
        releaseClass(id);
        releaseExam(id);
        releaseArena(id);
        matchmaker.disconnect(id); // Thu hồi mục hàng đợi khi socket đóng.
        // Thu hồi tài nguyên: xóa session và role, bỏ tham chiếu để JVM GC thu gom.
        roles.remove(id);
        accounts.remove(id);
        accountRoles.remove(id);
        var state=userSessions.remove(id); // Thu hồi tài nguyên: xóa trạng thái học tập trên RAM.
        if(state!=null) {
            int snapshots=state.activeAttemptId()==null?0:1;
            int questions=state.detail(id).allocatedQuestions();
            state.releaseAttempt();
            if(snapshots>0)networkEvents.add("SYS","Đã tự động xóa snapshot bài làm của '"+state.username+"', thu hồi "+questions+" câu hỏi khỏi RAM do ngắt kết nối.");
            networkEvents.add("INFO","Đã đóng luồng TCP/WebSocket "+id+" của '"+state.username+"'.");
        }
        if (sessions.remove(id) != null)
            log.info("System client disconnected: id={}, connections={}", id, sessions.size());
        supportWatches.remove(id);
    }
}
