# Grammar Quest

Ứng dụng web học ngữ pháp tiếng Anh dành cho người học Việt Nam, kết hợp tự học theo lộ trình, trò chơi hóa và quản lý lớp học. Dự án được phát triển theo nhóm. Nguồn ngữ pháp là **Longman English Grammar Practice for Intermediate Students**, **L. G. Alexander**, Longman, 1990; cách chia cấp độ, điều kiện mở khóa và phần thưởng là thiết kế của ứng dụng.

## Chức năng hiện có

- **Học viên:** đăng ký/đăng nhập, kiểm tra đầu vào, học và ôn tập, kiểm tra module/cấp độ, xem tiến độ và lịch sử, nhận EXP, nhiệm vụ hằng ngày và chuỗi ngày học.
- **Lộ trình chính:** 5 cấp độ, 28 module, 120 bài/chủ điểm. Tài khoản mới thuộc diện áp dụng làm 25 câu đầu vào, chọn từ ngân hàng 50 câu. Cấp độ bắt đầu được xét theo từng nhóm kiến thức nền tảng.
- **Điều kiện đạt:** ít nhất 80% câu đúng; bài học có 3 câu cần đúng 3/3. Kiểm tra module và cuối cấp độ dùng 10 câu, cần đúng ít nhất 8/10. Module mở theo tiến độ đã đạt.
- **Giáo viên:** quản lý lớp/thành viên, ngân hàng câu hỏi, nhập TXT, giao nhiệm vụ, tổ chức kiểm tra trực tiếp, theo dõi kết quả và xuất dữ liệu lớp.
- **Đấu trường:** tạo/vào phòng hoặc tìm trận, xác nhận, sẵn sàng, thi đấu hai người, Elo, bảng xếp hạng, vật phẩm trang trí và chat phòng.
- **Quản trị:** quản lý tài khoản/vai trò/khóa, kiểm duyệt nội dung, xử lý báo cáo, xem nhật ký, giám sát kết nối và cảnh báo hành vi.
- **Tương tác:** chat lớp, báo cáo tài khoản/tin nhắn và hội thoại hỗ trợ với hệ thống/quản trị viên.

Luồng luyện tập và thử thách boss của kho nội dung cũ vẫn được giữ cho các chức năng liên quan. Luồng này có dữ liệu và quy tắc riêng, không đồng nhất với lộ trình chính trong các bảng `study_*`.

## Công nghệ và kiến trúc

| Thành phần | Công nghệ trong dự án |
| --- | --- |
| Frontend | React 19.2, TypeScript 5.9, React Router 7, Vite 7.1, Tailwind CSS 4 |
| Backend | Java 21, Spring Boot 3.5.7, Spring Security, Spring Data JPA, JdbcTemplate |
| Dữ liệu | MySQL 8, Flyway; migration hiện có từ V1 đến V30 |
| API | HTTP/JSON tại `/api/v1` |
| Realtime chính | Raw WebSocket dùng chung tại `/api/ws-system` |
| Realtime tương thích | STOMP tại `/ws`; frontend hiện tại dùng socket chính ở trên |
| Xác thực | Cookie phiên đăng nhập và CSRF cho yêu cầu HTTP thay đổi trạng thái |

Frontend quản lý giao diện và dữ liệu nhập. Backend kiểm tra quyền, chấm bài, xét mở khóa và quyết định điểm/EXP. Lượt làm lưu snapshot câu hỏi; các cập nhật quan trọng sử dụng transaction và khóa dữ liệu để kiểm soát thao tác đồng thời/gửi lặp.

## Cấu trúc thư mục

```text
EnglishWeb-main/
├── source/
│   ├── client/                 # React, Vite và script kiểm tra frontend
│   ├── server/                 # Spring Boot, Maven Wrapper, migration và test Java
│   └── common/                 # Schema tham khảo cho lượt làm
├── scripts/
│   ├── clean.ps1               # Dọn đầu ra build/kiểm thử
│   └── study-course/           # Nội dung, khung lộ trình JSON và trình tạo migration
└── README.md                   # Hướng dẫn chạy hiện tại
```

## Chạy trên Windows

### 1. Chuẩn bị công cụ và database

Cần **Java 21**, **Node.js 22**, **npm 10**, **MySQL 8** và PowerShell. Đặt `JAVA_HOME` trỏ đúng JDK. Không cần cài Maven riêng vì dự án có Maven Wrapper.

```powershell
java -version
node --version
npm --version
```

Trong MySQL, tạo database bằng tài khoản có quyền phù hợp:

```sql
CREATE DATABASE IF NOT EXISTS grammar_quest
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Cấu hình và chạy backend

Từ thư mục gốc dự án, sao chép file mẫu một lần:

```powershell
Copy-Item source/server/env.example.ps1 source/server/.env.local.ps1
```

Mở `source/server/.env.local.ps1`, điền `DB_USERNAME`, `DB_PASSWORD` và điều chỉnh `DB_HOST`, `DB_PORT`, `DB_NAME` nếu cần. Tài khoản MySQL cần quyền trên database ứng dụng để Flyway tạo/cập nhật bảng. File local được Git bỏ qua; không ghi mật khẩu thật vào file mẫu.

Trong cửa sổ PowerShell thứ nhất:

```powershell
cd source/server
.\run-local.ps1
```

Script nạp `.env.local.ps1`, dùng profile `dev` nếu chưa đặt và khởi động Spring Boot ở cổng mặc định **8080**. Flyway áp dụng migration còn thiếu; Hibernate chỉ kiểm tra schema bằng `ddl-auto: validate`. Nếu chạy Maven trực tiếp, phải tự nạp cấu hình môi trường; Spring Boot không tự đọc file PowerShell này.

### 3. Chạy frontend

Trong cửa sổ PowerShell thứ hai, từ thư mục gốc:

```powershell
cd source/client
npm ci
npm run dev
```

Mở **http://127.0.0.1:5173**. Vite chuyển tiếp `/api` và `/ws`, bao gồm WebSocket, đến `http://localhost:8080`. Nếu cổng 5173 đã bận, xem URL thực tế Vite in ra và cập nhật origin backend tương ứng.

Để đổi địa chỉ backend của proxy, đặt biến môi trường trước khi chạy Vite:

```powershell
$env:VITE_SERVER_PROXY = 'http://localhost:8081'
npm run dev
```

`vite.config.ts` đọc biến này từ môi trường tiến trình. Chỉ tạo file `.env` chưa đủ để đổi proxy hiện tại vì cấu hình chưa dùng `loadEnv`. Frontend vẫn gọi API/socket cùng origin qua proxy.

### 4. Tài khoản demo

Đăng ký tại `/register` tạo tài khoản **LEARNER**. Để có các vai trò dùng thử trên database mới, thêm vào `.env.local.ps1` rồi chạy lại backend:

```powershell
$env:APP_SEED_DEMO = 'true'
$env:DEMO_PASSWORD = '<mật khẩu demo riêng>'
```

Mật khẩu cần ít nhất 8 ký tự và không vượt 72 byte UTF-8 để tương thích BCrypt. Seed chỉ chạy ở profile `dev` và tạo các tài khoản còn thiếu:

| Tài khoản | Vai trò | Trang chính |
| --- | --- | --- |
| `admin_demo` | ADMIN | `/admin` |
| `teacher_demo` | TEACHER | `/teacher` |
| `learner_one`, `learner_two` | LEARNER | `/dashboard` |

Mật khẩu là giá trị đã cấu hình lúc tạo. Seed không ghi đè tài khoản hoặc đổi mật khẩu đã tồn tại. Học viên demo không bị đánh dấu bắt buộc đầu vào như tài khoản mới đăng ký. Không bật seed khi triển khai chính thức.

### 5. Nhiều tài khoản và LAN

Để thử hai người dùng, dùng hai trình duyệt, hai browser profile hoặc một cửa sổ thường và một cửa sổ riêng tư. Hai tab cùng profile chia sẻ cookie, thường dùng cùng phiên đăng nhập.

`npm run dev` đã lắng nghe trên `0.0.0.0`. Với LAN, mở `http://<IP-máy-chạy-Vite>:5173` và thêm origin đó vào `CLIENT_ORIGIN` của backend. Nhiều origin phân cách bằng dấu phẩy. WebSocket cũng kiểm tra origin; proxy không thay thế yêu cầu cấu hình origin đúng. Nếu backend ở máy khác, đặt `VITE_SERVER_PROXY` đến máy đó. Chỉ mở các cổng firewall cần thiết cho mô hình chạy thực tế.

## Kiểm tra dự án

### Build và kiểm tra không cần MySQL

Trong `source/client`:

```powershell
npm run build
node scripts/check-api-session.mjs
node scripts/check-auth-recovery.mjs
```

Build kiểm tra TypeScript và tạo `dist/`. Script API kiểm tra cấp/làm mới CSRF và giới hạn thử lại. Script khôi phục đăng nhập tự phục vụ bản build trên cổng tạm, dùng Playwright và Edge headless với API giả lập; cần build trước khi chạy. Có thể chọn browser channel bằng `UI_BROWSER_CHANNEL` nếu đã cài trình duyệt tương ứng.

Trong `source/server`:

```powershell
.\mvnw.cmd test
```

Test mặc định chủ yếu kiểm tra nghiệp vụ bằng unit test/mock. **Lệnh thành công không có nghĩa mọi test tích hợp đã chạy**: các nhóm tích hợp bên dưới bị bỏ qua nếu chưa bật.

### Test tích hợp có MySQL thật

