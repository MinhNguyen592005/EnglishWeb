# Grammar Quest WebSocket/STOMP

Endpoint: `/ws` (`v12.stomp`), dùng cookie phiên đăng nhập. Chỉ origin được cấu hình bởi `app.allowed-origin` được phép kết nối. Client subscribe `/user/queue/arena`, `/user/queue/classes`, `/user/queue/actions`; server từ chối destination khác.

## Gửi hành động

`SEND /app/arena/action` với JSON gồm `requestId` (UUID), `action` và trường theo hành động:

| action | Trường bắt buộc | Kết quả xác nhận |
| --- | --- | --- |
| `CREATE` | — | snapshot phòng |
| `JOIN` | `code` | snapshot phòng |
| `READY` | `roomId`, `ready` | snapshot phòng |
| `START` | `roomId` | snapshot phòng |
| `ANSWER` | `roomId`, `roundNo`, `option` | snapshot phòng |
| `LEAVE` | `roomId` | snapshot phòng |
| `CHAT` | `roomId`, `body` | tin nhắn mới |

`SEND /app/classes/message` với `{requestId,classId,body}` trả tin nhắn mới.

Server gửi xác nhận trên `/user/queue/actions`: `{requestId,ok:true,data}` hoặc `{requestId,ok:false,code,message}`. Một tài khoản có thể mở nhiều phiên; client chỉ xử lý xác nhận có `requestId` đang chờ. Thông báo thay đổi trên `/user/queue/arena` có `{roomId}`, trên `/user/queue/classes` có `{classId}`. Client lấy snapshot mới qua REST; snapshot phòng có `stateVersion` để bỏ qua phản hồi cũ. Khi socket chưa kết nối, client dùng REST tương ứng với CSRF token.

Các hành động vẫn được kiểm tra quyền sở hữu phòng/lớp và trạng thái tài khoản ở server. Không gửi đáp án đúng của vòng PvP đang mở. STOMP không cho subscribe kênh phòng của người khác; thông báo chỉ được gửi tới hàng đợi riêng của người tham gia.
