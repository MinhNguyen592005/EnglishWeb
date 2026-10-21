# Khu vực Teacher và Admin hợp nhất giám sát

## Thông báo báo cáo cho cả hai phía — 21/10/2026

- Sau khi báo cáo được commit, server push `REPORT_SUBMITTED` đến các tab của người gửi (xác nhận tiếp nhận), `REPORT_RECEIVED` đến các tab người bị báo cáo và `REPORT_CREATED` đến Admin. Áp dụng đủ CLASS, ARENA, USER. Báo cáo lỗi/trùng không phát thông báo tiếp nhận thành công.
- Khi Admin xử lý, server lấy người gửi từ bản ghi DB đang khóa, không lấy từ payload client. Sau COMMIT, `REPORT_DECISION` gửi riêng cho cả người gửi (`recipient: REPORTER`) và người bị báo cáo (`recipient: TARGET`), bao gồm WARN, MUTE_24H, LOCK và DISMISS. Thông báo không chứa ghi chú nội bộ hoặc danh tính người báo cáo.
- Với LOCK, server gửi kết quả rồi đóng các socket của người bị khóa và thu hồi tài nguyên; thông báo khóa vẫn được hiển thị khi UI chuyển về đăng nhập. DISMISS thông báo báo cáo đã khép lại và không áp dụng chế tài.
- Frontend phân biệt xác nhận tiếp nhận/thông báo bị báo cáo/kết quả xử lý; loại trùng theo action + nguồn + ID và giữ tối đa 3 thẻ đang hiển thị. Thông báo dành cho kết nối đang online, chưa lưu inbox để gửi lại khi đăng nhập.
- Kiểm chứng: 77 test được phát hiện, 76 đạt, 1 bỏ qua (bài trình duyệt trong full backend suite). MySQL/socket thật xác nhận thông báo cho hai phía qua cả ba nguồn và mọi quyết định; unit test kiểm tra nhiều tab, không gửi cho người ngoài, bảo mật và rollback. Ngoài suite backend, `check-account-realtime.mjs` đã chạy Edge headless với API/socket giả lập, kiểm tra receipt người gửi, kết quả hai phía và nhiều tab. Frontend build thành công. Log: `source/server/target/report-notifications-final.log`.

## Kiểm tra và sửa luồng báo cáo — 21/10/2026

- Kiểm tra đủ ba nguồn: `CLASS` (tin nhắn lớp), `ARENA` (tin nhắn PvP), `USER` (tài khoản trong lớp/trận). Nguồn báo cáo bắt buộc khi xử lý, tránh nhầm ID giữa các bảng. Báo cáo trùng bị từ chối; người không có quyền ADMIN không thể ra quyết định.
- `REPORT_DECISION` phát riêng tới các tab của cả người báo cáo lẫn người bị báo cáo sau khi transaction commit. Nội dung chỉ nêu quyết định chung; không gửi ghi chú nội bộ hoặc danh tính người báo cáo. Thông báo chỉ dành cho người đang online, chưa có hộp thư offline. Với `DISMISS`, thông báo nêu không áp dụng chế tài.
- V17 mở rộng cột quyết định lên 600 ký tự ở cả ba bảng, giữ được ghi chú 500 ký tự cộng tiền tố quyết định. Trang Admin kiểm tra chiều dài ghi chú và hiển thị ID người bị báo cáo/người gửi để phân biệt tên trùng.
- Danh sách vẫn giới hạn 200 bản ghi nhưng ưu tiên OPEN trước các báo cáo đã xử lý; UI nêu rõ giới hạn. Chưa có phân trang để xem toàn bộ lịch sử lớn hơn 200 bản ghi.
- Kiểm thử thật xác nhận hai Admin xử lý cùng báo cáo chỉ một quyết định thành công; cấm chat có hiệu lực ở cả lớp và PvP; khóa tài khoản đóng các tab liên quan. Kiểm tra ghi chú 500 ký tự ở cả ba nguồn, thông báo đúng đối tượng, bảo mật ghi chú, báo cáo trùng và ưu tiên báo cáo cũ còn OPEN trước hơn 200 bản ghi RESOLVED mới.
- Kết quả cuối: 76 test được phát hiện, 75 đạt, 1 bỏ qua (trình duyệt). Có MySQL/Tomcat/WebSocket thật; frontend build thành công. Chưa chạy kiểm thử giao diện trình duyệt cho thay đổi này. Log: `source/server/target/reports-review-final.log`. Khởi động lại backend để Flyway áp dụng V17.

## Giới hạn tải và tối ưu lộ trình — 21/10/2026

### Lộ trình

- `LearningService.roadmap` dựng một snapshot theo yêu cầu bằng 5 lượt đọc: tài khoản, metadata chủ đề, projection bài học, ID bài đã thắng Boss và khóa thưởng XP. Không truy vấn DB trong vòng lặp từng bài. Socket dùng trực tiếp snapshot này thay vì gọi hai lần danh sách chủ đề/bài học và đọc lại topic.
- `LessonOutline` chỉ lấy ID, chủ đề, thứ tự, tên, tóm tắt và độ khó; không tải TEXT lý thuyết cho trang danh sách. Dữ liệu tiến độ không cache xuyên yêu cầu, lần đọc sau nhận tiến độ mới. Luật mở khóa chủ đề trước/Boss bài trước và khóa thưởng cũ `CHAPTER_BOSS:chapter` được giữ.
- Migration V16 thêm index cho truy vấn tiến độ `(user_id,status,kind,lesson_id)` và danh sách bài `(published,ordinal_no)`. Test 1.000 bài xác nhận số lời gọi đọc không tăng theo số bài; không phải phép đo thời gian SQL thực tế.

### Điều tiết tải

| Cấu hình môi trường | Mặc định | Ý nghĩa |
| --- | ---: | --- |
| `MAX_SOCKETS` | 200 | Tổng kết nối raw WebSocket + STOMP được nhận |
| `MAX_SOCKETS_PER_ACCOUNT` | 5 | Tổng socket mỗi tài khoản, không phân biệt chữ hoa/thường |
| `MAX_CONCURRENT_REQUESTS` | 32 | Yêu cầu nghiệp vụ đồng thời qua REST, raw WebSocket và STOMP |
| `HTTP_MAX_THREADS` | 64 | Luồng xử lý Tomcat tối đa |
| `HTTP_MAX_CONNECTIONS` | 512 | Giới hạn kết nối Tomcat, gồm HTTP/WebSocket |
| `HTTP_ACCEPT_COUNT` | 64 | Hàng đợi accept Tomcat |
| `DB_POOL_SIZE` | 16 | Connection pool Hikari tối đa; chờ lấy connection tối đa 3 giây |