| Biến bật | Nhóm kiểm tra |
| --- | --- |
| `RUN_FULL_REALTIME_TEST=true` | Spring Boot, phiên đăng nhập và WebSocket |
| `RUN_CLASSROOM_DB_TEST=true` | Lớp học/socket với database |
| `RUN_LIVE_EXAM_DB_TEST=true` | Đồng thời trong kiểm tra trực tiếp |
| `RUN_PLACEMENT_TEST=true` | Kiểm tra đầu vào |
| `RUN_STUDY_TEST=true` | Lộ trình học |
| `RUN_BROWSER_REALTIME_TEST=true` | Trình duyệt trong nhóm full realtime; cần bật nhóm đó trước |

Nhóm full realtime, lớp học và kiểm tra trực tiếp đọc `EXAM_TEST_DB_USER`/`EXAM_TEST_DB_PASSWORD`. Nhóm đầu vào và lộ trình đọc `DB_USERNAME`/`DB_PASSWORD`. Các nhóm này tạo schema tạm riêng và xóa khi kết thúc; tài khoản test cần quyền tạo/xóa schema. Chỉ dùng môi trường MySQL thử nghiệm phù hợp và không đưa thông tin truy cập vào Git.

Ví dụ trong `source/server`, sau khi đặt thông tin truy cập môi trường test:

```powershell
$env:RUN_STUDY_TEST = 'true'
.\mvnw.cmd '-Dtest=StudyRoadmapIntegrationTest' test
Remove-Item Env:RUN_STUDY_TEST
```

Các script kiểm tra giao diện khác nằm trong `source/client/scripts/`. Phần lớn script `check-*` dùng Vite ở cổng 5175 và API/socket giả lập. Một số script cũ gọi backend thật và ghi dữ liệu; đọc URL, tài khoản và yêu cầu ở đầu từng script trước khi chạy.

### Kiểm tra nội dung học

Nếu chỉnh nội dung, cần Python 3. Từ thư mục gốc:

```powershell
python scripts/study-course/build.py --check
python scripts/study-course/build-placement.py --check
python scripts/study-course/build-exams.py --check
```

Các lệnh kiểm tra dữ liệu nguồn và migration tương ứng, không kết nối database. Khung lộ trình nằm tại `scripts/study-course/content/outline.json`; các file `level1.txt` đến `level5.txt` chứa nội dung bài học, còn `exams.txt` chứa ngân hàng đề. Khi phát hành thay đổi nội dung, tạo migration mới với số phiên bản chưa dùng; không sửa migration đã áp dụng. Trình biên dịch giữ nguyên phần đầu của migration lịch sử để kiểm tra dữ liệu cũ, nhưng không còn đọc file Markdown.

## Dọn đầu ra sinh tự động

Sau khi dừng backend/build đang chạy, từ thư mục gốc:

```powershell
powershell -NoProfile -File scripts/clean.ps1 -WhatIf
powershell -NoProfile -File scripts/clean.ps1
```

Mặc định dọn `source/client/dist`, cache TypeScript, `source/server/target`, log kiểm thử đã biết và cache Python của trình biên dịch. Thêm `-IncludeTestArtifacts` để dọn cả `source/client/artifacts` chứa ảnh/fixture kiểm thử.

Script giữ mã nguồn, dependency đã cài, cấu hình local và dữ liệu MySQL. Đầu ra có thể tạo lại bằng các lệnh tương ứng. Build, dependency, artifact, log và cache được Git bỏ qua.

## Xử lý lỗi thường gặp

- **Không kết nối MySQL:** kiểm tra dịch vụ, host/cổng, database và quyền tài khoản trong `.env.local.ps1`.
- **Lỗi Flyway/Hibernate:** xem migration/schema bị lỗi; bổ sung migration mới thay vì sửa file đã áp dụng.
- **Frontend không gọi được API:** kiểm tra backend và `VITE_SERVER_PROXY`; mở `/api/v1/auth/csrf` qua cổng frontend để kiểm tra proxy.
- **403 khi thao tác:** kiểm tra quyền tài khoản. Frontend chỉ làm mới token và thử lại một lần khi nhận `CSRF_INVALID`; lỗi phân quyền không được tự gửi lại.
- **Socket không kết nối:** kiểm tra phiên đăng nhập, origin, proxy `/api` và `/api/ws-system`. Với LAN/cổng khác, cập nhật `CLIENT_ORIGIN` và khởi động lại backend.
- **Đổi cấu hình chưa có hiệu lực:** khởi động lại tiến trình tương ứng để nhận biến môi trường mới.

## Giới hạn

Dự án tập trung vào ngữ pháp, không phải khóa học đủ bốn kỹ năng hoặc hệ thống cấp chứng chỉ. Đầu vào và mở khóa dựa trên luật, chưa phải mô hình học máy hay bài thi chuẩn hóa. Ghi chú viết vận dụng là hoạt động tự đối chiếu, không có AI chấm luận. Hàng đợi ghép trận và một số trạng thái realtime nằm trên bộ nhớ máy chủ; triển khai nhiều instance cần cơ chế đồng bộ bổ sung.
