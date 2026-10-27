# Merge giao diện và tính năng

- Giữ các chỉnh sửa giao diện hiện tại, API tổng quan lớp học và support chat.
- Ghép daily quest, nhận thưởng EXP, streak và nhập câu hỏi từ file `.txt` (4 dạng câu hỏi).
- Giữ các phần lộ trình học và placement có sẵn trong nhánh được merge.
- Dashboard dùng `DailyQuestsWidget` thay cho danh sách nhiệm vụ mẫu.

## Migration

Giữ nguyên `V19__support_thread_status.sql` của nhánh giao diện. Đổi migration tạo bảng study thành `V19_1__study_roadmap.sql` (Flyway version `19.1`), chạy sau support status và trước `V20__study_course_content.sql`. Không sửa nội dung SQL của migration này. `V24` và `V25` giữ nguyên.

Nếu database đã chạy `V19__study_roadmap.sql` từ nhánh khác, cần đối chiếu `flyway_schema_history` trước khi nâng cấp: version 19 trong database đó khác version 19 của nhánh giao diện. Không tự chạy `repair`, xóa lịch sử hoặc xóa database để bỏ qua xung đột. Các kiểm tra dưới đây dùng schema test riêng, không nâng cấp database ứng dụng hiện tại.

## Kiểm tra

- Frontend: `npm.cmd run build` thành công.
- Backend: `mvnw.cmd test` — 103 test, không lỗi; 19 test tích hợp bị bỏ qua theo cấu hình mặc định.
- Bật riêng `RUN_STUDY_TEST=true` và `RUN_PLACEMENT_TEST=true`: 4 test MySQL/Flyway/WebSocket thành công trên schema tạm. Có kiểm tra nâng cấp từ V20 và giữ dữ liệu học cũ.
- Parser: các file mẫu MCQ, điền từ, sửa lỗi, viết lại câu và hỗn hợp đều hợp lệ. Sửa nhận diện dòng đáp án bắt đầu bằng `=>`, `->`, `→`; kiểm tra cả ba cách viết và file rỗng.

Các conflict được đánh dấu resolved trong Git; chưa tạo merge commit.
