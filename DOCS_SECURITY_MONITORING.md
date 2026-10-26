# Phát hiện spam và hoạt động bất thường

Trong **Quản trị → Tổng quan**, bảng **Phát hiện spam và hoạt động bất thường** hiển thị các sự kiện cần xem xét. Admin nhận thông báo WebSocket kể cả khi đang ở trang khác. Người dùng liên quan nhận cảnh báo trên các tab đang kết nối; người dùng khác không nhận thông tin của tài khoản này.

## Quy tắc hiện tại

| Dấu hiệu | Ngưỡng phát hiện | Khoảng thời gian |
| --- | ---: | ---: |
| Yêu cầu HTTP API dồn dập | 180 yêu cầu | 10 giây |
| Gói văn bản WebSocket dồn dập, gồm raw WS và STOMP | 80 gói | 10 giây |
| Gửi chat lớp, PvP, hỗ trợ | 8 lần gửi | 10 giây |
| Đăng nhập sai | 8 lần | 60 giây |
| Truy cập bị từ chối (HTTP 403 / lỗi quyền WebSocket) | 6 lần | 60 giây |
| JSON/lệnh raw WebSocket không hợp lệ | 10 lần | 60 giây |
| Đáp án vượt giới hạn hiện có | Trên 10 lần | 1 giây |

Cửa sổ trượt tính chung theo tài khoản đã xác thực, kể cả nhiều tab và các kênh được theo dõi. Đăng nhập sai chưa xác thực tính theo địa chỉ peer do server cung cấp, không lấy username trong JSON hay tin vào header IP tùy ý. Khi đi qua reverse proxy, peer có thể là proxy; không dùng tín hiệu này để tự khóa người dùng hoặc chặn IP chung.

Mỗi tài khoản/peer và mỗi quy tắc chỉ phát một cảnh báo trong 60 giây để tránh thông báo dồn dập. Bộ đếm nằm trong RAM, giới hạn 10.000 cửa sổ, tự dọn sau 3 phút không hoạt động. Bộ đếm được đặt lại khi server khởi động lại và độc lập giữa các instance server.

## Lưu trữ và xử lý

Migration Flyway `V27__security_incidents.sql` tự tạo bảng khi server khởi động. Mỗi cảnh báo lưu quy tắc, số sự kiện, thời lượng cửa sổ, tài khoản nếu có, thời điểm và quyết định xử lý. Không lưu mật khẩu, token hoặc toàn bộ nội dung gói tin. Cảnh báo đã lưu vẫn còn khi socket đóng hoặc server khởi động lại. Giao diện tải tối đa 200 cảnh báo, ưu tiên đang chờ, cập nhật khi có sự kiện và kiểm tra bổ sung mỗi 30 giây.

Admin có thể:

- **Cảnh cáo:** gửi lời nhắc đến các tab đang kết nối, lưu quyết định và ghi chú.
- **Khóa tài khoản:** khóa sau khi admin xem xét, thông báo và ngắt các raw socket liên quan. Các API HTTP cũng kiểm tra trạng thái tài khoản và vô hiệu phiên cũ. Không cho khóa admin đang hoạt động cuối cùng.
- **Bỏ qua / ghi chú:** đóng cảnh báo và lưu nhận xét. Cảnh báo chưa xác định tài khoản chỉ hỗ trợ lựa chọn này.

Các thao tác yêu cầu quyền admin hiện tại từ database, CSRF đối với HTTP và ghi vào nhật ký quản trị. Hai admin xử lý cùng một cảnh báo được tuần tự hóa bằng khóa database; quyết định đã xử lý không được ghi đè. Thông báo được phát sau khi giao dịch lưu thành công.

Đây là phát hiện dấu hiệu dựa trên tần suất, không phải bằng chứng chắc chắn về hack. Không tự khóa tài khoản theo điểm nghi ngờ. Các giới hạn đáp án/chat sẵn có vẫn hoạt động; chức năng mới bổ sung phát hiện, thông báo và hàng đợi xử lý. Nếu database lỗi khi lưu cảnh báo, server ghi lỗi vào log và tiếp tục luồng yêu cầu chính.

## Kiểm thử

Chạy `mvnw.cmd -o test` trong `source/server` và `npm run build` trong `source/client`. Các test mới kiểm tra biên cửa sổ, thời gian chống cảnh báo trùng, nhiều tab, giới hạn RAM, danh tính từ phiên server, quyền admin, bảo vệ admin cuối cùng, vô hiệu phiên tài khoản đã khóa và phạm vi người nhận WebSocket.