- `ServerCapacity` dùng Semaphore không chờ: hết suất thì REST trả HTTP 503/`SERVER_BUSY`/`Retry-After: 3`; raw WebSocket trả `ERROR` có requestId và `retryAfterSeconds`, STOMP trả ack lỗi. Không chạy nghiệp vụ bị từ chối. `finally` luôn trả suất sau khi xong/lỗi.
- Hết giới hạn socket: đóng riêng kết nối mới với mã 1013, không cấp session học tập. Socket cũ tiếp tục hoạt động. Hạn mức được trả khi đóng, hết phiên hoặc lỗi thiết lập. Frontend chờ ngẫu nhiên 5–10 giây trước khi thử kết nối lại; không tự phát lại thao tác ghi bị từ chối. Client giới hạn 100 yêu cầu đang chờ để không tích lũy vô hạn khi offline.
- Dashboard hiển thị mức kết nối/yêu cầu hiện tại, giới hạn và số lần từ chối từ lúc khởi động. Job định kỳ dùng pool 8 luồng riêng, không tính vào 32 suất nghiệp vụ. Các giới hạn này giảm nguy cơ quá tải, không bảo đảm không hết RAM; cần điều chỉnh theo máy và tải đo được. Chưa bổ sung giới hạn tốc độ chung cho mọi action; limiter đáp án hiện có vẫn hoạt động độc lập.
- Thay biến môi trường rồi khởi động lại server. Flyway tự chạy V16; không cần sửa migration cũ. Bài integration 30 socket cùng tài khoản cấu hình riêng ngưỡng 40 để kiểm thử; ứng dụng mặc định vẫn là 5.
- Kiểm chứng cuối: 74 test được phát hiện, 73 đạt, 1 bỏ qua (trình duyệt); đã bật các nhóm MySQL/classroom/live-exam/full-realtime. Test mới kiểm tra giới hạn đồng thời khi đăng ký, REST 503, raw socket SERVER_BUSY và trả permit sau lỗi, phục hồi sau khi giải phóng suất, hạn mức chung raw/STOMP và mở lại sau disconnect, dữ liệu lộ trình REST/socket nhất quán, 1.000 bài với số lượt gọi đọc cố định và điều kiện mở khóa/khóa thưởng cũ. Frontend build thành công; chưa chạy UI trình duyệt cho thay đổi này. Log: `source/server/capacity-roadmap-final.log`.


## Dọn đầu ra sinh tự động

- Đã dọn `source/client/dist`, `source/client/tsconfig.app.tsbuildinfo` và `source/server/target`. Các log kiểm thử được nhắc trong lịch sử tài liệu là đầu ra sinh tự động và cũng được dọn theo `target`; chạy lại các lệnh kiểm thử tương ứng để tạo log/kết quả mới.
- Giữ mã nguồn, migration, dữ liệu MySQL, dependency, cấu hình cục bộ, tài liệu và ảnh kiểm thử hiện có. Script ảnh cũ đã đổi nơi xuất từ `statics/results` sang `source/client/artifacts/legacy`.
- Có thể dọn lại bằng `powershell -NoProfile -File scripts/clean.ps1`; hỗ trợ `-WhatIf` và tùy chọn `-IncludeTestArtifacts`. Chi tiết script trình duyệt nằm tại `source/client/scripts/README.md`. Trước khi dọn, frontend đã build thành công và toàn bộ script `.mjs` đã qua kiểm tra cú pháp Node; không chạy lại kiểm thử backend trong đợt chỉ dọn đầu ra này.

## Tối ưu vòng cập nhật realtime

- Các vòng push lớp học, kiểm tra và workspace gom việc đọc DB/mã hóa JSON theo tài khoản và tài nguyên trong **một chu kỳ**. Hai tab cùng tài khoản xem cùng dữ liệu chỉ tạo một snapshot mỗi chu kỳ. Khác tài khoản hoặc khác tài nguyên vẫn tách riêng; cache không sống qua chu kỳ, quyền được kiểm tra lại khi đọc snapshot mới. Không cache lỗi truy cập.
- Đồng bộ hồ sơ lập chỉ mục socket theo user ID trước khi xử lý danh sách tài khoản, thay vòng lặp mọi user × mọi socket. Query tài khoản vẫn theo lô và profile chỉ dựng một lần mỗi tài khoản.
- Dashboard dùng `SYSTEM_MONITOR_WATCH` / `SYSTEM_MONITOR_UNWATCH`. Không có đăng ký telemetry thì bỏ qua việc dựng metrics. Rời Dashboard sẽ ngừng nhận telemetry; mở lại/reconnect nhận lại cửa sổ log. Client gửi AUTH GUEST ban đầu và đăng ký theo màn hình, quyền ADMIN được kiểm tra tại server.
- Log telemetry gửi tăng dần theo ID (`eventsDelta: true`); React ghép, loại trùng và giữ tối đa 200 dòng. Server giữ cursor nhỏ theo socket và thu hồi khi hủy theo dõi/ngắt kết nối. Phần metrics, client, cảnh báo và queue vẫn gửi snapshot mỗi 2,5 giây.
- Admin chỉ đăng ký workspace báo cáo/tổng quan khi mở tab tương ứng, thay vì mọi tab quản trị. Cơ chế chấm điểm, phiên đăng nhập, hạn nộp, khóa tài khoản và thu hồi gói đề giữ nguyên.
- Phạm vi hiện tại: giảm truy vấn lặp giữa các tab cùng người dùng; chưa gom dữ liệu theo cả lớp/phòng giữa các tài khoản khác nhau. Chưa có số đo tải kiểm tra/PvP để khẳng định sức chứa production.
- Kiểm chứng sau tối ưu: `npm run build` thành công; Maven với `RUN_FULL_REALTIME_TEST=true` có 66 test được phát hiện, 63 chạy đạt, 3 bỏ qua (hai nhóm DB opt-in riêng và bài test trình duyệt). Có MySQL/Tomcat/WebSocket thật; tải thử 30 socket/150 yêu cầu hồ sơ p95 5 ms trên máy cục bộ, không phải phép đo mức cải thiện hay tải kiểm tra/PvP. Test mới xác nhận gom snapshot đúng tài khoản/từng chu kỳ, log delta, dừng telemetry và lấy lại lịch sử sau đăng ký lại. Log: `source/server/target/optimization-final.log`.

## Dọn mã sau chuyển đổi WebSocket

