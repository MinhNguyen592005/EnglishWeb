# Server Dashboard qua WebSocket

## Chạy thử

1. Chạy backend ở cổng mặc định 8080 (cần MySQL). pom đã thống nhất Java 21; đặt JAVA_HOME trỏ JDK 21 rồi chạy `./mvnw.cmd spring-boot:run` trong source/server, không cần truyền đè java.version.
2. Trong `source/client`, chạy `npm run dev`.
3. Đăng nhập tài khoản ADMIN, mở `/admin` → **Tổng quan & Máy chủ**. Dashboard đã gộp vào admin; `/system` và `/admin/server-dashboard` đều chuyển sang `/admin`. Giao diện Admin/Teacher dùng phong cách chung với Learner. Xem ROLE_WORKSPACES.md để biết cơ chế session, cooldown theo tài khoản và gói PvP RAM; không còn chặn IP dùng chung.
4. Dùng trình duyệt khác hoặc cửa sổ ẩn danh đăng nhập tài khoản học viên, mở trang học bất kỳ. Sau khoảng 2,5 giây dashboard hiện 2 tài khoản và bảng ID/username. Nhiều tab cùng tài khoản vẫn tính một lần; đóng tất cả tab hoặc đăng xuất sẽ bỏ tài khoản khỏi danh sách.
5. Khởi động lại Vite sau thay đổi proxy: `/api` đã bật `ws: true` để chuyển tiếp handshake WebSocket cùng cookie đăng nhập.

## Các file

- `source/server/pom.xml`: đã có `org.springframework.boot:spring-boot-starter-websocket`, không cần thêm lần nữa. Nếu tạo dự án khác, thêm dependency này trong `<dependencies>`; Gradle tương đương `implementation 'org.springframework.boot:spring-boot-starter-websocket'`.
- `SystemSocketHandler.java`: quản lý session/role bằng ConcurrentHashMap, log connect/disconnect, xử lý AUTH, thu hồi khi đóng/lỗi, chỉ gửi cho ADMIN. Session có decorator để bảo vệ thao tác gửi đồng thời và giới hạn bộ đệm gửi.
- `WebSocketConfig.java`: endpoint `/api/ws-system`, origin `*`, bật scheduling; security chain riêng chỉ cho endpoint demo, giữ cấu hình REST/STOMP hiện tại.
- `ServerMonitorService.java`: đọc heap JVM và đẩy JSON mỗi 2500 ms.
- `ServerDashboardPage.tsx` và CSS: WebSocket thuần, AUTH, state, trạng thái kết nối, cleanup, giao diện flexbox.
- `main.tsx` và `Layout.tsx`: route và liên kết menu quản trị.

## Giao thức

Client gửi khi kết nối mở:

```json
{"action":"AUTH","payload":{"role":"ADMIN"}}
```

Endpoint yêu cầu phiên đăng nhập. Backend lấy ID, username và quyền từ principal và database, không nhận danh tính tự khai báo. Role nhận tin ban đầu là GUEST. AUTH ADMIN chỉ bật telemetry nếu tài khoản thực sự có quyền ADMIN; GUEST vẫn được tính online nhưng không nhận danh sách tài khoản. Origin vẫn là `*` theo yêu cầu ban đầu.

Server gửi:

```json
{"action":"STATS_UPDATE","data":{"connections":2,"accounts":[{"id":1,"username":"admin"},{"id":2,"username":"learner"}],"ram":150.25}}
```

`connections` đếm tài khoản duy nhất theo ID có socket hiện diện. SystemSocketProvider mở một socket dùng chung mỗi tab khi đăng nhập và thử nối lại sau 3 giây nếu rớt mạng; logout/unmount đóng socket. Dashboard dùng lại socket này, ADMIN tự đăng ký telemetry khi kết nối. `accounts` chứa ID và username, sắp xếp theo ID. `ram` là heap JVM đang dùng theo MiB. Không lưu trạng thái online vào database; không polling REST để lấy thống kê. Mất mạng đột ngột có thể cần thời gian để TCP phát hiện kết nối đã chết.

## Tư liệu báo cáo

