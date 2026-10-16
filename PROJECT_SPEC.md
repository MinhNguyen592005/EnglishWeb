# PROJECT_SPEC — Grammar Quest

> Đặc tả để nhóm và AI coding assistant cùng phát triển dự án.
> Ngày: 09/10/2026. Trạng thái: baseline đề xuất để bắt đầu code.
> Đọc cùng `UI.md` ở thư mục gốc. Các mặc định nghiệp vụ dưới đây chuẩn hóa ý tưởng và mockup; có thể được chủ dự án thay đổi bằng yêu cầu rõ ràng.

## 1. Mục tiêu và giới hạn

Grammar Quest là website học **ngữ pháp tiếng Anh** qua lộ trình kiến thức, luyện tập, đánh boss và thi đấu PvP. Chủ đề giao diện là **Trạm không gian nền sáng**, đơn giản, dễ đọc, thuận tiện triển khai bằng React.

- Mỗi chủ đề ngữ pháp là một trạm/hành tinh.
- Mỗi chủ đề gồm bài lý thuyết, luyện tập và kiểm tra.
- Boss nhỏ kiểm tra từng bài; boss chương kiểm tra kiến thức tổng hợp.
- Kết quả kiểm tra quyết định mở khóa; EXP ghi nhận hoạt động học tập.
- Giáo viên tạo lớp, giao nhiệm vụ, soạn câu hỏi và theo dõi kết quả.
- Admin quản lý tài khoản, nội dung chung và báo cáo vi phạm.
- Đề tài phải thể hiện rõ giao tiếp nhiều client với một server, đặc biệt qua PvP và chat.

Không tự thêm học từ vựng, nghe/nói, chatbot AI, thanh toán, VIP, cửa hàng vật phẩm, mạng xã hội hoặc game 3D. Không cần Docker, Kubernetes, microservices, Redis hay dịch vụ đám mây để chạy bản đầu.

## 2. Công nghệ và kiến trúc chốt

| Thành phần | Lựa chọn |
| --- | --- |
| Frontend | React + TypeScript, khởi tạo bằng Vite |
| Điều hướng | React Router |
| Giao diện | Tailwind CSS, token và component dùng chung theo `UI.md` |
| Icon | Một bộ icon nhất quán, mặc định Lucide React |
| HTTP client | `fetch` qua một lớp API client chung |
| Backend | Java 21 + Spring Boot + Maven |
| Xác thực | Spring Security; session cookie HttpOnly |
| Truy cập dữ liệu | Spring Data JPA/Hibernate |
| Database | MySQL cài trực tiếp trên máy |
| Migration | Flyway, một nguồn quản lý schema |
| API | REST, JSON, tiền tố `/api/v1` |
| Thời gian thực | Spring WebSocket + STOMP, STOMP client ở React |
| Kiểm thử backend | JUnit và bộ công cụ kiểm thử Spring |
| Kiểm thử frontend | Vitest/React Testing Library; E2E khi cần kiểm tra luồng nhiều client |

- Không dùng Next.js, không dùng cấu trúc Next.js App Router, không cần SSR.
- Dùng một backend monolith và một database. Backend cung cấp HTTP API và WebSocket trong cùng ứng dụng.
- Client chạy mặc định cổng `5173`; backend `8080`; MySQL mặc định `3306`, cấu hình được qua biến môi trường.
- Chọn phiên bản dependency tương thích tại thời điểm khởi tạo, ghi lại phiên bản thực dùng và commit lockfile. Không tự dùng từ “latest” làm cấu hình tái lập.
- Vite proxy `/api` và `/ws` về backend trong môi trường phát triển; proxy phải hỗ trợ WebSocket.
- Browser không dùng Java TCP Socket/BufferedReader. HTTP và WebSocket là giao thức trao đổi của ứng dụng này. Nếu môn học bắt buộc TCP socket thuần, cần chốt lại kiến trúc trước khi đổi.

### Phân chia trách nhiệm

| Client | Server | Database |
| --- | --- | --- |
| Hiển thị câu hỏi, nhận đáp án, chạy hiệu ứng | Kiểm tra quyền, chấm bài, tính HP/EXP, điều phối trận | Lưu nội dung và kết quả bền vững |
| Hiển thị đồng hồ theo thời điểm server gửi | Quyết định hạn trả lời và thời gian hợp lệ | Lưu tiến độ, lịch sử, thưởng |
| Gửi hành động của người dùng | Kiểm tra trạng thái, chống gửi trùng và xử lý đồng thời | Duy trì ràng buộc duy nhất và toàn vẹn |