- Đã xóa 38 wrapper REST không có nơi gọi trong frontend, hook STOMP `services/live.ts` không còn được import và trang placeholder không có route. Frontend tiếp tục dùng `SystemSocketContext` cho các luồng realtime.
- Endpoint REST/STOMP backend vẫn giữ để tương thích và phục vụ kiểm thử. Script kiểm thử, migration, dữ liệu và tài liệu báo cáo được giữ lại. Thư mục ảnh/fixture sinh bởi kiểm thử `source/client/artifacts/` đã được thêm vào `.gitignore`.
- README đã bỏ các thư mục không tồn tại và mô tả lại giao tiếp hiện tại. Frontend đã build thành công sau khi dọn mã.

## Điều khiển client và cảnh báo trên Dashboard

- Bấm username hoặc chọn socket để xem tài khoản, vị trí, thời điểm kết nối, thao tác cuối, bộ đếm JSON ứng dụng nhận/gửi, từng gói đề và thời điểm/thời gian cấp phát. Counter không gồm Ping/Pong hoặc broadcast telemetry. Thời điểm cấp gói giữ nguyên khi cập nhật cùng gói, đặt lại khi đổi gói.
- Hàng đợi PvP nhận cùng `STATS_UPDATE` mỗi 2,5 giây: username, socket, level, thời gian chờ, khoảng level cho phép. Chỉ hiển thị mục WAITING; mục đã ghép hoặc lỗi không tính là đang chờ. Quyết định ghép vẫn xét điều kiện cả hai người chơi.
- `SYSTEM_REMIND` gửi `SYSTEM_NOTICE` riêng tới socket được chọn; lời nhắc dài 1–300 ký tự. `SYSTEM_DISCONNECT` đóng socket với mã 4006, gọi cơ chế thu hồi gói/lớp/kiểm tra/PvP/hàng đợi hiện có. Client không tự reconnect sau mã này; có thể tải lại để nối lại. Không khóa tài khoản, không đóng những tab còn lại. Server kiểm tra ADMIN từ DB, không cho tự ngắt socket đang gửi lệnh. Có xác nhận trước khi ngắt và nhật ký người thực hiện.
- Cảnh báo hiện tại: heap đã dùng ≥85% `maxMemory`, thiếu Pong >30 giây, AFK ≥120 giây, bất kỳ gói đề nào đang giữ >15 phút. Giữ gói lâu chỉ là tín hiệu xem xét. Cảnh báo tự mất khi điều kiện được khắc phục. Kèm các sự kiện WARNING/CRITICAL 60 giây gần nhất; không tạo thêm log lặp mỗi lần lấy số liệu. Ngưỡng tự kick/mất Pong và chống spam hiện có không đổi.
- Kiểm chứng: build frontend thành công; 28 test liên quan đạt, không bỏ qua, gồm `FullRealtimeIntegrationTest#adminReminderAndDisconnectReachOnlySelectedRealSocket` với MySQL/Tomcat/socket thật. Test xác nhận lời nhắc đúng tab, mã đóng 4006, thu hồi hàng đợi/trạng thái socket, giữ tab còn lại và không khóa tài khoản. Unit test kiểm tra quyền Admin, ngăn tự ngắt, trạng thái cảnh báo và danh sách hàng đợi. Log: `source/server/target/system-controls-live.log`. Chưa kiểm tra giao diện các phần mới bằng trình duyệt trong lần cập nhật này.

## Hoàn thiện vòng đời kết nối và kiểm chứng thực tế (19/10/2026)

- Java 21 đã cấu hình trực tiếp trong pom.xml. Chạy `mvnw.cmd spring-boot:run` với JAVA_HOME là JDK 21, không cần cờ ghi đè phiên bản.
- `SocketSessionRegistry` gắn raw WS và STOMP vào HTTP session đã xác thực. Khi logout, hết phiên hoặc đổi session ID, socket thuộc phiên bị đóng và trạng thái RAM được thu hồi. Phiên đăng nhập độc lập khác của cùng tài khoản vẫn giữ nguyên. Kiểm tra lại binding trước mỗi message ngăn dùng socket với session đã mất hiệu lực. Tomcat có thể đóng mã 1008, registry dùng 4004; frontend nhận cả hai, trở về đăng nhập và ngừng retry.
- AttemptPage/ResultRoute, Roadmap, dashboard/chọn bài và trang lý thuyết tải lại dữ liệu khi `connected` chuyển lại true. Nút nộp/bắt đầu bị vô hiệu khi offline. Request ghi đã gửi không được tự phát lại; lần đọc sau reconnect lấy trạng thái DB để tránh nộp trùng.
- `RealtimeSchedulerConfig` có pool 8 luồng; các tác vụ account, lớp, kiểm tra, đồng hồ PvP, ghép trận và giám sát có thể chạy độc lập, tránh một tác vụ đọc DB chặn toàn bộ vòng scheduled. Các map/snapshot có kiểm soát đồng thời theo session/phòng. Đây vẫn là mô hình một instance; chưa có cơ chế chia sẻ RAM giữa nhiều node.
- `ArenaSnapshotStore` giữ gói 10 câu PvP bất biến trên RAM theo phòng; các client giữ tham chiếu dùng chung. Nội dung câu hiện tại lấy từ gói này khi trả payload, không chứa đáp án đúng. Trạng thái vòng và chấm điểm vẫn lấy DB làm nguồn sự thật. Kết thúc phòng, rời trận, logout hoặc mất kết nối sẽ bỏ tham chiếu; client cuối rời thì xóa gói khỏi RAM. Dashboard cộng một gói cho mỗi phòng, không nhân đôi theo số người chơi.

Kiểm tra đầy đủ đã chạy: 56 tests, không bỏ qua test; gồm Spring Boot/Tomcat/Spring Security + Flyway/MySQL thật, HTTP, raw WebSocket, STOMP và Edge truy cập frontend thật. Các schema test có hậu tố `_test` được tạo/dọn riêng, không dùng DB grammar_quest.

- Logout đóng raw WS/STOMP của cùng HTTP session, giữ phiên đăng nhập khác.
- Gửi đáp án xen kẽ REST/raw/STOMP dùng cùng hạn mức; người cùng IP không bị ảnh hưởng; tài khoản không bị khóa DB vì cooldown.
- Phiên hết hạn bị chặn; gói PvP được cấp đúng 10 câu, hai client dùng chung và thu hồi khi client cuối ngắt.
- Kiểm thử tải cục bộ: 30 socket, 150 yêu cầu ACCOUNT_GET đồng thời, p95 ghi nhận 22 ms. Đây là phép đo request hồ sơ trên máy hiện tại, không phải cam kết công suất cho mọi luồng học/thi.
- Trình duyệt thật: đăng nhập, cố ý ngắt socket trước phản hồi lộ trình và đề làm bài, tự phục hồi không F5, gửi đáp án đến server thật, logout một tab đưa tab còn lại về đăng nhập. Script không mock HTTP/socket.

