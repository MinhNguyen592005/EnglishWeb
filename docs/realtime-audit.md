# Rà soát realtime — 29/10/2026

## Cập nhật triển khai

Các phát hiện bên dưới ghi lại trạng thái trước khi sửa. Đã bổ sung:

- `CLASS_LIST`/`CLASS_OPEN`, nhận cập nhật và hủy watch khi rời trang; đăng ký lại khi reconnect.
- `DATA_INVALIDATED` qua WebSocket sau REST mutation thành công và các lệnh socket thay đổi dữ liệu. Thông báo gộp theo nhịp 500 ms, không chứa dữ liệu nghiệp vụ; các API đọc tiếp tục kiểm tra quyền như trước.
- `useRealtimeRefresh` tải lại dữ liệu ở các màn lớp, bảng điểm, modal học sinh, kết quả học viên, câu hỏi, học liệu, chương trình, hồ sơ, nhiệm vụ, quản trị, lý thuyết, roadmap, luyện tập và PvP. Đồng bộ lại khi socket kết nối lại, không remount biểu mẫu.
- Thay đổi nhiệm vụ và trang bị cá nhân qua HTTP giới hạn thông báo theo tài khoản. Thay đổi dữ liệu chung gửi tín hiệu cho các phiên đang mở; đây là cơ chế invalidation rộng, chưa tối ưu lọc theo từng lớp/chủ đề. Việc cập nhật tiếp tục dùng API HTTP đọc dữ liệu ở các màn vốn dùng HTTP.
- Giữ các snapshot/polling dự phòng đã có của kiểm tra trực tiếp; không chuyển toàn bộ HTTP sang socket.

Kiểm chứng: build frontend; bộ test Maven; test trình duyệt với HTTP/WebSocket giả lập xác nhận modal cập nhật điểm khi đang mở, danh sách lớp nhận push, vị trí modal, giữ bản nháp và đăng ký lại sau reconnect. Chưa xác minh toàn bộ luồng bằng hai tài khoản trên server/database thật. Modal kết quả vẫn chỉ gồm bài tập, không thay đổi phạm vi sang kiểm tra trực tiếp trong lần sửa realtime.

Phạm vi: các route trong `source/client/src/main.tsx`, component/context liên quan, API HTTP và handler WebSocket server. Kiểm tra tĩnh mã nguồn, chưa thử hai phiên trình duyệt đồng thời. Chưa thay đổi chức năng ứng dụng.

## Các luồng thiếu realtime

| Luồng | Bằng chứng trong mã nguồn | Kết quả |
| --- | --- | --- |
| Danh sách lớp | `ClassesPage`, `ClassroomPages.tsx`: `api.classrooms()` khi mount; không gửi `CLASS_LIST` | Không tự nhận thay đổi lớp từ phiên khác |
| Chi tiết lớp, thành viên, tổng quan, chat | `ClassDetailPage`: HTTP và listener `CLASS_*`, không gửi `CLASS_OPEN` | Có listener nhưng thiếu đăng ký watch nên chưa có đường cập nhật đầy đủ |
| Bảng điểm lớp | HTTP `assignmentResults()` khi vào tab; không gửi `CLASS_RESULTS` | Chưa tự cập nhật khi học sinh nộp |
| Modal học sinh | `StudentClassResultsDialog.tsx`: HTTP cho từng bài khi mở; không subscribe | Chưa có subscription kết quả; chỉ gồm bài tập, chưa có kiểm tra trực tiếp |
| Tạo/gia nhập/đổi tên lớp, xóa thành viên, giao/sửa/bắt đầu bài tập | HTTP trong `ClassroomPages`, `MaterialDeliveryForm`, `TeacherAssignmentDialog`, `LearnerClasswork` | Trang thao tác tự refresh/chuyển trang; phiên khác cần watch lớp đang thiếu |
| Ngân hàng câu hỏi | `TeacherQuestionsPage.tsx`: HTTP, reload sau thao tác | Không subscribe thay đổi từ phiên khác; dữ liệu lớp/bài học trong bộ chọn cũng tải ban đầu |
| Quản lý chương trình giáo viên | `TeacherCurriculumPage.tsx`: HTTP | Trang quản lý không subscribe; một số màn học viên có `CURRICULUM_CHANGED` riêng |
| Học liệu và bộ chọn học liệu | HTTP và `teacherMaterialEvents.ts`, focus/visibility/storage | Sự kiện trình duyệt/localStorage không phải đồng bộ server giữa thiết bị |
| Thống kê hồ sơ giáo viên | `OtherPages.tsx`: `teacherOverview()` qua HTTP | Chưa có watch như dashboard giáo viên |
| Lịch sử hồ sơ học viên | `OtherPages.tsx`: `history()` qua HTTP | Lịch sử không subscribe; thông tin tài khoản có socket riêng |
| Nhiệm vụ ngày/nhận thưởng/đổi nhiệm vụ | `DailyQuestsContext.tsx`: HTTP, refresh theo route/focus/storage/thao tác | Chưa subscribe tiến độ nhiệm vụ từ server |
| Danh sách tài khoản quản trị | `AdminPage.tsx`: `adminUsers()` HTTP | Presence có socket nhưng danh sách tài khoản không có watch tương ứng |
| Nhật ký quản trị | `AdminPage.tsx`: `adminAudit()` HTTP khi đổi tab | Không tự nhận nhật ký mới |
| Khung/huy hiệu PvP | `ArenaPage.tsx`: `arenaCosmetics()` HTTP | Không có watch riêng cho danh mục và trạng thái mở khóa |