Trang giáo viên và admin cũng là frontend. Ẩn nút ở client không thay thế kiểm tra quyền ở server. Logic nghiệp vụ quan trọng không đặt trong frontend.

## 3. Cấu trúc repository

Giữ form thư mục của đồ án. Những file chưa thực sự có không được ghi là đã hoàn thành.

| Đường dẫn | Nội dung |
| --- | --- |
| `README.md` | Tổng quan, công nghệ, chức năng đã có, đường dẫn hướng dẫn |
| `INSTRUCTION.md` | Cài đặt trên Windows, tạo DB, cấu hình, chạy hai ứng dụng, demo và xử lý lỗi |
| `TOPICS.md` | Đề tài, phạm vi, phần lập trình mạng, phân công nhóm |
| `PROJECT_SPEC.md` | Đặc tả này |
| `UI.md` | Quy chuẩn giao diện |
| `report/report.pdf` | Báo cáo khi nhóm đã tạo; không tạo PDF rỗng |
| `statics/architecture.png` | Sơ đồ kiến trúc khi có |
| `statics/protocol.png` | Sơ đồ HTTP/WebSocket khi có |
| `statics/ui/` | Ảnh mockup dùng để tham khảo |
| `statics/dataset/` | Câu hỏi và nội dung mẫu có nguồn gốc rõ |
| `statics/results/` | Ảnh demo, kết quả kiểm thử |
| `source/client/` | React/Vite, `package.json`, lockfile, `.env.example` |
| `source/server/` | Spring Boot, `pom.xml`, Maven Wrapper, cấu hình và migration |
| `source/common/` | `openapi.yaml`, `websocket-events.md`, `error-codes.md`, mẫu JSON |

Chưa tạo `source/service/`: hiện không có ứng dụng/dịch vụ độc lập để đặt vào đó. Các lớp Java nghiệp vụ vẫn nằm bên trong backend, không phải một server riêng.

Frontend tổ chức `src/app/` cho router/providers, `src/pages/` cho màn hình, `src/features/` theo chức năng, `src/components/` dùng chung, `src/services/` cho HTTP/WebSocket, `src/hooks/`, `src/types/`, `src/styles/`. Hình dùng thật nằm trong `public/images/` hoặc `src/assets/`.

Backend mặc định package `com.grammarquest`, chia module `auth`, `users`, `learning`, `attempts`, `gamification`, `classrooms`, `arena`, `chat`, `moderation`. Trong mỗi module đặt controller/service/repository/entity/dto theo nhu cầu. Có package chung `config`, `security`, `exception`, `websocket`. Không duy trì hai bản logic trùng nhau.

## 4. Vai trò và quyền

| Hành động | LEARNER | TEACHER | ADMIN |
| --- | --- | --- | --- |
| Học, luyện tập, xem kết quả của mình | Có | Không | Không; chỉ dùng trang quản trị |
| Vào lớp bằng mã | Có | Không | Không |
| Chat lớp | Lớp mình tham gia | Lớp mình quản lý | Không; xử lý báo cáo trong trang quản trị |
| Tạo/quản lý lớp | Không | Lớp mình sở hữu | Không |
| Xem kết quả học viên | Không | Học viên và nhiệm vụ thuộc lớp mình | Không có màn hình kết quả lớp; chỉ xem số lớp tổng quan |
| Soạn câu hỏi | Không | Câu hỏi mình sở hữu | Nội dung chung/toàn hệ thống |
| Xuất bản lộ trình chung | Không | Có | Có |
| Thay đổi vai trò, khóa tài khoản | Không | Không | Có |
| Xử lý báo cáo vi phạm | Gửi báo cáo | Gửi báo cáo | Xem xét và xử lý |

- Đăng ký công khai luôn tạo LEARNER; không nhận `role` từ form để tự cấp TEACHER/ADMIN.
- Admin có thể cấp quyền giáo viên. Chặn việc hạ quyền/khóa admin hoạt động cuối cùng.
- Admin không tham gia học tập, lớp học, đấu trường hoặc thao tác của giáo viên; client chuyển thẳng đến trang quản trị và server từ chối các API tham gia.
- Giáo viên vào thẳng tổng quan giảng dạy; không tham gia lộ trình, luyện tập, bài giao hoặc đấu trường của học viên.
- Truy vấn và thao tác theo ID phải kiểm tra quyền sở hữu/thành viên, không chỉ kiểm tra tên vai trò.
- Tài khoản bị khóa không được bắt đầu hoạt động mới. Tạm cấm chat chỉ chặn nhắn tin, không khóa học tập.