Chạy lại toàn bộ: trong PowerShell tại source/server, đặt JAVA_HOME, đặt các biến `RUN_FULL_REALTIME_TEST`, `RUN_BROWSER_REALTIME_TEST`, `RUN_CLASSROOM_DB_TEST`, `RUN_LIVE_EXAM_DB_TEST` bằng `true`, rồi chạy `./mvnw.cmd test`. Đồng thời, trong terminal khác tại source/client chạy `node scripts/check-real-backend.mjs`; script chờ fixture kiểm thử rồi tự mở Vite cổng 5177 và Edge headless. Nếu chỉ cần backend, không đặt RUN_BROWSER_REALTIME_TEST. Các bài test DB/socket đầy đủ chỉ bật khi biến môi trường tương ứng được đặt; Maven test mặc định bỏ qua các bài opt-in này. Log tại source/server/target/realtime-final.log; ảnh thật tại source/client/artifacts/role-views/real-session-logout.png.

## Giao diện và điều hướng hiện tại

- Learner, Teacher và Admin dùng chung Layout: sidebar icon, nền sáng, thẻ bo góc, màu tím/xanh và hệ thống nút chung.
- Giáo viên: Tổng quan, Lớp học, Lộ trình, Soạn câu hỏi, Hồ sơ. Trong lớp có tab lớp học/thành viên/nhiệm vụ/bảng điểm/chat; trong lộ trình có chủ đề/bài học/câu hỏi chung. Chức năng và quyền giảng dạy được giữ nguyên.
- Admin: `/admin` gộp quản trị nghiệp vụ và giám sát máy chủ. Sidebar có Tổng quan & Máy chủ, Tài khoản, Kiểm duyệt nội dung, Báo cáo vi phạm, Nhật ký quản trị.
- `/system` và `/admin/server-dashboard` chỉ là URL cũ, tự chuyển sang `/admin`; không còn dashboard riêng hoặc role SYSADMIN.

## Tổng quan admin

1. Ba thẻ realtime trên cùng: Active Sockets, JVM Heap Memory (used / committed, MiB), Active Snapshots. Nhận telemetry mỗi 2,5 giây.
2. Bảng Quản lý Client có bốn cột: ID/username (kèm mã tab), hoạt động/chủ đề/bài, tài nguyên RAM, trạng thái Ping/AFK.
3. Nhật ký Mạng dạng terminal cuộn, tự xuống cuối khi có sự kiện mới; có nút tạm dừng cuộn. SYS cho cấp phát/thu hồi, INFO cho kết nối, WARNING cho timeout, CRITICAL cho spam.
4. Thống kê nghiệp vụ và biểu đồ 14 ngày giữ bên dưới; các trang quản lý tài khoản, kiểm duyệt, báo cáo, audit giữ nguyên.

Active Sockets chỉ đếm `/api/ws-system`, không phải toàn bộ TCP trên OS hoặc STOMP `/ws`. Active Snapshots đếm snapshot luyện tập/Boss/kiểm tra của từng tab cộng số gói PvP đang nằm trong ArenaSnapshotStore. Một phòng PvP có hai client vẫn chỉ tính một gói dùng chung. Mỗi dòng client tương ứng một tab, hiển thị ID phòng và số câu được cấp. Đọc lý thuyết không giữ snapshot dài hạn nên hiện `[Không có]`.

## Heartbeat, AFK và tài nguyên

- Ping mỗi 10 giây; trình duyệt tự Pong. Không Pong hơn 90 giây: ngắt socket và thu hồi RAM.
- AFK tính theo thao tác thật (click/gõ/cuộn/chuyển trang), không theo heartbeat. Từ 60 giây hiện vàng; 15 phút thì kick, dọn snapshot, không tự reconnect sau kick.
- Sau 2 phút không thao tác, server gửi riêng socket action `IDLE_REMINDER` với lời nhắn “Nghỉ một chút rồi, mình tiếp tục chinh phục bài học nhé!”. Client hiện thẻ nhắc ở góc dưới, không chặn việc đọc/làm bài. Bộ quét chạy mỗi 10 giây nên thông báo đến khoảng 120–130 giây. Mỗi đợt nhàn rỗi chỉ nhắc một lần; thao tác thật reset cờ nhắc. Ping/Pong, nhận thống kê và lời nhắc không reset AFK. Thao tác lại hoặc bấm đóng sẽ ẩn lời nhắc; không thay đổi mốc kick 15 phút.
- Bắt đầu/tải lượt: giữ tối đa một bộ đề mỗi socket. Nộp đáp án: cập nhật snapshot sau khi lưu DB. Hoàn thành, rời lượt làm hoặc disconnect: bỏ tham chiếu và ghi log số câu thu hồi. JVM GC quyết định lúc thu gom vật lý.
- Mỗi bộ đề vẫn có bản lưu attempts/attempt_items ở MySQL để tải lại; không giữ kết nối database mở trong suốt thời gian làm bài.
- Console giữ 200 sự kiện gần nhất trên RAM, mất khi restart. Nhật ký nghiệp vụ audit_logs lưu lâu dài trong DB.

## Chống spam dùng chung, không chặn IP

Lời nhắc học tập sau 2 phút chỉ áp dụng tài khoản không phải ADMIN. Backend kiểm tra vai trò hiện tại trong database trước khi gửi; frontend cũng không hiển thị lời nhắc cho ADMIN. Quy tắc heartbeat và kick AFK 15 phút giữ nguyên.

- `AnswerRateLimiter` quản lý cửa sổ trượt chung theo username (không phân biệt hoa/thường), gộp các tab và cả REST/raw WebSocket/STOMP. REST kiểm tra trước Bean Validation bằng AnswerRateFilter; raw kiểm tra trước định tuyến đáp án; STOMP kiểm tra SEND ANSWER trước controller.
- Tối đa 10 đáp án/giây. Yêu cầu thứ 11 tạm dừng tài khoản 10 giây, đóng các socket của chính tài khoản bằng mã 4005. REST trả HTTP 429, `Retry-After: 10`, mã `ANSWER_RATE_LIMIT`. Frontend chờ 10 giây rồi reconnect, tải lại trạng thái từ server; không tự phát lại đáp án.
- Không còn khóa tài khoản vĩnh viễn hoặc chặn IP vì vượt ngưỡng. Người khác cùng Wi-Fi/NAT/localhost vẫn dùng bình thường. Admin khóa tài khoản thủ công vẫn có hiệu lực như trước. Map cửa sổ trên RAM được dọn sau thời gian không sử dụng.

## Quản trị nội dung và dữ liệu