`TeacherMaterialsPage.tsx` tồn tại nhưng chưa được gắn route trực tiếp trong `main.tsx` hiện tại.

## Lưu ý quan trọng về lớp học

Server trong `SystemSocketHandler.java` chỉ cấp `ClassWatch` sau `CLASS_LIST`, `CLASS_OPEN`, `CLASS_RESULTS`, `CLASS_CLOSE_RESULTS`. Client hiện lắng nghe nhưng không gửi các lệnh đăng ký đó. Nhãn kết nối socket không chứng minh dữ liệu lớp đang được theo dõi.

`RealtimeNotifier.classroom()` gửi STOMP `/queue/classes`, trong khi client hiện chỉ mở native WebSocket hệ thống, không có client STOMP đăng ký queue đó. Không thể dựa vào thông báo STOMP để kết luận chat/lớp hiện đã realtime.

Server hiện lưu một `ClassWatch` cho mỗi socket session, với một `assignmentId` tùy chọn. Khi bổ sung realtime bảng điểm/modal cần tránh nhiều component ghi đè watch của nhau.

## Có socket nhưng chưa đồng nghĩa tự cập nhật toàn bộ

- Kiểm tra trực tiếp dùng `EXAM_*` và `EXAM_UPDATE`; client còn gọi `EXAM_LIST`/`EXAM_SYNC` mỗi 5 giây. Danh sách kiểm tra vẫn phụ thuộc refresh định kỳ.
- Bảng xếp hạng PvP gửi `ARENA_LEADERBOARD` qua socket, chưa thấy listener push riêng cho mọi thay đổi xếp hạng của người chơi khác.
- Trang lý thuyết gọi `VIEW_LESSON_THEORY` qua socket nhưng không subscribe `CURRICULUM_CHANGED` như danh sách bài học; nội dung đang mở chưa tự phản ánh mọi sửa đổi.
- Server dùng `@Scheduled` so sánh snapshot rồi push: lớp/kiểm tra có tick 1 giây, workspace 2,5 giây. Có WebSocket nhưng không phải tất cả đều phát ngay từ sự kiện mutation.

## Các luồng chính đã có WebSocket

- Tài khoản, thay đổi quyền/khóa tài khoản, thông báo hệ thống/báo cáo: `SystemSocketContext.tsx`.
- Dashboard giáo viên: `TEACHER_OVERVIEW_WATCH`/`WORKSPACE_UPDATE`.
- Tổng quan/báo cáo quản trị: `ADMIN_REPORTS_WATCH`; giám sát hệ thống/presence có watch riêng.
- Hỗ trợ chat: `SUPPORT_*` và subscribe cập nhật.
- PvP: ghép trận, phòng đấu, thao tác, chat có socket.
- Placement, roadmap, luyện tập, nộp câu trả lời có lệnh socket; không suy ra mọi dữ liệu trên các màn này đều có push.
- Đăng ký/đăng nhập/đăng xuất/CSRF dùng HTTP là phù hợp cho thiết lập/kết thúc phiên, không cần chuyển chỉ để đạt realtime.

## Thứ tự xử lý đề xuất

1. Nối watch danh sách/chi tiết lớp, snapshot/update/error, reconnect và unwatch.
2. Thiết kế subscription cho kết quả học sinh và bảng điểm.
3. Thêm cập nhật nhiệm vụ ngày từ server.
4. Bổ sung watch hoặc invalidation cho câu hỏi, học liệu, chương trình giáo viên, tài khoản và nhật ký quản trị.
5. Kiểm thử hai phiên: gia nhập/đổi tên/xóa thành viên, chat, giao/sửa/nộp bài, modal đang mở khi học viên nộp, ngắt/kết nối lại mạng.
