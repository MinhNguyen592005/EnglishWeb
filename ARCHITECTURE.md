# Kiến trúc và trạng thái triển khai

```mermaid
flowchart LR
  A[Browser client 1<br/>React/Vite] -- HTTP/JSON<br/>Cookie session + CSRF --> S[Spring Boot application server]
  B[Browser client 2<br/>React/Vite] -- HTTP/JSON<br/>Cookie session + CSRF --> S
  S -- JDBC/MySQL protocol<br/>JPA + Flyway --> D[(MySQL grammar_quest)]
  A -. STOMP thông báo thay đổi .-> S
  B -. STOMP thông báo thay đổi .-> S
```

Backend monolith chia `auth`, `learning`, `classrooms`, `arena`, `admin`, `web` và `domain`. Browser giữ state form/chọn đáp án; server giữ điểm, luật boss, EXP và tiến độ. Mỗi attempt lưu snapshot câu hỏi/đáp án vào `attempt_items`. Sửa ngân hàng câu hỏi sau này không thay đổi lượt làm cũ.

`POST /attempts/{id}/answers` chạy transaction, khóa dòng attempt bằng pessimistic lock. Một câu chỉ nhận một đáp án; gửi lại cùng đáp án trả kết quả cũ, gửi đáp án khác trả `409`. Khi hoàn thành, server ghi kết quả và EXP trong cùng transaction. `xp_ledger` có unique `(user_id,reward_key)`; đồng thời khóa user khi quyết định thưởng, chống hai lượt boss cùng cấp thưởng lần đầu.

```mermaid
sequenceDiagram
  participant C as Browser client
  participant S as Spring Boot server
  participant D as MySQL server
  C->>S: POST /api/v1/attempts (kind, lessonId)
  S->>D: Kiểm tra mở khóa và số câu, lưu snapshot
  D-->>S: attemptId + dữ liệu câu hỏi
  S-->>C: Câu hỏi, không có đáp án bí mật
  C->>S: POST /attempts/{id}/answers
  S->>D: Khóa attempt, chấm và ghi đáp án
  alt Câu cuối
    S->>D: Ghi kết quả + reward key + EXP cùng transaction
  end
  S-->>C: Đúng/sai, HP, kết quả hợp lệ
```

Trạng thái attempt: `IN_PROGRESS` → `WON` hoặc `LOST`. `PRACTICE` kết thúc `WON` theo nghĩa hoàn thành, không cấp EXP. Boss bài học 5/5; boss chương 8/10. HP tối thiểu 0. Sau khi hoàn tất boss bài học, bài tiếp theo được mở theo dữ liệu server. Boss chương chỉ mở khi cả bốn boss bài đã thắng.

PvP và chat đã có REST API với dữ liệu MySQL; WebSocket/STOMP đẩy tín hiệu thay đổi đến kênh riêng, client lấy snapshot REST và hỏi định kỳ để dự phòng. PvP dùng khóa hàng phòng khi chấm vòng. Pause/reconnect và giao thức STOMP action đầy đủ **chưa triển khai**. Thiết kế hiện tại và giới hạn xem `PROTOCOL.md`.