- Migration V13 thêm deleted cho lessons/questions. Xóa mềm bài sẽ ẩn/xóa mềm câu hỏi liên quan, giữ ID/FK và lịch sử làm bài. Nội dung đã xóa không xuất bản lại qua publication endpoint, không có UI khôi phục.
- Admin xem câu hỏi chung/riêng; ẩn/mở câu hỏi riêng chỉ đổi teacher_active, không biến thành public.
- Giáo viên tiếp tục soạn nội dung tại khu vực riêng; audit lưu thao tác curriculum và câu hỏi riêng.
- Biểu đồ nghiệp vụ dùng dữ liệu thực từ DB: đăng ký mới, lớp mới, phòng FINISHED nhóm theo ngày tạo phòng.

## Chạy và kiểm tra

## Hàng đợi PvP theo cấp

### PvP đã chuyển hoàn toàn sang WebSocket ở frontend

ArenaPage không còn import api.ts hoặc useLiveEvents/STOMP; không fetch REST cho trận/chat/lịch sử và không có REST fallback. Tất cả dùng kết nối `/api/ws-system` của SystemSocketContext.

Request → response ARENA_DATA: ARENA_OPEN (phòng hiện tại hoặc roomId để tiếp tục xem), ARENA_CREATE, ARENA_JOIN, ARENA_READY, ARENA_START, ARENA_ANSWER, ARENA_LEAVE, ARENA_MESSAGES, ARENA_CHAT, ARENA_REPORT, ARENA_HISTORY, ARENA_UNWATCH. Lỗi trả ERROR theo requestId. Nội dung chat/reason/ID/vòng được kiểm tra ở server, quyền sở hữu và luật trận vẫn dùng controller/service hiện tại.

Server giữ arenaWatches (socket → username, roomId, version) trên RAM; dọn khi rời trang/leave/disconnect/kết thúc trận. Mỗi giây server cập nhật presence cho các socket đang xem trận và còn Pong gần đây; khi stateVersion đổi sẽ push ARENA_ROOM_UPDATE riêng theo người nhận và ARENA_MESSAGES_UPDATE. Không gửi cùng một snapshot của host cho guest: myAnswer/isHost và các trường riêng vẫn được cá nhân hóa, đáp án đúng giữ theo luật cũ.

Đồng hồ server tự advance các trận IN_PROGRESS mỗi giây: hết giờ chuyển vòng, xử lý hết thời gian chờ reconnect, kết thúc trận dù không có request từ browser. Đồng hồ hiển thị browser chỉ tính lại deadline cục bộ mỗi giây, không gọi mạng. Reconnect đăng ký lại room và tải trạng thái/chat/lịch sử qua socket. Request cũ không tự gửi lại khi kết nối rớt để tránh tạo/nộp trùng.

Rate limit dùng chung cho SUBMIT_ANSWER, ARENA_ANSWER, EXAM_ANSWER và các endpoint trả lời REST/STOMP cũ. Các endpoint cũ giữ tương thích; frontend PvP hiện không dùng chúng.

Kiểm tra UI: chạy Vite 5175 rồi `node scripts/check-arena-socket.mjs`; dùng socket giả lập để tạo/sẵn sàng/bắt đầu/nộp, nhận vòng và chat chủ động, khẳng định không có request REST PvP. Kiểm tra này không thay thế thử trận hai người với MySQL thật.

- Nút Tìm trận PvP dùng QUEUE_JOIN / QUEUE_CANCEL / QUEUE_STATUS trên `/api/ws-system`. Server push MATCHMAKING_UPDATE mỗi 2,5 giây. Phòng riêng bằng mã vẫn là lựa chọn phụ và không dùng bộ lọc hàng đợi.
- Cấp được tính từ XP trong DB: totalXp / 1000 + 1, không phải số bài đã mở. Ban đầu chỉ cùng cấp; mỗi người chờ ≥15 giây cho phép chênh 1, ≥30 giây cho phép chênh 2. Cặp phải nằm trong phạm vi của cả hai; không ghép quá 2 cấp. Ưu tiên người chờ trước, chọn đối thủ có độ chênh nhỏ nhất rồi đến thời gian chờ.
- Hàng đợi nằm trên RAM, một mục mỗi tài khoản, gắn với một socket. Rời đấu trường, hủy tìm hoặc ngắt socket thì xóa mục chờ; restart server làm mất hàng đợi. Client không tự đăng ký lại sau disconnect.
- Ghép thành công: một transaction tạo/join phòng, đặt cả hai sẵn sàng và bắt đầu 10 câu/20 giây như cũ. Khi lỗi, transaction rollback và hai người nhận trạng thái ERROR để thử lại. Trận và câu hỏi vẫn được lưu DB.
- Dashboard hiển thị Đang chờ ghép trận PvP, ghi log vào hàng đợi và ghép thành công. Chưa đưa bộ đếm hàng đợi vào Active Snapshots vì mục chờ chỉ là metadata.

Khởi động lại backend/frontend theo SERVER_DASHBOARD.md, tải lại các tab rồi đăng nhập ADMIN vào `/admin`.

## Tài khoản realtime và báo cáo người học