- **Cấp phát tài nguyên**: lưu tham chiếu WebSocketSession và role trong map tại connect; duy trì trạng thái kết nối trong RAM qua nhiều tin nhắn, không lưu MySQL.
- **Thu hồi tài nguyên**: xóa session, role và danh tính khỏi các map khi close hoặc transport/send error; bỏ tham chiếu để GC có thể thu gom. RAM không nhất thiết giảm ngay vì GC chạy theo lịch JVM.
- WebSocket chạy trên TCP, có HTTP Upgrade ban đầu; đây không phải server TCP socket thuần.
- Frontend tạo URL WebSocket cùng origin, tự chọn ws/wss; Vite proxy chuyển tiếp tới backend 8080. Khi triển khai, reverse proxy cần chuyển tiếp WebSocket `/api/ws-system`. Dashboard giữ số liệu cuối khi mất kết nối; tải lại trang để đăng ký nhận telemetry lại.
- Unit test `SystemSocketHandlerTest` kiểm tra quyền nhận broadcast, JSON telemetry, thu hồi session, từ chối anonymous, chặn học viên tự nhận ADMIN và nhiều tab cùng ID chỉ tính một tài khoản.

## Luồng lộ trình và lý thuyết qua WebSocket

### Chi tiết hoạt động trên dashboard

STATS_UPDATE bổ sung `data.clients`, mỗi dòng tương ứng một tab/socket: sessionId, userId, username, currentActivity, page, topic, lesson, lastInteractionAt (epoch milliseconds theo đồng hồ server), idleSeconds. Tổng tài khoản vẫn khử trùng theo ID.

Context gửi CLIENT_ACTIVITY khi chuyển URL/chọn hành tinh hoặc kết nối lại. Backend đối chiếu bài học và lượt làm theo tài khoản để tìm tên chủ đề, tên bài và loại hoạt động PRACTICING, LESSON_BOSS, CHAPTER_BOSS, VIEWING_RESULT. Khi hoàn tất lượt, AttemptPage gửi cập nhật kết quả ngay. Các thông tin này là giám sát hiện diện, không thay đổi tiến độ học.

CLIENT_INTERACTION báo click/chạm, gõ phím, cuộn trang thực của người dùng, giới hạn tối đa một lần mỗi 3 giây. Server lưu thời điểm nhận; không dùng đồng hồ client. Trang ẩn không phát tương tác. Không gửi nội dung phím gõ hay đáp án trong bản tin này. Nhận telemetry không tính là thao tác. idleSeconds cập nhật mỗi 2,5 giây; từ 60 giây bảng hiện nhãn nhàn rỗi. Đọc bài lâu không click/scroll cũng được tính không thao tác, không có nghĩa người dùng đã rời máy. Hoạt động khác trang học được ghi VIEWING_PAGE kèm URL.

- `websocket/UserSession.java`: giữ userId, username và `volatile currentActivity` trong RAM theo socket. CONNECTED ban đầu; chỉ đổi activity khi yêu cầu học tập thành công; xóa khi ngắt kết nối.
- `SystemSocketHandler.java`: switch-case AUTH, GET_ROADMAP, VIEW_LESSON_THEORY. Hàm sendTo dùng session decorator để push riêng client; không broadcast lý thuyết cho người khác.
- `Topic.java`, `TopicRepository.java`, `SocketLearningService.java`: truy vấn published topics qua JPA; lấy bài published qua LessonRepository trong LearningService. Giữ nguyên kiểm tra tài khoản, quyền học viên và mở khóa bài/chủ đề.
- `app/SystemSocketContext.tsx`: một socket chung cho hiện diện, telemetry và học tập. onmessage ghép requestId với Promise đang chờ, sau đó trả payload cho trang cập nhật useState. Timeout 15 giây, dọn bộ chờ khi disconnect, tự nối lại sau 3 giây; yêu cầu đang lỗi có thể thử lại trên trang.
- `RoadmapPage.tsx`: GET_ROADMAP -> ROADMAP_DATA -> setTopics/setLessons -> render Cấp 01, 02 theo thứ tự hiện có.
- `LearningPages.tsx`, component LessonPage: VIEW_LESSON_THEORY -> LESSON_THEORY_DATA -> setLesson -> render theory. Không có LessonTheoryPage riêng trong dự án này.
- `AuthContext` chỉ giữ đăng nhập, không tạo socket riêng nữa. ServerDashboardPage subscribe telemetry từ Context, cũng không tạo socket riêng.

Ví dụ request và response (requestId tùy chọn khi gửi thủ công; Context luôn gửi để tránh nhầm phản hồi khi chuyển trang nhanh):

```json
{"action":"GET_ROADMAP","requestId":"r1"}
```

```json
{"action":"ROADMAP_DATA","requestId":"r1","payload":[{"topic":{"slug":"basic-tenses","title":"Nền tảng các thì","sortOrder":1},"lessons":[{"id":5,"title":"Hiện tại đơn","ordinalNo":0,"theory":null}]}]}
```

