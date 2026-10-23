# HỆ THỐNG NHIỆM VỤ HẰNG NGÀY (DAILY QUESTS) & CHUỖI HỌC LIÊN TỤC (STREAK 🔥)

**Dự án**: Grammar Quest — Trạm Ngữ Pháp Không Gian  
**Nhánh Git**: `hoangnam`  
**Tác giả**: Nguyen Ngoc Hoang Nam <namnguyen260805@gmail.com>  
**Ngày cập nhật**: 23/10/2026  

---

## 1. TỔNG QUAN TÍNH NĂNG

Hệ thống **Nhiệm vụ Hằng ngày (Daily Quests)** và **Chuỗi ngày học liên tục (Streak 🔥)** được xây dựng nhằm tạo động lực học tập thường nhật (Daily Habit Loop) cho học viên, kích thích quay lại học đều đặn mỗi ngày để nhận điểm kinh nghiệm (EXP) và gia tăng cấp độ phi hành gia.

### 1.1. Cơ chế Cân bằng Kinh tế EXP (Phương án 1: Cân bằng & Bền vững)
- **Công thức cấp độ hiện tại**:
  $$\text{Level} = \left\lfloor\frac{\text{totalXp}}{1000}\right\rfloor + 1, \quad \text{xpInLevel} = \text{totalXp} \pmod{1000}$$
- **Mức thưởng EXP**:
  - **Nhiệm vụ 1 (Dễ)**: **+30 EXP**
  - **Nhiệm vụ 2 (Trung bình)**: **+50 EXP**
  - **Nhiệm vụ 3 (Thử thách)**: **+70 EXP**
  - **Rương Tinh Tú Siêu Cấp (Hoàn thành 3/3 nhiệm vụ)**: **+100 EXP + Tăng Chuỗi Streak (+1 ngày)**
- **Tổng EXP tối đa mỗi ngày**: **250 EXP/ngày** (học viên chăm chỉ sẽ tăng 1 cấp sau mỗi 4 ngày).
- **Chu kỳ làm mới**: Tự động cấp phát 3 nhiệm vụ mới vào lúc **`00:00:00` hàng ngày**.

---

## 2. DANH MỤC NHIỆM VỤ MẪU (POOL 10 NHIỆM VỤ)

| Mã nhiệm vụ | Tầng | Tiêu đề | Mô tả | Loại mục tiêu | Mục tiêu | EXP | Icon |
| :--- | :---: | :--- | :--- | :--- | :---: | :---: | :---: |
| `PRACTICE_1` | EASY | Khởi động trạm không gian | Hoàn thành 1 bài luyện tập ngữ pháp bất kỳ | `PRACTICE_COUNT` | 1 bài | +30 | `BookOpen` |
| `CORRECT_5` | EASY | Tia chớp tri thức | Trả lời đúng 5 câu hỏi bất kỳ trong ngày | `CORRECT_COUNT` | 5 câu | +30 | `Zap` |
| `ARENA_PLAY_1` | EASY | Tinh thần đấu sĩ | Tham gia 1 trận đấu trường PvP | `ARENA_PLAY` | 1 trận | +30 | `Swords` |
| `CORRECT_15` | MEDIUM | Kỹ sư ngôn từ | Trả lời đúng tổng cộng 15 câu hỏi trong ngày | `CORRECT_COUNT` | 15 câu | +50 | `CheckCircle2` |
| `STREAK_CORRECT_5` | MEDIUM | Bắn phá chuẩn xác | Trả lời đúng liên tiếp 5 câu trong 1 lượt làm | `STREAK_CORRECT` | 5 câu | +50 | `Sparkles` |
| `BOSS_DAMAGE_100` | MEDIUM | Công phá giáp Boss | Làm tiêu hao tổng cộng 100 HP của Boss | `BOSS_DAMAGE` | 100 HP | +50 | `Heart` |
| `CLASS_ASSIGNMENT_1` | MEDIUM | Bài tập chuyên cần | Hoàn thành 1 bài tập do giáo viên giao trong lớp | `CLASS_ASSIGNMENT` | 1 bài | +50 | `School` |
| `DEFEAT_BOSS_1` | HARD | Hạ gục Robot canh trạm | Đánh bại 1 Boss bài học hoặc Boss chương | `BOSS_WIN` | 1 boss | +70 | `Target` |
| `ARENA_WIN_1` | HARD | Vinh quang Đấu trường | Giành chiến thắng trong 1 trận đấu trường PvP | `ARENA_WIN` | 1 trận | +70 | `Trophy` |
| `PERFECT_PRACTICE_1` | HARD | Tuyệt đối 100% | Đạt điểm tuyệt đối 10/10 trong 1 lượt luyện tập | `PERFECT_PRACTICE` | 1 lần | +70 | `Sparkles` |

---

## 3. CƠ SỞ DỮ LIỆU & KIẾN TRÚC BACKEND

