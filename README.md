# Grammar Quest

Website học ngữ pháp tiếng Anh bằng tiếng Việt, gồm lộ trình học, luyện tập, PvP, lớp học và quản trị. Frontend dùng React 19, TypeScript, Vite 7; backend dùng Java 21, Spring Boot 3.5.7; dữ liệu dùng MySQL 8 và Flyway. REST API và WebSocket cung cấp các cập nhật realtime.

## 1. Yêu cầu

- **JDK 21**, cấu hình `JAVA_HOME` và Java trong `PATH`.
- **Node.js 22.12 trở lên** và npm. Vite cũng hỗ trợ nhánh Node 20 từ phiên bản 20.19.
- **MySQL 8** đang chạy.
- PowerShell để dùng các script Windows có sẵn.

Dự án có Maven Wrapper nên không cần cài Maven riêng. Lần đầu cần Internet để tải dependency.

```powershell
java -version
node --version
npm --version
```

## 2. Tạo database

Trong MySQL Workbench hoặc MySQL CLI:

```sql
CREATE DATABASE IF NOT EXISTS grammar_quest
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Tài khoản MySQL cần quyền đọc, ghi và thay đổi schema trên database này. Khi backend khởi động, Flyway tự tạo bảng và dữ liệu bài học; không cần nhập thủ công các file migration. Không sửa migration đã áp dụng vào database.

## 3. Cấu hình backend

Mở PowerShell tại **thư mục gốc dự án**, nơi chứa README này. Nếu chưa có cấu hình cục bộ:

```powershell
Copy-Item source/server/env.example.ps1 source/server/.env.local.ps1
```

Nếu file đích đã tồn tại, sửa file hiện tại, tránh ghi đè cấu hình máy. Điền `source/server/.env.local.ps1`:

```powershell
$env:DB_HOST = 'localhost'
$env:DB_PORT = '3306'
$env:DB_NAME = 'grammar_quest'
$env:DB_USERNAME = 'ten_tai_khoan_mysql'
$env:DB_PASSWORD = 'mat_khau_mysql'
$env:SPRING_PROFILES_ACTIVE = 'dev'
$env:CLIENT_ORIGIN = 'http://127.0.0.1:5173'
```

`DB_NAME` phải trùng database đã tạo. Mật khẩu này là mật khẩu **MySQL**, khác mật khẩu website. File cấu hình cục bộ đã được bỏ qua trong Git.

Maven cũng tự nạp `.env.local.properties` trong `source/server` nếu tồn tại; có mẫu `env.example.properties`. Nếu kết nối sai database dù đã sửa `DB_*`, kiểm tra các thiết lập Spring trực tiếp trong file properties này. Tránh duy trì hai cấu hình trái nhau.

## 4. Chạy lần đầu và tạo tài khoản mẫu

### Terminal 1: backend

Từ thư mục gốc:

```powershell
.\scripts\start-demo.ps1
```

Script nạp `.env.local.ps1`, chạy profile `dev`, bật seed ba tài khoản và khởi động backend. Đợi log `Started GrammarQuestApplication`; cổng mặc định là **8080**.

| Vai trò | Tên đăng nhập | Mật khẩu | Trang chính |
| --- | --- | --- | --- |
| Admin | `admin1` | `12345678` | `/admin` |
| Giáo viên | `teacher1` | `12345678` | `/teacher` |
| Học sinh | `student1` | `12345678` | `/dashboard` |

Các tài khoản chỉ được tạo khi chưa tồn tại. Chạy lại **không đặt lại mật khẩu, vai trò hoặc tiến độ** của tài khoản đã có. Mật khẩu trong bảng áp dụng cho tài khoản mới seed và chưa đổi mật khẩu. Tài khoản `student1` mới seed được miễn kiểm tra đầu vào; học sinh tự đăng ký đi theo luồng kiểm tra đầu vào của ứng dụng.

Tài khoản này chỉ phục vụ phát triển/demo; không bật seed trên môi trường công khai.

### Terminal 2: frontend

Mở PowerShell khác tại thư mục gốc:

```powershell
cd source/client
npm ci
npm run dev -- --port 5173 --strictPort
```

Mở **http://127.0.0.1:5173** và đăng nhập bằng tài khoản trong bảng. Giữ cả hai terminal chạy trong lúc sử dụng. Vite proxy `/api` và `/ws` tới `http://localhost:8080`, gồm WebSocket `/api/ws-system`.

`--strictPort` giúp phát hiện cổng 5173 bị chiếm thay vì tự đổi cổng và làm lệch cấu hình origin.

## 5. Những lần chạy sau

Không cần tạo lại database hoặc cài lại dependency nếu chúng vẫn còn.

Terminal backend, bắt đầu từ thư mục gốc:

```powershell
cd source/server
.\run-local.ps1
```

