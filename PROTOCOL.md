# Giao tiếp client–server Grammar Quest

API JSON dùng tiền tố `/api/v1`. Browser gửi cookie phiên `JSESSIONID` và header `X-XSRF-TOKEN` với POST/PUT/PATCH. `GET /auth/csrf` cấp token. Server kiểm tra quyền từ database ở mỗi thao tác quản trị/lớp/đấu trường; client chỉ dùng vai trò để hiển thị menu. Lỗi có dạng `{code,message,fields,requestId}`.

| Nhóm | Endpoint chính | Quy tắc |
| --- | --- | --- |
| Auth | `/auth/csrf`, `/auth/register`, `/auth/login`, `/auth/me`, `/auth/logout` | Đăng ký công khai luôn là LEARNER. |
| Học tập | `/lessons`, `/lessons/{id}`, `/attempts`, `/attempts/{id}/answers` | Server chấm đáp án và lưu snapshot; client không nhận đáp án câu chưa làm. |
| Lớp | `/classes`, `/classes/join`, `/classes/{id}`, `/classes/{id}/assignments`, `/classes/{id}/messages` | Giáo viên sở hữu lớp tạo nhiệm vụ/xem kết quả; chỉ thành viên chat và xem lớp. |
| Câu hỏi giáo viên | `/teacher/overview`, `/teacher/questions`, `/teacher/questions/{id}`, `/teacher/questions/{id}/active` | Giáo viên chỉ sửa kho riêng. Câu riêng không xuất hiện trong bài học chung; bài giao có thể dùng câu trắc nghiệm hoặc nhập chữ. |
| PvP | `/arena/rooms`, `/arena/join`, `/arena/rooms/{id}`, `/arena/rooms/{id}/ready`, `/arena/rooms/{id}/start`, `/arena/rooms/{id}/answers`, `/arena/rooms/{id}/leave` | Phòng tối đa hai tài khoản, chủ phòng bắt đầu khi cả hai sẵn sàng. |
| Chat PvP | `GET/POST /arena/rooms/{id}/messages`, `POST /arena/rooms/{id}/messages/{messageId}/report` | Chỉ host và guest đọc/gửi/báo cáo; gửi khi chờ hoặc đang đấu. |
| Admin | `/admin/overview`, `/admin/users`, `/admin/reports`, `/admin/content`, `/admin/lessons`, `/admin/questions`, `/admin/audit` | Đọc role từ DB, lưu audit cho thay đổi; bài mới là bản nháp. |

## PvP hiện tại

Server đẩy thông báo STOMP đến `/user/queue/arena` và `/user/queue/classes` qua `/ws`. Client gửi hành động trận đến `/app/arena/action`, chat lớp đến `/app/classes/message`, rồi nhận xác nhận theo `requestId` trên `/user/queue/actions`; chỉ các đích SEND/SUBSCRIBE này được chấp nhận cho phiên đã xác thực. Khi kết nối chưa sẵn sàng, client dùng REST có CSRF. Sau thông báo thay đổi, client lấy snapshot REST; polling 1,2 giây cho PvP và 5 giây cho chat vẫn dự phòng. Snapshot có `stateVersion` để bỏ qua phản hồi cũ. Mỗi vòng có `deadlineAt` do server đặt, 20 giây sau khi bắt đầu vòng. Hành động ANSWER mang `{roomId,roundNo,option}`; server khóa phòng khi chấm, từ chối vòng cũ và chỉ nhận một đáp án/người/vòng. Cả hai trả lời hoặc hết giờ thì vòng đóng và điểm cập nhật. Snapshot vòng đang mở không chứa `correctOption`; `lastResult` chỉ xuất hiện sau khi vòng đóng. Hòa điểm được phân định bằng tổng thời gian trả lời đúng; bằng tiếp thì hòa. PvP không cộng EXP.

Chat lớp và chat phòng đấu hỏi danh sách tin nhắn mỗi 5 giây để dự phòng khi WebSocket gián đoạn. Giới hạn gửi: 1.000 ký tự/tin và 5 tin/10 giây/người/kênh; tin nhắn là văn bản thuần, React không render HTML. Chat phòng đấu chỉ cho người trong phòng xem và gửi khi phòng `WAITING` hoặc `IN_PROGRESS`; sau trận chat biến mất và server từ chối tin mới. `MUTE_24H` được kiểm tra khi gửi cả hai loại chat. Người tham gia có thể báo cáo tin nhắn lớp hoặc đấu trường; admin xử lý trong cùng danh sách báo cáo.

Trong trận, GET snapshot cập nhật thời điểm hoạt động của từng người chơi. Nếu một người không cập nhật trong 8 giây, server tạm dừng thời hạn câu hỏi và cho họ 30 giây kết nối lại. Khi họ trở lại, server cộng thời gian tạm dừng vào hạn trả lời; quá 30 giây thì xử thua. Trạng thái và báo cáo được lưu trong MySQL.