- Backend `pushAccountUpdates` mỗi giây đọc trạng thái các tài khoản đang có socket từ DB (gộp ID để đọc một lần), push `ACCOUNT_UPDATE` riêng từng tab khi hồ sơ thay đổi: username, displayName, role, totalXp, level và xpInLevel. Snapshot nhỏ nằm trong map `profiles`, thu hồi khi socket đóng. Server không tin XP/quyền do client gửi.
- AuthContext nhận hồ sơ từ socket; `reload()` sau khi làm bài dùng `ACCOUNT_GET → ACCOUNT_DATA`, không gọi lại REST `/auth/me`. Đăng nhập/đăng ký/đăng xuất và xác minh phiên lần đầu vẫn dùng HTTP. Các tab đang mở cùng tài khoản cùng nhận XP/cấp mới. Lộ trình, dashboard và chọn bài tự tải lại trạng thái mở khóa qua socket khi tổng XP thay đổi; tải nền không reset AFK.
- Khi đổi quyền, server kiểm tra lại quyền từ DB ngay ở request tiếp theo và trong vòng quét khoảng 1 giây, dọn các đăng ký lớp/kiểm tra/PvP/hàng đợi và snapshot làm bài cũ. Client cập nhật menu, chuyển sang trang của vai trò mới, vẫn dùng socket đang có. Token role cũ trên client không thể cấp quyền vì service/controller kiểm tra DB.
- Khi tài khoản bị admin khóa trực tiếp hoặc khóa qua xử lý báo cáo, server gửi `ACCOUNT_LOCKED` cho các socket online rồi đóng mã 4003 và thu hồi tài nguyên. Frontend hiện lý do, xóa trạng thái đăng nhập và ngừng reconnect. Mở khóa cho phép đăng nhập lại, không tự đăng nhập người đã bị ngắt. Vượt ngưỡng đáp án dùng cooldown 4005, không khóa DB.
- **Báo cáo học sinh trực tiếp:** nút **Báo cáo học sinh** trong danh sách thành viên lớp; nút **Báo cáo đối thủ** trong phòng PvP. Action `REPORT_USER` với `{targetId, contextType:'CLASS'|'ARENA', contextId, reason}`; response `REPORT_DATA` hoặc `ERROR`. Chỉ được báo cáo học sinh cùng lớp/cùng trận, không tự báo cáo, tối đa 10 báo cáo trực tiếp mỗi giờ và không tạo trùng báo cáo OPEN trong cùng ngữ cảnh. Giáo viên chủ lớp được báo cáo học sinh của lớp.
- Flyway `V15__learner_reports.sql` lưu báo cáo trực tiếp trong `learner_reports`. Admin xem và xử lý cùng báo cáo tin nhắn, nguồn `USER`: bỏ qua, cảnh báo, cấm chat 24h hoặc khóa tài khoản. Báo cáo đang chờ được cộng vào số liệu tổng quan.
- Cả báo cáo học sinh trực tiếp, tin nhắn lớp và tin nhắn PvP đều phát sự kiện **sau khi transaction commit**. Server gửi `REPORT_RECEIVED` đến tất cả tab online của người bị báo cáo, và `REPORT_CREATED` đến admin online để tự tải lại danh sách. Nội dung thông báo: **“Tài khoản của bạn vừa nhận một báo cáo. Quản trị viên sẽ xem xét; bạn chưa bị xác định vi phạm. Hãy giữ tương tác lịch sự và tôn trọng mọi người.”** Không gửi danh tính người báo cáo cho người bị báo cáo; nhận báo cáo không tự động khóa/phạt. Báo cáo trùng/thất bại/rollback không tạo thông báo thành công.
- Thông báo bị báo cáo hiện trên mọi trang, tối đa 3 thẻ cùng lúc, có nút **Đã hiểu**; chống hiển thị trùng theo nguồn + ID. Đây là thông báo đến socket đang online; hiện chưa có hộp thư/thông báo bù cho tài khoản offline. Bản ghi báo cáo vẫn tồn tại trong DB để admin xử lý.

Kiểm tra: `SystemSocketHandlerTest` kiểm tra XP nhiều tab, đổi quyền, khóa các tab, đẩy báo cáo riêng đúng người và admin; `RealtimeNotifierTest` kiểm tra commit/rollback. `ClassroomSocketIntegrationTest` kiểm tra migration V15, tạo/chống trùng/chặn người ngoài lớp/tự báo cáo, sự kiện và admin xử lý nguồn USER trên MySQL riêng. UI `node scripts/check-account-realtime.mjs` (Vite 5175): XP hai tab không phát REST hồ sơ, báo cáo đến hai tab và admin, đổi quyền không tạo socket mới, khóa đưa cả hai tab về đăng nhập. UI dùng socket giả lập; MySQL kiểm tra riêng.

## Các chức năng lớp học đã chuyển sang WebSocket

Trang `/classes` và `/classes/:id` dùng chung kết nối `/api/ws-system` của `SystemSocketContext`. Không gọi REST lớp học, không polling tin nhắn 5 giây và không mở thêm kết nối STOMP `/ws`. REST/STOMP backend cũ vẫn giữ để tương thích; các trang hiện tại không dùng chúng.

| Chức năng | Action socket |
| --- | --- |
| Danh sách lớp và đăng ký nhận cập nhật | `CLASS_LIST` |
| Tạo lớp / tham gia bằng mã | `CLASS_CREATE` / `CLASS_JOIN` |
| Chi tiết lớp, thành viên, nhiệm vụ, chat | `CLASS_OPEN` |
| Đổi tên / xóa học sinh khỏi lớp | `CLASS_RENAME` / `CLASS_REMOVE_MEMBER` |
| Danh sách bài học để giao nhiệm vụ | `CLASS_LESSONS` |
| Giao / sửa / đóng-mở nhiệm vụ | `CLASS_ASSIGN` / `CLASS_UPDATE_ASSIGNMENT` |
| Học sinh bắt đầu nhiệm vụ | `CLASS_START_ASSIGNMENT` |
| Xem / dừng theo dõi bảng điểm nhiệm vụ | `CLASS_RESULTS` / `CLASS_CLOSE_RESULTS` |
| Gửi tin nhắn / báo cáo tin nhắn | `CLASS_CHAT` / `CLASS_REPORT` |
| Rời màn hình lớp | `CLASS_UNWATCH` |

- `CLASS_LIST`, `CLASS_OPEN`, `CLASS_RESULTS`, `CLASS_CLOSE_RESULTS` trả `CLASS_SNAPSHOT` theo requestId. Các thao tác khác trả `CLASS_DATA`; lỗi yêu cầu trả `ERROR` theo requestId.
- Backend `SocketClassroomService` dùng lại `ClassroomController` có transaction/quyền hiện tại; xác thực lấy từ phiên đăng nhập. Adapter chủ động kiểm tra kiểu dữ liệu, giới hạn độ dài, ID, thời gian và Bean Validation (không phụ thuộc `@Valid` của REST).
- Server chạy mỗi giây, đọc snapshot nhất quán từ DB và chỉ push `CLASS_UPDATE` khi danh sách lớp, thành viên, nhiệm vụ, tin nhắn hoặc bảng điểm được theo dõi thay đổi. Client không cần gửi yêu cầu định kỳ. Như vậy nhận cả thay đổi thực hiện từ API cũ trong thời gian chuyển đổi.
- Khi giáo viên bấm **Kết quả**, server giữ assignmentId đang theo dõi và gửi điểm mới khi học sinh trả lời. Hiển thị vẫn là **kết quả tốt nhất mỗi học sinh**, giữ nghiệp vụ cũ, không phải bảng xếp hạng của kiểm tra trực tiếp mới. Đóng bảng điểm ngừng truy vấn điểm; CSV xuất từ dữ liệu hiện tại trên client.
- Bắt đầu nhiệm vụ qua socket vẫn cấp `AttemptView` vào RAM; tải đề/nộp đáp án tiếp tục dùng `GET_ATTEMPT`/`SUBMIT_ANSWER`. Nhiệm vụ chỉ cho LEARNER bắt đầu. Server chặn cả lượt đang làm khi giáo viên đóng bài, hết hạn chung/hết 15 phút hoặc học sinh bị xóa khỏi lớp.
- Mỗi lần push kiểm tra lại quyền. Nếu không còn quyền, server gửi `CLASS_ERROR`, bỏ đăng ký; frontend xóa dữ liệu lớp/chat/điểm khỏi màn hình và hiển thị đường quay lại danh sách lớp. Người học không thể đăng ký bảng điểm của giáo viên.
- **Cấp phát tài nguyên:** `SystemSocketHandler.classWatches` là `ConcurrentHashMap`; mỗi socket giữ tối đa một đăng ký danh sách/chi tiết lớp, assignmentId tùy chọn và snapshot JSON cuối. Khóa riêng từng đăng ký giữ đúng thứ tự phản hồi/push; không khóa toàn bộ client. Snapshot lớp là metadata theo dõi, không được cộng vào Active Snapshots của gói đề. Bộ đệm gửi mỗi socket có giới hạn 512 KiB, thời gian gửi 5 giây, hỗ trợ snapshot 100 tin nhắn Unicode gần nhất.
- **Thu hồi tài nguyên:** rời trang, đổi lớp/đăng ký, `CLASS_UNWATCH`, mất quyền hoặc disconnect sẽ bỏ tham chiếu snapshot/đăng ký. Dữ liệu lớp, tin nhắn, nhiệm vụ và điểm vẫn lưu MySQL. Push tự động không reset thời gian AFK. Reconnect đăng ký lại danh sách/lớp/bảng điểm đang xem; không tự phát lại thao tác đã gửi.
- Tổng quan thống kê giáo viên và các màn hình soạn nội dung/quản trị nghiệp vụ vẫn dùng REST; việc chuyển này áp dụng cho luồng lớp học.

