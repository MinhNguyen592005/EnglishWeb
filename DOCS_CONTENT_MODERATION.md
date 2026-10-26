# Kiểm duyệt nội dung

## Áp dụng

Khởi động lại backend để Flyway chạy `V30__content_moderation.sql`, sau đó dùng bản build frontend mới. Không chạy các API kiểm duyệt mới với schema trước V30.

Migration thêm trạng thái chặn của admin cho bài học và câu hỏi cũ, trạng thái xuất bản cho bài học lộ trình mới và bảng chặn câu luyện tập theo cặp bài/câu. Quyết định chặn câu riêng trước đây được khôi phục từ thao tác kiểm duyệt mới nhất trong audit; thao tác giáo viên tự lưu trữ không được coi là admin chặn.

## Hành vi

- Admin → Kiểm duyệt nội dung quản lý cả lộ trình 5 level, câu luyện tập trong bài, ngân hàng kiểm tra module/level và nội dung luyện tập/lớp học cũ.
- Trạng thái `teacher_active` là lựa chọn của giáo viên; `admin_blocked` là quyết định riêng của admin. Bật lại câu trong kho giáo viên không bỏ được quyết định chặn.
- Câu bị chặn hoặc giáo viên đã lưu trữ không được lấy vào bài giao mới, sao chép sang kho chung hoặc tạo đề mới từ kho riêng. Bản sao đã tạo trước khi chặn và đề nhập thủ công không tự động bị truy hồi theo văn bản giống nhau.
- Ẩn/xóa câu chung khiến ngân hàng bài cũ còn dưới 10 câu trắc nghiệm sẽ tự ẩn bài đó. Bổ sung câu và mở lại bài sau khi đủ ngân hàng.
- Câu luyện tập lộ trình bị chặn được loại khỏi lượt mới. Câu kiểm tra module/level bị ẩn được loại khỏi ngân hàng kiểm tra. Nếu không đủ số câu hoặc độ phủ module, backend vẫn từ chối tạo đề như trước.
- Bài lộ trình bị ẩn không thể mở bằng URL/socket trực tiếp và không được dùng cho lượt ôn tập mới. Bài vẫn có vị trí trong tiến độ bắt buộc; học viên chưa hoàn thành cần chờ admin mở lại. Không tự đánh dấu hoàn thành hoặc bỏ qua module.
- Các lượt làm đã tạo giữ nguyên snapshot, kết quả và lịch sử; kiểm duyệt không sửa điểm hay xóa tiến độ.
- Thay đổi phát `CURRICULUM_CHANGED` sau commit. Trang admin, kho giáo viên, chương trình giáo viên và lộ trình học cập nhật lại dữ liệu; khi kết nối lại cũng tải lại. Import nhiều câu chỉ phát một sự kiện cho cả đợt.
- Giữ cơ chế giáo viên xuất bản nội dung hiện có, chưa thêm hàng chờ admin duyệt trước.

## Kiểm tra

- Backend: `mvnw.cmd test` trong `source/server`. Các integration test MySQL yêu cầu cấu hình và biến môi trường opt-in như hướng dẫn ở từng test; không dùng database người dùng làm schema kiểm thử.
- Frontend: `npm run build` trong `source/client`.
- Trình duyệt: chạy Vite cổng 5175 rồi `node scripts/check-admin-moderation.mjs`. Script dùng API/WebSocket giả lập, kiểm tra hai admin và một giáo viên đồng bộ, ẩn/mở ba loại nội dung lộ trình và hiển thị mobile.