## 5. Phạm vi triển khai theo giai đoạn

### P0 — Bản demo cốt lõi phải hoạt động thật

1. Đăng ký, đăng nhập, đăng xuất và phân quyền.
2. Dashboard, bản đồ, chi tiết chương, lý thuyết.
3. Luyện trắc nghiệm, giải thích đáp án, lịch sử và ôn lỗi sai.
4. Boss bài học, boss chương, EXP, level, mở khóa bền vững.
5. PvP hai người: tạo phòng, nhập mã, sẵn sàng, thi đấu, kết quả.
6. Giáo viên tạo lớp, mã tham gia, câu hỏi, giao nhiệm vụ, xem kết quả.
7. Chat lớp/phòng, phân quyền kênh nhận tin.
8. Admin quản lý tài khoản, nội dung, xem báo cáo vi phạm và khóa/cấm chat.
9. Trạng thái đang tải, trống, lỗi, thiếu quyền và mất kết nối.
10. Hướng dẫn chạy không Docker, seed dữ liệu và kịch bản demo.

### P1 — Hoàn thiện sau khi P0 ổn định

- Quên/đổi mật khẩu, email qua SMTP cấu hình thật.
- Thông báo, lời mời PvP, huy hiệu, mục tiêu/ngày và streak.
- Điền từ, tìm/sửa lỗi, viết lại câu.
- Báo cáo học tập chi tiết, xuất CSV, chỉnh cấu hình EXP/ngưỡng đạt.
- Responsive đầy đủ và chi tiết cài đặt hồ sơ.

Mockup P1 là định hướng thiết kế, không đồng nghĩa mọi tính năng phải code cùng lúc. Không hiển thị nút hoạt động giả: chức năng chưa làm phải ẩn hoặc ghi rõ “Sắp có” trong bản demo. Không mô phỏng thành công khi API thực tế lỗi.

### Chưa triển khai

PvP hơn hai người, hợp tác đánh boss, ghép trận tự động, mùa giải, AI chấm tự luận, lưu trạng thái realtime nhiều server. Chỉ thêm khi chủ dự án yêu cầu.

## 6. Nội dung học và dữ liệu demo

Các nhóm kiến thức: Các thì cơ bản; Câu điều kiện; Câu bị động; Mệnh đề quan hệ. Bài học có mục tiêu, cấu trúc, cách dùng, ví dụ, lưu ý và câu hỏi liên kết.

- Seed ít nhất 1 chương hoàn chỉnh: Câu điều kiện loại 0, 1, 2, 3 và boss chương.
- Ít nhất 60 câu trắc nghiệm được kiểm tra thủ công: 15 câu mỗi loại, có đáp án và giải thích tiếng Việt.
- Câu hỏi phải có đúng một đáp án hợp lệ; nêu ngữ cảnh đủ rõ để tránh hai lựa chọn đều đúng.
- Ba chủ đề còn lại có thể là bản nháp cho đến khi đủ nội dung. Không mở bài rỗng cho người học.
- Tài khoản demo theo vai trò, 1 lớp, nhiệm vụ và lịch sử mẫu chỉ nạp trong profile `dev`. Mật khẩu demo từ cấu hình hoặc hướng dẫn phát triển, không là credential production.
- Seed có tính lặp an toàn, không nhân đôi dữ liệu khi chạy lại.
- Dữ liệu bài tập tự biên soạn hoặc được phép sử dụng; ghi nguồn trong `statics/dataset/README.md`.

## 7. Luật học tập, boss và EXP

### 7.1 Lộ trình

Trạng thái bài: `LOCKED`, `AVAILABLE`, `IN_PROGRESS`, `COMPLETED`. Điều kiện mở khóa do server kiểm tra. Hoàn thành boss bài học mới đánh dấu bài hoàn thành; bấm đọc xong lý thuyết chưa đủ.