Kiểm thử: `ClassroomSocketIntegrationTest` chạy MySQL thật trên schema tạm `grammar_quest_class_socket_<random>_test`, thử 20 học sinh cùng join/chat, chống join trùng, giao/bắt đầu nhiệm vụ, đọc điểm thay đổi, đóng bài, báo cáo, xóa thành viên và chặn truy cập. LearningService được mock trong test này để cô lập nghiệp vụ lớp; các bảng/quyền/SQL/transaction lớp dùng thật. Bật `$env:RUN_CLASSROOM_DB_TEST='true'` khi chạy Maven test với JDK 21; dùng cấu hình tài khoản MySQL tương tự test kiểm tra trực tiếp bên dưới. Không sửa DB `grammar_quest`.

UI: Vite cổng 5175 rồi `node scripts/check-classroom-socket.mjs` trong `source/client`. Kiểm thử trình duyệt với socket giả lập cho tạo/join, push thành viên/đổi tên/chat/nhiệm vụ, bắt đầu và trả lời, điểm trực tiếp, đóng nhiệm vụ, thu hồi quyền; khẳng định không phát REST lớp học hoặc socket STOMP. Ảnh tại `artifacts/role-views/classroom-websocket.png`.

## Kiểm tra trực tiếp trong lớp (WebSocket)

- Giáo viên mở **Lớp học → chọn lớp → Kiểm tra trực tiếp → Tạo kiểm tra**. Đặt tên, hạn làm chung, nhập 1–30 câu trắc nghiệm (4 lựa chọn/câu), chọn đáp án đúng và lưu. Học sinh mở lớp, chọn bài kiểm tra để làm. Đây là loại kiểm tra riêng, không thay đổi nhiệm vụ theo bài học đã có.
- Dùng lại `/api/ws-system`, không mở socket riêng. Actions: `EXAM_LIST`, `EXAM_CREATE`, `EXAM_OPEN`, `EXAM_EDIT`, `EXAM_ANSWER`, `EXAM_SUBMIT`, `EXAM_SYNC`, `EXAM_UNWATCH`. Response `EXAM_DATA`/`ERROR` theo requestId; push `EXAM_UPDATE`/`EXAM_ERROR` riêng từng client.
- Mỗi lần chọn đáp án gửi ngay tới server và lưu DB; học sinh có thể đổi lựa chọn trước khi nộp/hết giờ. Client đồng bộ mỗi 5 giây qua socket; đồng bộ tự động không được tính là thao tác thật để tránh che trạng thái AFK. Khi mất kết nối, không phát lại đáp án cũ; kết nối lại lấy trạng thái đã lưu. Nút làm bài bị vô hiệu trong thời gian mất kết nối.
- Bảng xếp hạng giáo viên cập nhật khoảng mỗi giây: ID/username, số câu đã trả lời, câu đúng, điểm /10 và trạng thái chưa bắt đầu/đang làm/đã nộp/hết giờ. Xếp theo số câu đúng giảm dần, số câu đã trả lời giảm dần, rồi ID. Chỉ giáo viên sở hữu lớp được xem toàn bộ điểm và đáp án đúng. Học sinh chỉ nhận bài làm của mình; điểm cá nhân hiển thị khi kiểm tra đóng/hết hạn.
- Giáo viên **Sửa đề / Đáp án → Lưu và đồng bộ**: giữ ID câu để bảo toàn lựa chọn; thêm/xóa câu được đồng bộ; câu bị xóa sẽ loại cả câu trả lời và điểm của nó. Chấm lại toàn bộ bài, kể cả đã nộp, theo đáp án mới. Học sinh thấy thông báo đổi đề và nội dung mới không cần F5. `version` chặn trả lời theo đề cũ; `revision` ngăn phản hồi cũ ghi đè dữ liệu mới. Hai tab giáo viên sửa cùng phiên bản không thể âm thầm ghi đè nhau.
- Kiểm tra dùng hạn làm chung; hết giờ/đóng sẽ chặn câu trả lời mới trên server, lấy các lựa chọn đã lưu làm kết quả. Bài đã nộp không được đổi đáp án dù giáo viên mở lại; tạo kiểm tra mới nếu muốn một lượt mới.
- **DB bền vững:** Flyway `V14__live_class_exams.sql` thêm `class_exams` (đề, đáp án đúng, phiên bản, hạn làm) và `class_exam_submissions` (khóa `(exam_id,user_id)`, JSON đáp án, số đúng, số đã trả lời, trạng thái nộp). Mỗi thao tác thay đổi khóa hàng exam `FOR UPDATE` trong transaction: các đề độc lập vẫn chạy song song; cùng đề tuần tự cập nhật an toàn, không mất đáp án khi nhiều học sinh gửi cùng lúc hoặc giáo viên đang sửa.
- **Cấp phát RAM:** `SystemSocketHandler.examWatches` là `ConcurrentHashMap`, mỗi socket giữ tối đa một snapshot cá nhân. Học sinh không được nhận `correct` hoặc bảng điểm của bạn khác. Snapshot vẫn giữ khi đang xem kết quả để tiếp tục nhận sửa đề; đổi đề, đóng màn hình, rời trang, bị xóa khỏi lớp hoặc mất kết nối sẽ thu hồi. Dashboard hiển thị ID kiểm tra, số câu và tính vào Active Snapshots. Bài làm trong DB vẫn tồn tại sau thu hồi/restart. Giới hạn chống spam đáp án chung áp dụng cả `EXAM_ANSWER`.

