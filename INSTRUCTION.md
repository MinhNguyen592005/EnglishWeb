# Hướng dẫn cài đặt và chạy trên Windows

## 1. Yêu cầu

- Java 21, Node.js 22, npm 10, Maven 3.9 hoặc Maven Wrapper đi kèm.
- MySQL 8 đang chạy. Không cần cài lại MySQL, Docker hoặc đổi mật khẩu root.
- PowerShell và VS Code.

## 2. Database riêng

Dùng tài khoản MySQL có quyền tạo database để chạy **một lần**:

```sql
CREATE DATABASE IF NOT EXISTS grammar_quest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Tạo tài khoản ứng dụng có quyền trên riêng database này theo chính sách máy của bạn. Không dùng tài khoản root không mật khẩu. Migration Flyway tự chạy khi Spring Boot khởi động lần đầu; JPA chỉ `validate`, không tạo/xóa bảng.

Từ `source/server/`, sao chép file mẫu thành file local rồi mở bằng VS Code:

```powershell
Copy-Item env.example.ps1 .env.local.ps1
code .env.local.ps1
```

Điền `$env:DB_USERNAME` và `$env:DB_PASSWORD` trong **`.env.local.ps1`**, cùng host/cổng nếu khác mặc định. File này được `.gitignore` bỏ qua. `env.example.ps1` chỉ là mẫu, không đặt mật khẩu thật vào đó. `run-local.ps1` sẽ nạp file local và chạy Spring Boot; bản thân Spring Boot không tự đọc `.env`. Nếu đổi cổng server, đặt `VITE_SERVER_PROXY` ở client, ví dụ `http://localhost:8081`.

## 3. Chạy ứng dụng

Từ thư mục gốc:

```powershell
cd source/server
.\run-local.ps1
```

Cửa sổ PowerShell thứ hai:

```powershell
cd source/client
npm ci
npm run dev
```

Mở `http://127.0.0.1:5173`. Đăng ký một learner mới tại `/register` hoặc dùng tài khoản demo. Client proxy `/api` và `/ws` về server. Đấu trường và chat nhận thông báo STOMP qua `/ws`, rồi lấy dữ liệu qua REST; polling vẫn dự phòng khi WebSocket gián đoạn.

## 4. Seed tài khoản demo

Flyway nạp **10 bài học và 120 câu hỏi chung** bằng các migration `V2` và `V11`, mỗi migration chạy đúng một lần. Lộ trình có bốn chủ đề và ba mức độ. Tài khoản demo là tùy chọn; chỉ bật ở profile `dev`. Trong `.env.local.ps1`, thêm:

```powershell
$env:APP_SEED_DEMO = 'true'
$env:DEMO_PASSWORD = '<mật khẩu demo ít nhất 8 ký tự>'
```

Lần đầu tạo `admin_demo`, `teacher_demo`, `learner_one`, `learner_two` dùng mật khẩu demo bạn đặt. Lần sau không tạo trùng hoặc ghi đè mật khẩu; **đổi `DEMO_PASSWORD` sau khi tạo không đổi mật khẩu tài khoản đã có**. Mật khẩu demo hiện tại nằm trong `.env.local.ps1` local, không nằm trong source công khai. Đăng nhập `teacher_demo` để tạo lớp, giao bài, soạn câu hỏi; `admin_demo` để mở trang Quản trị; `learner_one` và `learner_two` để thử PvP. Không bật seed trong môi trường production.

## 5. Kiểm thử

```powershell
cd source/server
.\mvnw.cmd test
cd ..\client
npm run build
```

Các unit test kiểm tra boss/HP/EXP, hạn bài giao và guard database test. Kiểm thử tích hợp tự động kiểu Spring test vẫn cần database riêng, ví dụ `grammar_quest_test`, với profile `test`. Guard chặn `DB_TEST_NAME` không có hậu tố `_test`, trùng `DB_NAME`, hoặc `SPRING_DATASOURCE_URL` trỏ sai. Các script `smoke-community.mjs` và `visual-arena-match.mjs` **ghi dữ liệu demo** vào database đang cấu hình; chỉ chạy trong môi trường phát triển.

Để kiểm tra giao diện auth với Playwright và Edge đã cài trên Windows, chạy `npm run dev` ở cửa sổ client, rồi `node scripts/visual-check.mjs`. Script tạo ảnh trong `statics/results/`; không kiểm tra đăng nhập nếu server chưa chạy.

## 6. Hai client và LAN

Hai người dùng độc lập phải dùng **hai browser profile hoặc hai trình duyệt khác nhau**. Hai tab thường chia sẻ cookie phiên đăng nhập, nên không đại diện cho hai tài khoản. Trong `/arena`, người thứ nhất tạo phòng và gửi mã cho người thứ hai; cả hai có thể chat khi chờ, chọn sẵn sàng, chủ phòng bắt đầu, rồi tiếp tục chat trong trận. Tin nhắn lưu trên MySQL và chỉ hai người trong phòng xem được. WebSocket báo thay đổi ngay; browser cũng hỏi server định kỳ để phục hồi trạng thái.

Để truy cập từ máy khác cùng LAN, chạy Vite với host `0.0.0.0` (script `npm run dev` đã cấu hình), mở `http://<IP-LAN>:5173` trên máy thứ hai. Đặt `$env:CLIENT_ORIGIN = 'http://<IP-LAN>:5173'` nếu browser gọi server trực tiếp; qua Vite proxy, browser chỉ gọi host client. Mở firewall cho cổng `5173` và `8080` khi cần, chỉ trong mạng tin cậy. Khi server và client ở hai máy khác nhau, đặt `VITE_SERVER_PROXY` tới địa chỉ LAN của máy chạy Spring Boot.

## 7. Xử lý lỗi thường gặp

- **Access denied for user**: kiểm tra `DB_USERNAME`, `DB_PASSWORD` và quyền trên `grammar_quest`; không đổi mật khẩu root để xử lý.
- **Unknown database**: chạy lệnh `CREATE DATABASE IF NOT EXISTS` ở mục 2.
- **Port already in use**: đổi `SERVER_PORT` hoặc cổng Vite trong `vite.config.ts`, cập nhật proxy/origin tương ứng.
- **Client báo API lỗi**: xem server có chạy ở `8080`, kiểm tra `VITE_SERVER_PROXY`, mở `/api/v1/auth/csrf` qua cổng client.
- **403 khi POST**: tải lại trang để lấy CSRF token mới; giữ cookie phiên và header `X-XSRF-TOKEN`.
- **Đấu trường không cập nhật**: kiểm tra cả hai browser còn đăng nhập, server `8080` còn chạy, và Vite proxy `/ws`/`/api` trỏ đúng server.