- Được đọc lại lý thuyết và luyện tập của bài đã hoàn thành.
- Đủ các bài tiên quyết thì mở boss chương; qua boss chương mới mở chương tiếp theo đã xuất bản.
- Kiểm tra cấu hình để không tạo vòng lặp tiên quyết.
- Chưa đủ câu hỏi: không tạo lượt chơi, trả lỗi rõ cho client; không sinh lặp câu để đủ số lượng.

### 7.2 Lượt làm bài

Server tạo `attemptId`, chốt danh sách/thứ tự câu hỏi, phiên bản nội dung và cấu hình ở thời điểm bắt đầu. Một câu chỉ có một đáp án được chấp nhận trong lượt đó. Sửa nội dung hoặc cấu hình sau này không làm thay đổi lượt đang diễn ra hay lịch sử cũ.

Luyện tập có thể hiện lời giải ngay sau khi chấm. Boss hiện đúng/sai và sát thương sau mỗi câu; lời giải đầy đủ ở cuối lượt. Người học không nhận trường đáp án đúng trong API lấy câu hỏi chưa làm.

### 7.3 Boss mặc định

| Loại | Số câu | Ngưỡng đạt | HP đầu | Sát thương/câu đúng | Thưởng lần đầu |
| --- | --- | --- | --- | --- | --- |
| Boss bài học | 5 | 5/5 | 100 | 20 | 50 EXP |
| Boss chương | 10 | 8/10 | 100 | 12,5 | 150 EXP |

- Đây là baseline thống nhất với bộ UI Trạm không gian; không suy ra luật 4/5 từ mockup fantasy cũ.
- Sai không gây sát thương. P0 không cần HP người chơi, vật phẩm hay cơ chế mua mạng.
- HP hiển thị = `max(0, 100 × (1 − correctCount / requiredCorrect))`; tính trên số câu đúng để tránh lỗi tích lũy số thập phân.
- Hoàn thành toàn bộ câu hỏi rồi chốt kết quả, kể cả khi HP đã về 0 trước câu cuối. Thắng khi `correctCount >= requiredCorrect`.
- Thất bại: không cộng EXP boss, không mở khóa; cho ôn và thử lại bằng bộ câu hỏi mới khi có thể.
- Chỉ tính thưởng lần đầu thắng mỗi boss; chơi lại vẫn lưu kết quả nhưng không nhận trùng thưởng.
- Ngưỡng đạt nhiệm vụ giáo viên có thể khác; đó là kết quả nhiệm vụ, không tự thay thế điều kiện hoàn thành lộ trình chung.

### 7.4 EXP và level

- Server lưu sổ giao dịch EXP (`xp_ledger`) và tổng EXP trong cùng transaction hoặc cập nhật từ ledger có kiểm soát.
- Mặc định: `level = floor(totalXp / 1000) + 1`; `xpInLevel = totalXp % 1000`.
- Ví dụ `totalXp = 7750` → cấp 8, tiến độ 750/1000; thêm 50 → 800/1000. Không đặt số cấp độc lập với EXP.
- Hoàn thành luyện thường không tự cộng EXP vô hạn. Nhiệm vụ ôn 5 câu sai khác nhau: đúng ít nhất 5 câu từng sai, nhận 10 EXP tối đa một lần/ngày (nếu triển khai nhiệm vụ ngày).
- P0 PvP không cộng EXP; kết quả trận được lưu riêng. Số thưởng trong ảnh không ghi ở đây chỉ là minh họa, không thành luật.
- Mở khóa dựa trên thành tích kiểm tra, không dựa vào level.
- Lưu thời điểm UTC; ngày học/ngày nhận thưởng hiển thị và quy đổi theo `Asia/Ho_Chi_Minh` cho demo.

### 7.5 Các dạng câu hỏi P1

- Điền từ/viết lại câu: chấm bằng danh sách đáp án chấp nhận đã được giáo viên kiểm tra; chuẩn hóa khoảng trắng và quy tắc viết hoa được cấu hình. Không tuyên bố chấm hiểu ngữ nghĩa tự do.
- Tìm lỗi: có vị trí lỗi và đáp án sửa xác định.
- Ưu tiên P0 trắc nghiệm trước. Luật chấm phải nằm ở server cho mọi dạng bài.

## 8. PvP hai người

### 8.1 Phòng và vòng đời

Phòng có mã do server sinh, host, tối đa 2 thành viên, chủ đề, số câu (mặc định 10), thời gian/câu (20 giây). Mỗi người chỉ ở một trận đang hoạt động. Host bắt đầu khi đủ 2 người và cả hai sẵn sàng.