Kiểm tra đã có:

- `LiveExamConcurrencyTest`: MySQL schema tạm riêng, 20 học sinh gửi đồng thời, sửa đáp án trong lúc nhiều học sinh gửi, chấm lại bài đã nộp, từ chối đề cũ/người ngoài lớp/người bị xóa khỏi lớp và đọc lại bài từ DB. Chạy trong `source/server`: `$env:RUN_LIVE_EXAM_DB_TEST='true'` rồi `./mvnw.cmd '-Djava.version=21' test` (JAVA_HOME trỏ JDK 21). Test tạo/dọn schema `grammar_quest_live_exam_<random>_test`, không dùng database `grammar_quest`. Mặc định lấy tài khoản MySQL trong application.yml, có thể đặt `EXAM_TEST_DB_USER`/`EXAM_TEST_DB_PASSWORD`.
- `SystemSocketHandlerTest`: push đề đổi, snapshot RAM, thu hồi và không reset AFK bởi push.
- UI: Vite cổng 5175 rồi `node scripts/check-live-exam.mjs`. Ba cửa sổ giả lập giáo viên/hai học sinh: tạo đề, trả lời, đổi xếp hạng, sửa câu/đáp án trực tiếp, bảo toàn lựa chọn, heartbeat, không gọi REST cho kiểm tra. Test trình duyệt dùng server socket giả lập; kiểm thử MySQL chạy riêng như trên.

- Backend tests: SystemSocketHandlerTest, AdminModerationTest, BossRulesTest, AssignmentAnswerGuardTest, TestDatabaseGuardTest.
- UI smoke: Vite ở cổng 5175; chạy `node scripts/check-role-views.mjs` trong source/client. Dùng Edge headless, API/socket giả lập, kiểm tra admin hợp nhất, redirect URL cũ, teacher và mobile; ảnh tại artifacts/role-views. Không thay thế integration test MySQL.
## Chat hỗ trợ sự cố — 21/10/2026

- Học sinh/giáo viên: nút **Hỗ trợ** ở góc dưới bên phải trên các trang đã đăng nhập. Có thể mở, đóng, gửi mô tả sự cố và đọc lịch sử. Đóng khung chat vẫn nhận badge khi bot/Admin phản hồi trong phiên online.
- Admin: menu **Hỗ trợ người dùng** → `/admin?tab=support`, chọn hội thoại và trả lời realtime. Danh sách và nội dung cập nhật qua socket dùng chung.
- Trợ lý tự động trả lời theo các nhóm đăng nhập, kết nối, điểm/XP và lộ trình; không dùng AI, không tự sửa dữ liệu. Bot tạm dừng 5 phút sau lần Admin trả lời gần nhất.
- MySQL lưu hội thoại/tin nhắn bằng migration V18. Khởi động lại backend để Flyway tạo bảng; không cần dịch vụ hoặc cấu hình ngoài. Chỉ chủ hội thoại và Admin được xem tin. Gửi lại cùng `clientMessageId` không tạo tin/bot trùng.
- Kiểm chứng: backend 79 test được phát hiện, 78 qua, 1 bỏ qua (kiểm thử trình duyệt toàn luồng chưa bật); có kiểm thử MySQL/socket thật cho phân quyền, nhiều tab, lưu lịch sử, bot và Admin. Script UI `check-support-chat.mjs` qua với API/socket giả lập, gồm mobile và đóng bằng Escape. Frontend build thành công.

## Cập nhật realtime workspace — 19/10/2026

- Tổng quan giáo viên dùng `TEACHER_OVERVIEW_WATCH` → `WORKSPACE_DATA`; server kiểm tra lại quyền, đọc số liệu mỗi 2,5 giây và chỉ push `WORKSPACE_UPDATE` khi JSON thay đổi. Không còn gọi REST tổng quan từ trang giáo viên.
- Admin dùng `ADMIN_REPORTS_WATCH` để nhận danh sách báo cáo và các thẻ tổng quan. Xử lý bằng `ADMIN_REPORT_DECIDE` → `REPORT_DECISION_DATA`, có kiểm tra payload, quyền ADMIN trong DB và transaction/khóa bản ghi cũ. Các Admin đang mở trang tự nhận trạng thái mới trong chu kỳ tối đa 2,5 giây. Màn hình báo cáo không gọi REST để tải hay xử lý báo cáo.
- `ConcurrentHashMap` giữ tối đa một đăng ký workspace và JSON gần nhất trên mỗi socket; `WORKSPACE_UNWATCH`, mất quyền hoặc ngắt kết nối sẽ thu hồi đăng ký. Đây là cache giám sát, không phải gói câu hỏi và không cộng vào Active Snapshots. Dữ liệu chính vẫn nằm trong MySQL.
- Thao tác chủ đề/bài học/câu hỏi chung của giáo viên hoặc Admin phát `CURRICULUM_CHANGED` **sau COMMIT**. Lộ trình, tổng quan học sinh và danh sách bài luyện tập nhận tín hiệu rồi đọc lại dữ liệu theo quyền cá nhân bằng WebSocket. Không phát nội dung lý thuyết hay đáp án chung cho mọi client; không sửa gói đề của lượt làm bài đang diễn ra.
- Dùng lại kết nối trong `SystemSocketContext`; trang đăng ký lại sau reconnect. Các endpoint REST cũ vẫn tồn tại để tương thích. Đăng nhập, soạn nội dung, danh sách tài khoản, nhật ký và biểu đồ theo ngày giữ REST.
- Kiểm chứng: frontend `npm run build` thành công. Nhóm `SocketWorkspaceServiceTest`, `SystemSocketHandlerTest` và `FullRealtimeIntegrationTest#workspaceWatchAndReportDecisionAndCurriculumPushUseRealSockets` chạy 22 test, không lỗi/không bỏ qua. Integration test khởi động Tomcat + MySQL schema tạm riêng, dùng socket thật để kiểm tra cập nhật tổng quan, đồng bộ quyết định giữa hai socket Admin, từ chối quyền học sinh và phát tín hiệu sau lưu chủ đề. Log: `source/server/target/workspace-live-tests.log`. Chưa chạy kiểm thử trình duyệt cho các luồng mới trong lần cập nhật này.