### 3.1. Flyway Migration `V20__daily_quests.sql`
- Bảng `daily_quests`: Lưu định nghĩa danh mục nhiệm vụ, độ khó `tier`, mục tiêu `target_type`, số lượng `target_count`, `reward_xp`.
- Bảng `user_daily_quests`: Lưu tiến độ thực hiện theo ngày của từng học viên (`quest_date`, `current_progress`, `completed`, `claimed`, `claimed_at`).
- Bảng `user_quest_streaks`: Lưu chuỗi ngày học liên tục (`current_streak`, `longest_streak`, `last_completed_date`, `milestone_claimed_date`).
- Chống nhận trùng EXP: Ghi nhận vào `xp_ledger` với `reward_key = "DAILY_QUEST:" + userDailyQuestId` và `"DAILY_MILESTONE:" + todayDate`.

### 3.2. Service & Event Hooks
- **`DailyQuestService.java`**:
  - `ensureTodayQuests(userId, today)`: Tự động bốc ngẫu nhiên 3 nhiệm vụ từ 3 tầng (EASY, MEDIUM, HARD).
  - `recordProgress(userId, targetType, increment)`: Tự động cập nhật tiến độ khi học viên thực hiện các hành vi học tập tương ứng.
  - `claimQuestReward(username, userQuestId)`: Nhận EXP nhiệm vụ đơn lẻ an toàn với Pessimistic Lock.
  - `claimDailyMilestone(username)`: Nhận 100 EXP Rương Tinh Tú và gia hạn Streak ngày.
- **Tích hợp các luồng trong hệ thống**:
  - **`LearningService.java`**: Cập nhật `CORRECT_COUNT`, `STREAK_CORRECT` (chuỗi 5 câu đúng), `BOSS_DAMAGE`, `PRACTICE_COUNT`, `PERFECT_PRACTICE`, `BOSS_WIN`, `CLASS_ASSIGNMENT`.
  - **`ArenaController.java`**: Cập nhật `ARENA_PLAY` khi kết thúc trận và `ARENA_WIN` cho người chiến thắng.
  - **`LiveExamService.java`**: Cập nhật `CLASS_ASSIGNMENT` và `CORRECT_COUNT` khi học sinh nộp bài kiểm tra trực tiếp.

### 3.3. REST API Endpoints
- `GET /api/v1/daily-quests`: Lấy danh sách nhiệm vụ hôm nay, tiến độ rương và chuỗi ngày.
- `GET /api/v1/daily-quests/streak`: Lấy thông tin chuỗi ngày hiện tại.
- `POST /api/v1/daily-quests/{id}/claim`: Nhận thưởng EXP của một nhiệm vụ đã hoàn thành.
- `POST /api/v1/daily-quests/claim-milestone`: Mở Rương Tinh Tú (+100 EXP & +1 ngày Streak) khi hoàn tất 3/3 nhiệm vụ.

---

## 4. GIAO DIỆN NGƯỜI DÙNG (FRONTEND UX / UI)

### 4.1. Widget Nhiệm vụ Hàng ngày (`DailyQuestsWidget.tsx`)
- Đặt tại vị trí trung tâm trang **Tổng quan (`Dashboard`)**, ngay dưới thẻ Hành trình hiện tại (`Hero card`).
- Hiển thị thanh tiến độ trực quan `X / Y`, thẻ độ khó màu sắc (Dễ - Xanh lá, Trung bình - Vàng hổ phách, Thử thách - Đỏ hồng).
- Nút bấm **"Nhận +... EXP 🎁"** với hiệu ứng phát sáng chuyển động (*pulse glow*). Khi bấm, lập tức cập nhật EXP và Cấp độ người dùng trên toàn bộ trang mà không cần tải lại trang.
- Khối **Rương Tinh Tú Ngày**: Hiển thị trạng thái mở khóa rương đặc biệt và phần thưởng siêu cấp khi đủ 3/3 nhiệm vụ.

### 4.2. Huy hiệu Ngọn lửa Streak (🔥)
- Hiển thị trên thanh điều hướng đầu trang (`topbar-actions`) cạnh huy hiệu Cấp độ phi hành gia.
- Hiển thị thẻ thống kê chi tiết trong trang **Hồ sơ phi hành gia (`ProfilePage`)** gồm: *Chuỗi ngày hiện tại*, *Kỷ lục chuỗi ngày dài nhất*, và trạng thái hoàn thành hôm nay.

---

## 5. KIỂM THỬ & XÁC NHẬN (VERIFICATION)
- **Unit Test Backend**: 4 bài kiểm thử trong `DailyQuestServiceTest.java` và toàn bộ 91 bài kiểm thử hệ thống đều vượt qua 100% (`BUILD SUCCESS`).
- **Build Frontend**: Chạy `npm run build` thành công xuất sắc với 0 lỗi cảnh báo TypeScript.