Trạng thái: `WAITING` → `READY` → `IN_PROGRESS` → `FINISHED`. Có `PAUSED`, `CANCELLED` cho trường hợp ngoại lệ. Sẵn sàng là trạng thái từng thành viên; rời phòng chờ làm trạng thái phòng được tính lại. Nếu host rời phòng chờ, chuyển host cho người còn lại; phòng rỗng được đóng.

### 8.2 Chấm điểm và thời gian

- Hai người nhận cùng câu hỏi và thứ tự lựa chọn trong một vòng.
- Server gửi `questionId`, nội dung, `startedAt`, `deadlineAt`, `serverTime`, `stateVersion`.
- Đúng = 1 điểm, sai/hết giờ = 0. Một người chỉ có một đáp án hợp lệ mỗi vòng.
- Kết thúc vòng khi cả hai đã trả lời hoặc hết giờ. Không công bố đáp án đúng cho một bên trong lúc bên kia còn được trả lời; chỉ gửi trạng thái đã trả lời.
- Khi vòng đóng, gửi kết quả chấm và điểm. Toàn bộ giải thích có thể xem sau trận.
- So sánh tổng điểm trước; hòa điểm thì so tổng thời gian của các câu đúng do server đo. Nếu vẫn bằng nhau, kết quả hòa.
- Server dùng thời điểm nhận đáp án, không tin thời gian/điểm do client gửi. Đồng hồ client chỉ để hiển thị.

### 8.3 Mất kết nối và kết thúc bất thường

- P0 demo dùng chính sách tạm dừng một lần tối đa 30 giây/trận khi phát hiện người chơi mất kết nối; mọi client còn kết nối nhận cùng trạng thái pause.
- Ghi phần thời gian còn lại khi pause; không tính thời gian pause vào tốc độ trả lời. Reconnect hợp lệ nhận snapshot và deadline mới.
- Hết 30 giây: người không quay lại bị xử thua; nếu cả hai đều vắng thì hủy trận, không có người thắng.
- Hết lượt pause mà lại mất kết nối: tiếp tục tính giờ; hết grace period 30 giây vẫn vắng thì xử thua. Không cho ngắt mạng liên tục để kéo dài trận.
- Chủ động rời trận đang chơi: yêu cầu xác nhận ở UI, server ghi nhận xử thua.
- Server restart: trận đang chạy được đánh dấu `CANCELLED` với lý do, không ghi thắng hoặc cộng thưởng giả. Không yêu cầu khôi phục trận trong P0.
- Một tài khoản với nhiều tab không được tính thành hai người. Chỉ một kết nối điều khiển trận; kết nối thay thế phải cập nhật rõ trạng thái và loại bỏ kết nối cũ.

## 9. Lớp học, nhiệm vụ, chat và quản trị

- Giáo viên tạo lớp, nhận mã tham gia, mời bằng cách sao chép mã; hệ thống không tự gửi email thay giáo viên trong P0.
- Tham gia lớp là thao tác lặp an toàn: một người không xuất hiện nhiều lần trong cùng lớp.
- Nhiệm vụ gồm tên, lớp, chủ đề, dạng, số câu, ngưỡng đạt, hạn nộp, hướng dẫn; có `DRAFT`, `PUBLISHED`, `CLOSED`.
- P0 chặn bắt đầu lượt nhiệm vụ sau hạn. Một lượt bắt đầu trước hạn được nộp đến hết thời lượng lượt đã chốt; UI thể hiện rõ. Khi có nhiều lần thử, báo cáo dùng kết quả tốt nhất và vẫn giữ lịch sử từng lần.
- Giáo viên chỉ xem kết quả thuộc lớp mình, thống kê đúng/sai theo chủ đề và danh sách cần ôn.
- Chat văn bản: giới hạn 1.000 ký tự/tin; mặc định tối đa 5 tin/10 giây/người; kiểm tra thành viên khi gửi và subscribe.
- P0 không upload file trong chat. Hiển thị text an toàn, không render HTML tùy ý từ tin nhắn.
- Báo cáo vi phạm lưu người gửi, đối tượng, tin nhắn/bằng chứng và trạng thái. Admin quyết định bỏ qua, cảnh cáo, cấm chat hoặc khóa tạm thời; server thực thi và ghi audit log.
- Nội dung chung có bản nháp/xuất bản; learner chỉ đọc nội dung được xuất bản và được phép truy cập.
- Khóa tạm thời có `expiresAt`. Kiểm tra hết hạn khi xử lý yêu cầu, không phụ thuộc hoàn toàn tác vụ chạy theo lịch.