Terminal frontend, bắt đầu từ thư mục gốc:

```powershell
cd source/client
npm run dev -- --port 5173 --strictPort
```

`run-local.ps1` nạp `.env.local.ps1` rồi gọi Maven Wrapper. Script này không tự bật seed ba tài khoản; tài khoản đã tạo vẫn lưu trong MySQL. Dùng `start-demo.ps1` nếu cần tạo các tài khoản mẫu còn thiếu.

Dừng tiến trình bằng **Ctrl+C** trong terminal tương ứng. Khi sửa Java/backend, dừng backend cũ rồi chạy lại để nạp mã mới. Chỉ chạy **một backend trên cùng cổng**.

### Chạy Maven trực tiếp

Trong Windows, từ thư mục gốc:

```powershell
cd source/server
. .\.env.local.ps1
.\mvnw.cmd spring-boot:run
```

Spring Boot không tự thực thi file PowerShell, nên cần dòng `. .\.env.local.ps1` khi dùng cách này. Trên Linux/macOS, xuất các biến môi trường tương ứng rồi chạy `./mvnw spring-boot:run` trong `source/server`.

### Đổi cổng

- Backend: đặt `$env:SERVER_PORT = '8081'` trong cấu hình PowerShell.
- Frontend: chạy `npm run dev -- --port 5174 --strictPort`.
- Nếu đổi cổng backend, đặt `$env:VITE_SERVER_PROXY = 'http://localhost:8081'` trong terminal frontend trước khi chạy Vite.
- Nếu đổi cổng frontend, đặt `CLIENT_ORIGIN` thành URL thực tế, ví dụ `http://127.0.0.1:5174`, rồi khởi động lại backend. Dùng thống nhất `localhost` hoặc `127.0.0.1` trong trình duyệt.

### Bộ tài khoản demo bổ sung — tùy chọn

Backend còn hỗ trợ `admin_demo`, `teacher_demo`, `learner_one`, `learner_two`. Để tạo bộ này, thêm vào `.env.local.ps1` rồi chạy `run-local.ps1` với profile `dev`:

```powershell
$env:APP_SEED_DEMO = 'true'
$env:DEMO_PASSWORD = 'mat_khau_demo_tu_chon'
```

Mật khẩu của tài khoản mới lấy từ `DEMO_PASSWORD`, tối thiểu 8 ký tự; không có mật khẩu cố định. Tài khoản đã tồn tại được giữ nguyên. `start-demo.ps1` chủ động tắt bộ seed bổ sung này và chỉ bật bộ ba tài khoản ở mục 4.

## 6. Chức năng theo vai trò

- **Học sinh:** tổng quan, lộ trình 5 level, bài học/luyện tập/kiểm tra, nhiệm vụ ngày, lớp học, bài giao, kiểm tra trực tiếp, PvP và thông báo.
- **Giáo viên:** lớp học, giao bài, kiểm tra trực tiếp, kho học liệu cá nhân, soạn module/bài học/câu hỏi và gửi duyệt tại `/teacher/journeys`.
- **Admin:** tài khoản, báo cáo vi phạm, hỗ trợ, nhật ký, duyệt và quản lý hành trình tại `/admin/journeys`.

Trong **Quản lý hành trình**, chọn level để thêm module hoặc soạn thay đổi; sửa tên/vị trí, thứ tự bài học, lý thuyết và câu hỏi; xem trước rồi lưu nháp/gửi duyệt. Admin trả lại hoặc xuất bản. Giáo viên xóa đề xuất chưa xuất bản của mình; admin xóa mọi đề xuất chưa xuất bản. Module đã xuất bản dùng lưu trữ để giữ tiến độ. Lịch sử cho phép tạo bản nháp khôi phục từ phiên bản trước.

## 7. Build và kiểm thử

Frontend, trong `source/client`:

```powershell
npm run build
```

Lệnh kiểm tra TypeScript và tạo `dist`. `npm run preview` chỉ xem bản frontend đã build; proxy hiện được cấu hình cho dev server. Triển khai bản build cần cấu hình reverse proxy/API routing và origin phù hợp; lệnh build không tự triển khai ứng dụng.

Backend, trong `source/server`:

```powershell
.\mvnw.cmd test
.\mvnw.cmd package -DskipTests
```

JAR nằm trong `source/server/target`. Khi chạy `java -jar`, cung cấp các biến môi trường/cấu hình Spring cần thiết; thiết lập `additional-location` của Maven plugin không tự áp dụng cho lệnh này.

Một số test tích hợp cần bật biến môi trường riêng. Ví dụ, tại `source/server`, chạy test MySQL cho lộ trình và quản lý hành trình:

```powershell
. .\.env.local.ps1
$env:RUN_STUDY_TEST = 'true'
.\mvnw.cmd test '-Dtest=StudyRoadmapIntegrationTest,StudyManagementValidationTest'
Remove-Item Env:RUN_STUDY_TEST
```

Test này tạo database tạm tên ngẫu nhiên và dọn sau khi chạy; tài khoản MySQL kiểm thử cần quyền tạo/xóa database tạm. Các test có điều kiện khác có thể được đánh dấu skipped khi chạy thông thường.

Kiểm thử UI quản lý hành trình dùng fixture HTTP/WebSocket, không sửa database ứng dụng. Cần Microsoft Edge và frontend đang chạy; tại `source/client`:

```powershell
$env:STUDY_MANAGEMENT_UI_BASE = 'http://127.0.0.1:5173'
node scripts/check-study-management.mjs
```

Các script khác trong `source/client/scripts` có URL và yêu cầu fixture/backend thật riêng; đọc đầu script trước khi chạy. Ảnh kiểm thử nằm trong `source/client/artifacts`.

## 8. Cấu trúc và dữ liệu bài học

```text
source/client/                 React, Vite và kiểm thử UI
source/server/                 Spring Boot, API, test, Maven Wrapper
source/server/src/main/resources/db/migration/
                               Migration schema và dữ liệu Flyway
source/common/                 Tài nguyên dùng chung (nếu có)
scripts/start-demo.ps1          Chạy backend, seed ba tài khoản mẫu
scripts/seed-demo-accounts.sql  Seed thủ công sau khi đã chạy migration
scripts/clean.ps1               Dọn đầu ra build/test
scripts/study-course/outline.json
                               Khung giáo trình ban đầu
scripts/study-course/content/   Nội dung nguồn giáo trình ban đầu
scripts/study-course/build.py   Kiểm tra/sinh migration dữ liệu
README.md                      Hướng dẫn chính
```

Không cần Python để chạy website. Để kiểm tra dữ liệu giáo trình gốc, dùng Python 3.9 trở lên tại thư mục gốc:

```powershell
python scripts/study-course/build.py --check
```

Script đối chiếu bộ nguồn với migration V20 đã lưu. Chỉnh sửa qua quản lý hành trình được lưu trong database, không tự ghi ngược bộ nguồn này. Khi phát hành dữ liệu nguồn mới, dùng số migration mới với `--migration`; không ghi đè migration đã chạy.

## 9. Dọn file sinh tự động

Sau khi dừng backend và các tiến trình build, chạy tại thư mục gốc:

```powershell
powershell -NoProfile -File scripts/clean.ps1 -WhatIf
powershell -NoProfile -File scripts/clean.ps1
```

Script dọn `dist`, cache TypeScript, `target` và các log kiểm thử được chỉ định. Thêm `-IncludeTestArtifacts` để dọn ảnh/fixture kiểm thử. Giữ nguyên mã nguồn, `node_modules`, cấu hình cục bộ và MySQL.

## 10. Xử lý lỗi thường gặp

| Hiện tượng | Cách kiểm tra |
| --- | --- |
| Maven `Process terminated with exit code: 1` | Đọc lỗi Spring **phía trên** dòng Maven. Đây chỉ là thông báo tiến trình đã dừng. |
| `Port 8080 was already in use` | Dừng đúng backend cũ trước khi chạy lại. Kiểm tra bằng `Get-NetTCPConnection -LocalPort 8080 -State Listen`. |
| MySQL `Access denied` hoặc không kết nối được | Kiểm tra dịch vụ MySQL, `DB_HOST`, `DB_PORT`, tên đăng nhập, mật khẩu và `.env.local.properties` nếu có. |
| `Unknown database` | Tạo database và đối chiếu `DB_NAME`. |
| Lỗi Flyway/schema | Đọc lỗi migration gốc. Không xóa lịch sử Flyway hoặc sửa checksum để bỏ qua lỗi. |
| PowerShell chặn script | Có thể chạy `powershell -ExecutionPolicy Bypass -File scripts/start-demo.ps1` từ thư mục gốc cho phiên chạy này. |
| Java không đúng phiên bản | Kiểm tra `java -version`, `JAVA_HOME` và `PATH`; dùng JDK 21. |
| Frontend mất API/WebSocket | Kiểm tra backend, `VITE_SERVER_PROXY`, URL/cổng frontend và `CLIENT_ORIGIN`. |
| Tài khoản mẫu không đăng nhập được | Chạy `start-demo.ps1` trên đúng database. Script không đặt lại mật khẩu tài khoản đã có. |
| Sửa backend nhưng vẫn báo thao tác cũ | Dừng backend cũ, chạy lại mã hiện tại và tải lại trang. |

Mã nguồn: [MinhNguyen592005/EnglishWeb](https://github.com/MinhNguyen592005/EnglishWeb).