Payload thực tế có đầy đủ trường trạng thái mở khóa, độ khó và metadata đang dùng trên giao diện. Lộ trình không truyền theory; đọc bài mới cấp phát JSON theory.

```json
{"action":"VIEW_LESSON_THEORY","requestId":"r2","payload":{"lessonId":5}}
```

```json
{"action":"LESSON_THEORY_DATA","requestId":"r2","payload":{"id":5,"title":"Hiện tại đơn","summary":"Tóm tắt","theory":"Nội dung lý thuyết..."}}
```

Activity tương ứng là VIEWING_ROADMAP và READING_LESSON_5. Lỗi trả qua socket dạng `{"action":"ERROR","requestId":"r2","payload":{"code":"LESSON_LOCKED","message":"..."}}`, không làm đổi activity. Không cache theory dài hạn trong UserSession; JSON chỉ tồn tại trong quá trình gửi và bộ đệm có giới hạn, giảm RAM giữ lại.

Phạm vi hiện tại: tải lộ trình/lý thuyết, danh sách chọn bài luyện, bắt đầu luyện tập/boss, tải lượt làm, nộp đáp án và xem kết quả dùng WebSocket. Đăng nhập/hồ sơ (gồm refresh XP), lịch sử và các nghiệp vụ lớp học/đấu trường còn dùng REST hiện tại. Không cần migration database mới.

## Luyện tập và boss: socket và cấp phát RAM

Các action trên cùng socket `/api/ws-system`:

| Request action | Payload | Response action |
| --- | --- | --- |
| START_ATTEMPT | kind: PRACTICE / LESSON_BOSS / CHAPTER_BOSS, lessonId | ATTEMPT_DATA |
| GET_ATTEMPT | attemptId | ATTEMPT_DATA |
| SUBMIT_ANSWER | attemptId, ordinalNo, option (A/B/C/D hoặc câu trả lời text) | ANSWER_RESULT |

Request/response có requestId để Context ghép đúng Promise. Không tự gửi lại thao tác START khi mất kết nối để tránh tạo lượt mới ngoài ý muốn. GET_ATTEMPT khôi phục lượt đã lưu khi tải lại trang. Lỗi quyền sở hữu, khóa bài, đáp án không hợp lệ, sai thứ tự, lượt đã kết thúc hoặc quá hạn bài tập được trả bằng ERROR. Các quy tắc chấm điểm, ẩn đáp án boss và chống thưởng XP trùng vẫn do LearningService transaction xử lý. AssignmentAnswerGuard vẫn áp dụng khi nộp đáp án qua socket.

**Cấp phát tài nguyên:** UserSession.activeAttempt giữ snapshot bộ câu hỏi đã lọc thông tin nhạy cảm và trạng thái lượt làm trên RAM, tối đa một lượt mỗi socket. START_ATTEMPT/GET_ATTEMPT cấp phát hoặc thay thế snapshot, SUBMIT_ANSWER cập nhật snapshot sau khi transaction lưu đáp án. Không giữ JPA entity/session hoặc kết nối DB mở suốt thời gian làm bài.

**Thu hồi tài nguyên:** hoàn thành lượt, chuyển khỏi lượt làm hoặc đóng socket sẽ bỏ tham chiếu activeAttempt. Hoàn thành cũng giải phóng snapshot của lượt đó ở các socket khác đang mở. Lượt làm và đáp án trong DB vẫn tồn tại để tiếp tục/tra cứu; RAM là trạng thái kết nối và snapshot, không phải nguồn duy nhất quyết định điểm số. Khi disconnect, tài nguyên RAM được thu hồi, GET_ATTEMPT có thể tải lại từ DB sau reconnect.

Trên Server Dashboard, cột **Tài nguyên lượt làm (RAM)** hiển thị mã lượt và số câu đang được giữ. Mở tài khoản học viên ở trình duyệt khác, bắt đầu luyện tập hoặc boss: sẽ thấy `Lượt #... · ... câu`. Nộp xong hoặc rời trang thì chuyển thành đã thu hồi. Cột này là số câu trong snapshot, không phải phép đo byte chính xác của từng client; RAM JVM vẫn là tổng heap.

Khởi động lại backend/frontend, kiểm tra DevTools > Network > WS > Messages: có START_ATTEMPT, GET_ATTEMPT, SUBMIT_ANSWER; thao tác làm bài không gọi REST `/api/v1/attempts...` nữa. Nút bắt đầu nhiệm vụ lớp học vẫn đi qua API lớp học cũ; sau khi vào AttemptPage, tải/chấm/xem kết quả dùng socket với kiểm tra hạn nộp như trước.