## 10. Mô hình dữ liệu đề xuất

| Nhóm | Bảng/chủ thể chính |
| --- | --- |
| Tài khoản | `users` (role, status, password_hash), `sanctions`, `password_reset_tokens` (P1) |
| Nội dung | `topics`, `lessons`, `lesson_prerequisites`, `question_versions`, `question_options`, `boss_configs` |
| Học tập | `attempts`, `attempt_questions`, `attempt_answers`, `lesson_progress`, `wrong_question_reviews` |
| Trò chơi hóa | `xp_ledger`, `user_stats`, `daily_mission_claims` (P1), `badges`, `user_badges` (P1) |
| Lớp học | `classrooms`, `class_members`, `assignments`, `assignment_attempts` |
| PvP | `rooms`, `room_members`, `matches`, `match_players`, `match_rounds`, `match_answers` |
| Giao tiếp/quản trị | `chat_messages`, `violation_reports`, `audit_logs`, `notifications` (P1) |

Ràng buộc quan trọng: email duy nhất; `(classroom_id,user_id)` duy nhất; `(attempt_id,question_id)` cho câu trả lời duy nhất; `(match_id,round_id,user_id)` duy nhất; ledger có `reward_key` duy nhất theo người và sự kiện; nhận thưởng ngày duy nhất theo người, loại nhiệm vụ và ngày.

Không trả entity JPA trực tiếp ra API. DTO learner không chứa password hash, đáp án chưa công bố hoặc dữ liệu nội bộ. Dùng migration SQL, không dựa vào `ddl-auto=update` để thay đổi schema; sau migration dùng `validate`.

## 11. Hợp đồng HTTP API

Tiền tố `/api/v1`. Tài liệu API phải mô tả body, response, quyền, validation và mã lỗi. Các route dưới đây là baseline để thiết kế OpenAPI, không phải API đã triển khai.

