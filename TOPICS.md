# Đề tài và phạm vi

**Grammar Quest** là đồ án lập trình mạng về mô hình Client–Server. Nhiều browser client gửi HTTP/JSON tới một application server Spring Boot. Server xác thực, chấm câu hỏi, quyết định EXP và lưu dữ liệu bền vững qua JDBC driver vào MySQL database server.

Chức năng đích: học ngữ pháp, luyện tập, boss, PvP hai người qua WebSocket/STOMP, lớp học, bài tập, chat, giáo viên và admin. Phiên hiện tại đã triển khai lộ trình 10 cấp trong bốn chủ đề, luồng học cá nhân, lớp học, giáo viên, admin và PvP bằng REST kết hợp thông báo STOMP; trạng thái pause/reconnect được ghi trong `PROGRESS.md`. Không mở rộng sang từ vựng, nghe/nói hoặc AI chấm bài.

HTTP/HTTPS là giao thức yêu cầu–phản hồi; JSON là định dạng dữ liệu; REST là cách tổ chức API. WebSocket/WSS là kết nối hai chiều, STOMP là quy ước nhắn tin trên kết nối đó. Spring Boot là server với browser, đồng thời là client của MySQL qua JDBC. Không có Java TCP Socket trực tiếp trong browser.

Phần báo cáo mạng nên trình bày thêm state machine PvP, xử lý đồng thời, idempotency, deadline theo đồng hồ server và reconnect sau khi các phần đó đã được triển khai và kiểm chứng.
