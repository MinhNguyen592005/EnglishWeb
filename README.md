# Grammar Quest

**Grammar Quest** là website học ngữ pháp tiếng Anh bằng tiếng Việt, lấy cảm hứng từ hành trình khám phá không gian. Người học đi theo lộ trình bài học, luyện tập, vượt thử thách và thi đấu trực tuyến. Hệ thống còn có khu vực quản lý lớp học cho giáo viên và trang quản trị cho quản trị viên.

## Chức năng chính

- **Người học:** đăng ký, đăng nhập, học theo lộ trình, làm bài luyện tập và thử thách, xem điểm kinh nghiệm và lịch sử học tập.
- **Giáo viên:** quản lý lớp, thành viên, bài giao, câu hỏi và theo dõi kết quả học tập.
- **Quản trị viên:** quản lý tài khoản, nội dung chung, báo cáo vi phạm và nhật ký hệ thống.
- **Đấu trường:** hai người chơi tham gia một trận, trao đổi qua chat và nhận cập nhật theo thời gian thực.

## Công nghệ sử dụng

| Thành phần | Công nghệ |
| --- | --- |
| Giao diện | React 19, TypeScript, Vite 7, React Router, Tailwind CSS 4, Lucide |
| Máy chủ | Java 21, Spring Boot 3.5.7, Spring Security, Spring Data JPA |
| Dữ liệu | MySQL 8, Flyway |
| Giao tiếp | REST API, WebSocket/STOMP |
| Công cụ xây dựng | npm, Maven Wrapper |

## Cấu trúc thư mục

```text
EnglishWeb/
├── source/
│   ├── client/       # Ứng dụng React và cấu hình Vite
│   ├── server/       # Ứng dụng Spring Boot, API và migration Flyway
│   └── common/       # Tài liệu giao tiếp và schema dùng chung
├── statics/
│   ├── dataset/      # Tài liệu về dữ liệu mẫu
│   ├── results/      # Ảnh kết quả và ảnh kiểm thử
│   └── ui/           # Tài liệu về giao diện
├── UI_mau/           # Ảnh tham khảo giao diện
├── report/           # Bản thảo báo cáo
├── README.md         # Giới thiệu và hướng dẫn chạy nhanh
└── INSTRUCTION.md    # Hướng dẫn cài đặt, cấu hình chi tiết
```

## Chạy dự án trên Windows

**Yêu cầu:** Java 21, Node.js 22, npm 10 và MySQL 8 đang chạy. Dự án đã có Maven Wrapper nên không cần cài Maven riêng.

1. Tạo database MySQL (thực hiện một lần bằng tài khoản có quyền tạo database):

   ```sql
   CREATE DATABASE IF NOT EXISTS grammar_quest
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. Tạo cấu hình máy chủ từ thư mục gốc dự án:

   ```powershell
   Copy-Item source/server/env.example.ps1 source/server/.env.local.ps1
   ```

   Mở `source/server/.env.local.ps1` và điền `DB_USERNAME`, `DB_PASSWORD` của tài khoản MySQL có quyền trên database `grammar_quest`. Điều chỉnh host, cổng hoặc tên database nếu máy của bạn dùng cấu hình khác. Không đưa file chứa mật khẩu này lên GitHub.

3. Mở PowerShell thứ nhất và chạy máy chủ:

   ```powershell
   cd source/server
   .\run-local.ps1
   ```

4. Mở PowerShell thứ hai tại thư mục gốc dự án và chạy giao diện:

   ```powershell
   cd source/client
   npm ci
   npm run dev
   ```

5. Mở [http://127.0.0.1:5173](http://127.0.0.1:5173) trong trình duyệt. Cổng mặc định của máy chủ là `8080`; Vite chuyển tiếp yêu cầu `/api` và `/ws` đến máy chủ.

Chi tiết về tài khoản demo, kiểm thử và xử lý lỗi nằm trong [INSTRUCTION.md](INSTRUCTION.md).

## Tài liệu dự án

- [Đặc tả dự án](PROJECT_SPEC.md)
- [Kiến trúc](ARCHITECTURE.md)
- [Giao thức và API](PROTOCOL.md)
- [Thiết kế giao diện](UI.md)
- [Tiến độ triển khai](PROGRESS.md)

## Chủ sở hữu và mã nguồn

- **Chủ sở hữu:** Nguyễn Quang Minh
- **GitHub:** [MinhNguyen592005/EnglishWeb](https://github.com/MinhNguyen592005/EnglishWeb)