| Nhóm | Endpoint tiêu biểu |
| --- | --- |
| Auth | `GET /auth/csrf`, `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Hồ sơ | `GET/PATCH /me`, `GET /me/progress`, `GET /me/attempts` |
| Học | `GET /topics`, `GET /topics/{id}`, `GET /lessons/{id}`, `POST /lessons/{id}/start` |
| Luyện/boss | `POST /attempts`, `GET /attempts/{id}`, `POST /attempts/{id}/answers`, `POST /attempts/{id}/finish`, `GET /attempts/{id}/result` |
| Phòng | `POST /rooms`, `POST /rooms/join`, `GET /rooms/{id}`, `POST /rooms/{id}/leave` |
| Trận | `GET /matches/{id}/snapshot`, `GET /matches/{id}/result` |
| Lớp learner | `GET /me/classes`, `POST /classes/join`, `GET /classes/{id}/assignments` |
| Giáo viên | `/teacher/classes`, `/teacher/questions`, `/teacher/assignments`, `/teacher/classes/{id}/report` |
| Chat | `GET /classes/{id}/messages` hoặc `/rooms/{id}/messages`, có phân trang |
| Admin | `/admin/users`, `/admin/topics`, `/admin/lessons`, `/admin/reports`, `/admin/settings` |

Không triển khai cùng một lệnh nghiệp vụ ở hai nơi với logic khác nhau: nếu HTTP và STOMP cùng gọi một use case, phải đi qua cùng service.

Request nộp đáp án mẫu:

```json
{
  "requestId": "4fe57ae7-c1eb-4197-8c3a-4ce441fa6c81",
  "questionId": 101,
  "selectedOptionId": 403
}
```

Success mẫu:

```json
{
  "data": {"attemptId": 9001, "correct": true, "bossHp": 60},
  "meta": {"requestId": "4fe57ae7-c1eb-4197-8c3a-4ce441fa6c81"}
}
```

Lỗi mẫu (giữ HTTP status phù hợp, không luôn trả 200):

```json
{
  "error": {
    "code": "LESSON_LOCKED",
    "message": "Hoàn thành bài trước để mở khóa bài này.",
    "fieldErrors": []
  },
  "requestId": "4fe57ae7-c1eb-4197-8c3a-4ce441fa6c81"
}
```

Danh sách trả `items`, `page`, `size`, `totalItems`; thời gian ISO 8601 UTC. Client lấy user từ session, không tự gửi userId để nhận quyền. Mã lỗi tối thiểu: `UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_ERROR`, `LESSON_LOCKED`, `INSUFFICIENT_QUESTIONS`, `ALREADY_ANSWERED`, `ROOM_FULL`, `INVALID_STATE`, `DEADLINE_EXCEEDED`, `ACCOUNT_LOCKED`, `RATE_LIMITED`.

## 12. Hợp đồng WebSocket/STOMP

- Endpoint handshake `/ws`.
- Client gửi lệnh tới `/app/rooms/{roomId}/ready`, `/app/rooms/{roomId}/start`, `/app/matches/{matchId}/answer`, `/app/chat/{channelId}/send`.
- Subscribe `/topic/rooms/{roomId}`, `/topic/matches/{matchId}`, `/topic/classes/{classId}/chat`; lỗi riêng và thông báo riêng qua `/user/queue/events`.
- Topic có ID không mặc nhiên công khai. Server kiểm tra quyền cả `SEND` và `SUBSCRIBE`, gắn principal từ session.
- Kết quả câu trả lời cần riêng tư trước khi đóng vòng phải gửi vào user queue, không broadcast.

Envelope sự kiện:

```json
{
  "type": "QUESTION_STARTED",
  "eventId": "7ab767d7-aaf3-4f36-b0c2-508bd9daf68b",
  "roomId": 42,
  "matchId": 88,
  "stateVersion": 12,
  "serverTime": "2026-10-09T13:00:00Z",
  "payload": {}
}
```

Lệnh client chứa `requestId`; server lấy người gửi từ principal. Sự kiện tối thiểu: `ROOM_UPDATED`, `MATCH_STARTED`, `QUESTION_STARTED`, `ANSWER_RECEIVED`, `ROUND_ENDED`, `SCORE_UPDATED`, `MATCH_PAUSED`, `MATCH_RESUMED`, `MATCH_FINISHED`, `MATCH_CANCELLED`, `CHAT_MESSAGE`, `ERROR`.

Client bỏ qua sự kiện trùng eventId và snapshot/sự kiện cũ hơn stateVersion đã áp dụng. Khi reconnect, lấy snapshot chính thức thay vì tự cộng dồn từ bộ nhớ cũ. Hủy subscription đúng khi rời trang, tránh lắng nghe trùng.

## 13. Xác thực, toàn vẹn và đồng thời

- Dùng BCrypt cho password; session cookie HttpOnly, SameSite phù hợp; bật Secure khi chạy HTTPS. Rotate session khi login, invalidate khi logout.
- Giữ CSRF protection cho request thay đổi dữ liệu; frontend lấy token từ endpoint CSRF và gửi header. Cấu hình token cho STOMP CONNECT theo cơ chế Spring Security dùng trong dự án.
- Chỉ cho origin đã cấu hình; không dùng wildcard với credential. Không tắt toàn bộ security/CSRF để né lỗi kết nối.
- Không lưu password/session token trong localStorage. `.env.example` chỉ chứa placeholder; không commit bí mật.
- Email reset P1 dùng token ngẫu nhiên, lưu hash, có hạn dùng, dùng một lần. Khi chưa cấu hình SMTP, UI không được giả vờ đã gửi email thật; chế độ dev có đường dẫn test được ghi rõ trong hướng dẫn và chỉ dùng ở dev.
- Thưởng EXP + hoàn thành bài + mở khóa phải là một transaction. Unique reward key bảo đảm retry không cộng trùng.
- Phòng tối đa 2 người: khóa theo phòng khi join/start hoặc transaction/locking tương đương. Không dùng chuỗi “đếm rồi insert” không được bảo vệ.
- Deadline và đáp án đến đồng thời: server có một bước chuyển trạng thái vòng có bảo vệ, chấm/finalize đúng một lần.
- Dùng `@Version` hoặc cơ chế khóa phù hợp cho dữ liệu có tranh chấp. Ghi rõ phạm vi: khóa trong bộ nhớ chỉ bảo vệ bản demo một instance, không giải quyết nhiều server.
- Không giữ transaction DB mở trong lúc chờ người chơi hoặc chờ socket. Sau commit mới phát sự kiện; stateVersion và snapshot giúp client phục hồi khi bỏ lỡ sự kiện.
- Validate dữ liệu đầu vào, giới hạn độ dài, phân trang, rate limit login/chat/answer. Ghi log có requestId nhưng không ghi password, cookie hoặc token.

## 14. Cách triển khai bằng prompt

1. Đọc `PROJECT_SPEC.md`, `UI.md`, cấu trúc code và ảnh liên quan trước khi sửa.
2. Mỗi lượt làm một module/luồng có đầu ra kiểm tra được. Không tạo toàn bộ ứng dụng bằng các trang chỉ có placeholder.
3. Tạo component giao diện dùng chung trước; dựng vài màn mẫu với mock data.
4. Thiết kế DTO/OpenAPI và sự kiện mạng trước khi hai phía tích hợp.
5. Làm auth → nội dung → lượt luyện/boss → tiến độ/EXP → lớp → PvP/chat → admin.
6. Mock API nằm sau cùng interface service với API thật. Dùng `VITE_USE_MOCK_API` rõ ràng; không tự fallback sang dữ liệu giả khi API thật bị lỗi.
7. Luồng được coi hoàn thành khi frontend gọi API thật, backend ghi DB và reload vẫn đúng, trừ khi nhiệm vụ hiện tại chỉ yêu cầu UI mock.
8. Giữ React/Vite và Spring Boot. Không tự đổi framework, thêm Docker hoặc viết logic server trong React.
9. Nếu ảnh khác đặc tả, ưu tiên yêu cầu mới của chủ dự án, tiếp đến luật trong file này, quy chuẩn `UI.md`, rồi mới đến chữ/số minh họa trong ảnh.
10. Cuối mỗi lượt báo file đã thay đổi, hành vi đã làm, cách chạy/kiểm tra, giới hạn còn lại. Không báo kiểm thử thành công nếu chưa chạy.

## 15. Tiêu chí nghiệm thu và demo

### Checklist chức năng

- [ ] Tạo tài khoản learner, login/logout; không tự đăng ký admin.
- [ ] Learner không gọi được API quản trị; giáo viên không xem được lớp người khác.
- [ ] Đọc bài, làm câu hỏi, nhận lời giải, vượt/thua boss đúng luật.
- [ ] Gửi lại cùng đáp án hoặc finish nhiều lần không nhân điểm/EXP.
- [ ] Reload, logout/login vẫn giữ tiến độ đã lưu.
- [ ] Hai trình duyệt/tài khoản thấy cùng câu và kết quả PvP; người thứ ba bị từ chối khi phòng đầy.
- [ ] Chỉ nhận đáp án trong thời gian hợp lệ; lệnh bắt đầu trùng không tạo hai trận.
- [ ] Mất mạng/reconnect có trạng thái rõ; server restart không sinh kết quả thắng giả.
- [ ] Chat chỉ nhận/gửi trong phòng/lớp được phép; cấm chat có hiệu lực.
- [ ] Giáo viên giao bài và xem kết quả thật; admin xử lý báo cáo có audit log.
- [ ] Không có nút chính dẫn tới trang trống hay thông báo thành công giả.
- [ ] Giao diện desktop/mobile không tràn ngang ở luồng học chính, thao tác bàn phím được.

### Kiểm thử trọng tâm

Unit/integration cho chấm bài, tính level, mở khóa, quyền sở hữu, transaction thưởng và state machine PvP. Kiểm tra đồng thời cho hai request nhận thưởng và nhiều người join chỗ cuối. E2E một luồng học và một trận hai tài khoản. Với concurrency phụ thuộc DB, kiểm tra trên MySQL thực dùng, không chỉ dựa vào database giả khác cơ chế khóa.

### Kịch bản thuyết trình

Giáo viên tạo lớp và giao chương → hai learner vào lớp → một learner học và đánh boss → xem EXP/mở khóa → cả hai tham gia PvP → chat lớp → giáo viên xem báo cáo → admin xử lý một báo cáo mẫu.

### Chạy dự án không Docker

`INSTRUCTION.md` phải hướng dẫn cài Java/Node/MySQL tương thích, tạo DB, thiết lập biến môi trường, chạy migration/seed, chạy server bằng Maven Wrapper và client bằng npm. Ghi lệnh cho PowerShell (`.\mvnw.cmd spring-boot:run`) và npm (`npm install`, `npm run dev`), cùng thư mục thực thi. Không bắt người dùng cài dịch vụ ngoài phạm vi đã chốt.
