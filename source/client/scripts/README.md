# Script kiểm tra giao diện

Chạy từ `source/client`. Các script dùng Playwright và Microsoft Edge; script kiểm tra giao diện không được tính là kiểm thử toàn bộ backend.

| Nhóm | Mục đích |
| --- | --- |
| `check-role-views.mjs` | Giao diện theo vai trò, dùng API/socket giả lập |
| `check-support-chat.mjs` | Bong bóng chat, bot, Admin trả lời trực tiếp, badge tin mới, lịch sử và mobile; API/socket giả lập |
| `check-classroom-socket.mjs`, `check-arena-socket.mjs` | Luồng lớp học/PvP, dùng socket giả lập |
| `check-live-exam.mjs` | Giáo viên/học sinh làm kiểm tra, sửa đề và nhận cập nhật giả lập |
| `check-account-realtime.mjs` | Đồng bộ tài khoản và thông báo báo cáo giả lập |
| `check-notifications.mjs` | Chuông, trạng thái đã đọc, mở đúng bài trước khi làm, đồng bộ nhiều tab và mobile; dùng API/socket giả lập tại cổng 5173 (đổi bằng `NOTIFICATION_UI_URL`) |
| `check-real-backend.mjs` | Kết nối backend thật trong phiên `FullRealtimeIntegrationTest`, nhận fixture tạm do test Java tạo |
| `smoke-*.mjs`, `visual-*.mjs`, `offline-check.mjs` | Các kịch bản bổ trợ/được lưu từ những giai đoạn trước; xem URL, tài khoản và yêu cầu môi trường ở đầu từng script trước khi chạy |

Các script `check-*` dùng giao diện ở cổng 5175, trừ `check-real-backend.mjs` tự khởi động Vite cổng 5177. Đối chiếu URL trong script khi thay đổi cấu hình. API/socket giả lập cần được cập nhật nếu giao thức ứng dụng thay đổi.

Ảnh kiểm tra mới nằm trong `artifacts/role-views`; ảnh từ các script cũ trước đây trỏ tới `statics/results` nay nằm trong `artifacts/legacy`. Fixture backend thật nằm trong `artifacts/real-backend` và được integration test thu hồi. Cả thư mục `artifacts` đã được bỏ qua trong Git.

Lệnh build để kiểm tra TypeScript và đóng gói:

```powershell
npm run build
```

Dọn đầu ra build từ thư mục gốc bằng `powershell -NoProfile -File scripts/clean.ps1`. Thêm `-WhatIf` để xem trước hoặc `-IncludeTestArtifacts` để xóa thêm ảnh/fixture sinh tự động. Script không xóa dependency hoặc dữ liệu MySQL.
