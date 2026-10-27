# Tiến độ Grammar Quest — 10/10/2026

## Đã triển khai

- React/TypeScript/Vite, Spring Boot 3.5.7/Java 21, Security/JPA/Flyway và MySQL với migration V1–V11.
- Học viên: xác thực session/CSRF, 10 cấp độ trong bốn chủ đề (các thì, câu điều kiện, bị động, mệnh đề quan hệ), 120 câu hỏi chung, ba mức độ, luyện tập, boss mỗi bài và boss cuối từng chủ đề, EXP, lịch sử học tập. Lộ trình có lọc theo mức độ, tiến độ theo chủ đề và điều kiện mở khóa từng cấp.
- Giáo viên: đăng nhập vào tổng quan giảng dạy, xem số lớp/học viên/bài đang mở/câu hỏi và tiến độ nộp bài; tạo/đổi tên lớp, quản lý thành viên, tạo/sửa/đóng/mở bài giao, xem kết quả và xuất CSV, chat lớp và báo cáo tin nhắn. Giáo viên có thể thêm/sửa/xuất bản hành tinh chủ đề, bài học, câu hỏi chung tại `/teacher/curriculum`; không tham gia lộ trình, luyện tập, bài giao hay đấu trường của học viên. Kho câu hỏi riêng hỗ trợ trắc nghiệm, điền từ, sửa lỗi và viết lại câu; ba dạng nhập chữ được chấm tự động theo đáp án mẫu sau khi chuẩn hóa chữ hoa, khoảng trắng và dấu câu cuối.
- Đấu trường: tạo/vào phòng, sẵn sàng, chat trước và trong trận, 10 vòng có hạn giờ, chấm điểm trên server, kết quả và lịch sử trận. Chat không hiển thị sau khi trận kết thúc. Khi một người chơi không gửi tín hiệu trong 8 giây, server tạm dừng vòng và chờ tối đa 30 giây để họ kết nối lại; hết hạn thì xử thua.
- Admin: chỉ dùng trang quản trị để quản lý tài khoản/vai trò/khóa, bảo vệ admin cuối cùng, tìm tài khoản, tạo/sửa bản nháp bài học với mức độ và câu hỏi chung, kiểm tra đủ 10 câu hỏi trước khi xuất bản bài, xử lý báo cáo chat lớp/đấu trường, cấm chat 24 giờ và audit log.
- STOMP có kênh riêng cho thông báo đấu trường/lớp và xác nhận hành động; client gửi thao tác phòng, đáp án và chat qua `/app/arena/action`, chat lớp qua `/app/classes/message`. REST dùng khi WebSocket chưa sẵn sàng; polling lấy snapshot dự phòng. Snapshot đấu trường có `stateVersion` để tránh ghi đè trạng thái cũ.

## Đã kiểm tra

- `source/server/.\mvnw.cmd -q test` và `source/client/npm run build`.
- `source/client/scripts/smoke-community.mjs`: quyền giáo viên/admin, lớp, bài giao, chat, báo cáo và trận hai người.
- `source/client/scripts/smoke-completion.mjs`: quản lý lớp/bài giao, bản nháp admin, câu điền từ, báo cáo đấu trường, tạm dừng/tiếp tục trận và lịch sử.
- `source/client/scripts/smoke-arena-timeout.mjs`: xác nhận người chơi không quay lại sau cửa sổ 30 giây bị xử thua.
- `source/client/scripts/visual-community.mjs`, `visual-arena-match.mjs`, `visual-teacher-text.mjs`, `smoke-live.mjs`: trình duyệt Edge kiểm tra giao diện giáo viên/admin, thao tác STOMP, chat trước/trong trận, ẩn chat ở kết quả và câu trả lời bằng văn bản.

## Phạm vi còn mở

- Admin có thể tiếp tục thêm bài và câu hỏi; ứng dụng từ chối xuất bản bài thiếu 10 câu hỏi chung đã xuất bản.
- Dạng nhập chữ được chấm theo đáp án mẫu đã chuẩn hóa; chưa có chấm ngữ nghĩa hoặc nhiều cách diễn đạt tương đương. Giáo viên cần viết đề với một đáp án rõ ràng.
- Các tính năng P1 trong `PROJECT_SPEC.md` như quên mật khẩu qua SMTP, lời mời PvP, huy hiệu, nhiệm vụ ngày và chỉnh cấu hình EXP chưa được triển khai. Bộ kiểm thử trình duyệt bao phủ luồng chính, chưa bao phủ mọi trạng thái lỗi hoặc tải đồng thời lớn.
