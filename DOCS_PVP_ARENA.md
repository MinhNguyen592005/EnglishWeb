# HỆ THỐNG ĐẤU TRƯỜNG PVP 1V1, XẾP HẠNG ELO & PHẦN THƯỞNG COSMETIC

**Dự án**: Grammar Quest — Trạm Ngữ Pháp Không Gian
**Phiên bản**: PvP Ranked Arena (`V28__pvp_elo_ranks_cosmetics.sql`)
**Ngày cập nhật**: 24/10/2026

---

## 1. TỔNG QUAN HỆ THỐNG PVP

Hệ thống **Đấu Trường PvP 1v1 Thời Gian Thực (Real-time PvP Arena)** cho phép hai học viên thi đấu ngữ pháp trực tiếp thông qua kết nối **WebSocket (`/ws/system`)**. Hệ thống được thiết kế tách biệt hoàn toàn giữa **Điểm trả lời câu hỏi trong trận (Match Score)** và **Điểm xếp hạng kỹ năng (PvP ELO)**, đồng thời **không cộng điểm kinh nghiệm học tập (EXP = 0)** nhằm giữ nguyên sự công bằng giữa tiến độ học tập và trình độ thi đấu đối kháng.

### Nguyên tắc cốt lõi: Phân tách 2 loại điểm & Không cộng EXP học tập
| Loại điểm | Phạm vi sử dụng | Cách tính | Mục đích |
| :--- | :--- | :--- | :--- |
| **Điểm trận đấu (`Match Score`)** | Chỉ tồn tại trong 1 trận PvP (reset về `0` mỗi trận mới) | Đúng = `10 + bonus tốc độ (0..10)` điểm; Sai/Hết giờ = `0` điểm | Xác định người **Thắng / Thua / Hòa** của trận đấu đó |
| **Điểm xếp hạng (`PvP ELO`)** | Lưu trữ lâu dài trong hồ sơ người chơi (khởi điểm `1000 ELO`) | Công thức Elo chuẩn quốc tế ($K = 32$) dựa trên kết quả trận và chênh lệch ELO hai bên | Đánh giá trình độ PvP, phân bậc Rank và xếp hạng Bảng vàng |
| **Điểm kinh nghiệm (`Learning EXP`)** | Hệ thống học tập chính khóa | **Không cộng (`+0 EXP`)** trong mọi trận PvP | Đảm bảo PvP thuần túy là sân chơi xếp hạng kỹ năng |

---

## 2. CHI TIẾT 8 CHỨC NĂNG PVP ĐÃ TRIỂN KHAI

### 2.1. Tìm và ghép đối thủ (`ArenaMatchmaker` & Phòng đấu Mã Code)
Hỗ trợ 2 chế độ ghép cặp đối thủ:
1. **Ghép trận tự động theo ELO & Cấp độ (`ARENA_MATCHMAKE`)**:
   - Hàng đợi thông minh ưu tiên ghép hai người chơi có cùng khoảng trình độ:
     - Sai số cấp độ: $|\text{Level}_A - \text{Level}_B| \le \text{levelTolerance}$ (mặc định $\le 1$ cấp).
     - Sai số điểm ELO: $|\text{ELO}_A - \text{ELO}_B| \le 250 + \text{levelTolerance} \times 150$.
   - Tự động loại bỏ các phiên ngắt kết nối hoặc người chơi đang bị cấm ghép trận tạm thời khỏi hàng đợi.
2. **Phòng đấu tùy chọn bằng Mã phòng 6 ký tự (`ARENA_CREATE` / `ARENA_JOIN`)**:
   - Chủ phòng tạo mã phòng (ví dụ: `AB12CD`) và gửi cho bạn bè nhập mã để vào đấu trực tiếp.

---

### 2.2. Xác nhận tham gia trận đấu (`CONFIRMING` Phase)
- Ngay khi tìm thấy đối thủ (qua hàng đợi hoặc nhập mã phòng), phòng đấu chuyển sang trạng thái **`CONFIRMING`** trong **15 giây** (`CONFIRM_TIMEOUT_SECONDS = 15`).
- Cả hai người chơi nhận sự kiện realtime `ARENA_CONFIRM_REQUIRED` và hiển thị hộp thoại xác nhận với đồng hồ đếm ngược 15 giây cùng trạng thái xác nhận của mình và đối thủ:
  - Nhấn **"Sẵn sàng chiến đấu"** (`ARENA_CONFIRM_ACCEPT`): Đánh dấu người chơi đã sẵn sàng (`hostConfirmed = true` hoặc `guestConfirmed = true`).
  - Nhấn **"Từ chối"** (`ARENA_CONFIRM_DECLINE`) hoặc **để hết 15 giây không phản hồi**: Hủy trận đấu ngay lập tức (`STATUS = CANCELLED`), thông báo cho đối thủ biết trận bị hủy và áp dụng chế tài xử phạt người vi phạm.

---

### 2.3. Giới hạn số lần từ chối xác nhận & Cấm ghép trận tạm thời
Để chống hành vi phá đám (spam tìm trận rồi từ chối hoặc treo máy AFK):
- Mỗi lần người chơi **chủ động nhấn Từ chối** hoặc **để quá hạn 15 giây không xác nhận**, bộ đếm `pvpDeclineCount` của người đó tăng thêm `1`.
- **Ngưỡng vi phạm tối đa**: `MAX_DECLINES_BEFORE_BAN = 3` lần.
- **Hình phạt khi chạm ngưỡng 3 lần**:
  - Khóa quyền tìm trận / tạo phòng / vào phòng trong **5 phút** (`DECLINE_BAN_MINUTES = 5`, lưu vào cột `pvp_banned_until`).
  - Sau khi gán lệnh cấm, bộ đếm `pvpDeclineCount` được đặt lại về `0`.
  - Nếu người chơi chấp nhận trận đấu hợp lệ (`ARENA_CONFIRM_ACCEPT`), bộ đếm vi phạm được xóa về `0`.
- Trên giao diện, khi đang bị cấm, hệ thống hiển thị cảnh báo đỏ cùng **đồng hồ đếm ngược thời gian mở khóa theo từng giây**.

---

### 2.4. Đếm ngược bắt đầu trận & Giới hạn thời gian thi đấu
Khi cả hai người chơi đã xác nhận tham gia, trận đấu trải qua 2 tầng kiểm soát thời gian nghiêm ngặt:
1. **Đếm ngược trước trận (`COUNTDOWN` — 3 giây)**:
   - Phòng chuyển sang trạng thái `COUNTDOWN` (`COUNTDOWN_SECONDS = 3`).
   - Giao diện toàn màn hình hiển thị hiệu ứng đếm ngược **`3 -> 2 -> 1`** để hai đấu sĩ chuẩn bị tinh thần trước khi câu hỏi số 1 xuất hiện.
   - Khi hết 3 giây, hệ thống tự động chuyển phòng sang `PLAYING` và mở khóa câu hỏi đầu tiên.
2. **Giới hạn thời gian câu hỏi & toàn trận (`PLAYING`)**:
   - **Thời gian mỗi câu hỏi**: **20 giây/câu** (`QUESTION_SECONDS = 20`). Nếu hết 20 giây mà chưa chọn đáp án, hệ thống tự động tính `0 điểm` cho câu đó và chuyển sang câu tiếp theo.
   - **Thời gian tối đa toàn trận**: **180 giây / 3 phút** (`MATCH_TIME_LIMIT_SECONDS = 180` cho 10 câu hỏi, lưu tại `match_deadline_at`). Nếu tổng thời gian trận đấu chạm mốc 180 giây, trận đấu lập tức kết thúc (`FINISHED`) và phân định thắng thua dựa trên số điểm đã ghi được.

---

### 2.5. Tính điểm trận đấu & Xác định Thắng / Thua / Hòa
Mỗi trận đấu gồm **10 câu hỏi ngữ pháp** lấy ngẫu nhiên từ ngân hàng câu hỏi chung đã xuất bản:
- **Công thức tính Điểm trận đấu (`Match Score`) cho từng câu**:
  - Trả lời **Sai** hoặc **Hết giờ**: $+0$ điểm.
  - Trả lời **Đúng**:
    $$\text{Điểm câu} = 10 + \text{Bonus tốc độ}, \quad \text{Bonus tốc độ} = \max\left(0, \min\left(10, \left\lfloor\frac{\text{Số giây còn lại}}{2}\right\rfloor\right)\right)$$
    *(Tối đa **20 điểm/câu** nếu trả lời ngay lập tức, tối thiểu **10 điểm/câu** nếu trả lời đúng ở giây cuối).*
- **Quy tắc phân định kết quả cuối trận (`resolveWinnerId`)**:
  1. So sánh tổng điểm trận đấu (`hostScore` vs `guestScore`): Người có điểm cao hơn **Thắng**.
  2. **Tie-breaker (Khi bằng điểm trận đấu)**: Nếu hai người có tổng điểm bằng nhau và điểm $> 0$, hệ thống so sánh tổng thời gian phản hồi thực tế (`hostTotalTimeMs` vs `guestTotalTimeMs`). Người trả lời nhanh hơn sẽ **Thắng**.
  3. **Hòa (`DRAW`)**: Khi cả hai cùng bằng điểm và cùng thời gian (hoặc cả hai cùng 0 điểm), trận đấu được tính là **Hòa**.

---

### 2.6. Quản lý điểm ELO PvP (Không cộng EXP học tập)
Sau khi trận đấu kết thúc (`FINISHED`), hệ thống tính toán sự thay đổi điểm **ELO** cho cả Chủ phòng (`Host`) và Khách (`Guest`) theo công thức **Elo quốc tế** trong [`PvpRankRules.java`](file:///d:/EnglishWeb/source/server/src/main/java/com/grammarquest/util/PvpRankRules.java):

- **Hệ số $K$**: $K = 32$, điểm ELO tối thiểu (sàn): `100 ELO`.
- **Kỳ vọng thắng của người chơi A trước đối thủ B**:
  $$E_A = \frac{1}{1 + 10^{(\text{ELO}_B - \text{ELO}_A) / 400}}$$
- **Điểm thực tế đạt được ($S_A$)**:
  - Thắng: $S_A = 1.0$ (đối thủ $S_B = 0.0$)
  - Hòa: $S_A = 0.5$ (đối thủ $S_B = 0.5$)
  - Thua: $S_A = 0.0$ (đối thủ $S_B = 1.0$)
- **Độ biến thiên ELO ($\Delta\text{ELO}$)**:
  $$\Delta\text{ELO}_A = \text{round}\left(32 \times (S_A - E_A)\right)$$
  - Nếu đánh bại đối thủ có **ELO cao hơn**, người chơi nhận được nhiều điểm ELO hơn (ví dụ $+20 \sim +28$ ELO).
  - Nếu thua đối thủ có **ELO cao hơn nhiều**, số điểm ELO bị trừ rất ít.
  - Nếu **bỏ cuộc giữa trận (`ARENA_LEAVE`)**, người bỏ cuộc bị xử thua kỹ thuật và bị trừ ELO theo đúng công thức trên.
- **Không cộng EXP học tập**: Kết thúc trận PvP chỉ cập nhật `pvp_elo`, `pvp_rank_tier`, `pvp_wins`, `pvp_losses`, `pvp_draws` và **tuyệt đối không cộng `total_xp` hay ghi `xp_ledger`**.

---

### 2.7. Bảng xếp hạng theo ELO & Phân hạng người chơi (6 Bậc Rank)
Hệ thống tự động phân hạng người chơi vào **6 bậc Rank PvP** dựa trên điểm ELO hiện tại:

| Mã Rank | Tên hiển thị | Khoảng điểm ELO | Màu sắc nhận diện |
| :--- | :--- | :---: | :--- |
| `BRONZE` | **Đồng** | $< 1000$ ELO (`0 – 999`) | Nâu Đồng (`#CD7F32`) |
| `SILVER` | **Bạc** | `1000 – 1199` ELO | Bạc Ánh Kim (`#C0C0C0`) |
| `GOLD` | **Vàng** | `1200 – 1399` ELO | Vàng Hoàng Kim (`#FFD700`) |
| `PLATINUM` | **Bạch Kim** | `1400 – 1599` ELO | Xanh Ngọc Bích (`#00E5FF`) |
| `DIAMOND` | **Kim Cương** | `1600 – 1899` ELO | Tím Tinh Anh (`#B388FF`) |
| `MASTER` | **Cao Thủ** | $\ge 1900$ ELO | Đỏ Hồng Hỏa Diệm (`#FF4081`) |

- **Bảng xếp hạng ELO (`GET /api/v1/arena/leaderboard`)**:
  - Xếp hạng Top 50 đấu sĩ có điểm ELO cao nhất toàn máy chủ (ưu tiên `pvp_elo DESC`, `pvp_wins DESC`).
  - Hiển thị đầy đủ: Thứ hạng (`#1, #2, #3...`), Khung Avatar & Huy hiệu đang trang bị, Tên hiển thị, Bậc Rank, Điểm ELO, Tổng trận Thắng / Thua / Hòa và Tỷ lệ thắng (`Win Rate %`).

---

### 2.8. Phần thưởng Cosmetic (Khung Avatar & Huy hiệu theo Rank / Thành tích)
Hệ thống cung cấp **18 vật phẩm trang trí (Cosmetics)** gồm **8 Khung Avatar (`FRAME`)** và **10 Huy hiệu (`BADGE`)** được mở khóa tự động khi người chơi đạt mốc Rank ELO hoặc thành tích thắng trận:

#### A. Danh sách Khung Avatar (`FRAME`)
| Mã vật phẩm | Tên Khung Avatar | Điều kiện mở khóa |
| :--- | :--- | :--- |
| `FRAME_DEFAULT` | Khung Học Viên Cơ Bản | Mặc định có sẵn cho mọi người chơi |
| `FRAME_BRONZE` | Khung Đồng Chiến Binh | Mặc định / Hạng Đồng |
| `FRAME_SILVER` | Khung Bạc Tinh Anh | Đạt hạng **Bạc** ($\ge 1000$ ELO) |
| `FRAME_GOLD` | Khung Vàng Vinh Quang | Đạt hạng **Vàng** ($\ge 1200$ ELO) |
| `FRAME_PLATINUM` | Khung Bạch Kim Ngân Hà | Đạt hạng **Bạch Kim** ($\ge 1400$ ELO) |
| `FRAME_DIAMOND` | Khung Kim Cương Vũ Trụ | Đạt hạng **Kim Cương** ($\ge 1600$ ELO) |
| `FRAME_MASTER` | Khung Cao Thủ Tối Thượng | Đạt hạng **Cao Thủ** ($\ge 1900$ ELO) |
| `FRAME_CHAMPION_10` | Khung Bất Bại Chiến Thần | Thành tích thắng **10 trận PvP** |

#### B. Danh sách Huy hiệu (`BADGE`)
| Mã vật phẩm | Biểu tượng & Tên Huy hiệu | Điều kiện mở khóa |
| :--- | :--- | :--- |
| `BADGE_ROOKIE` | 🛡️ Tân Binh Đấu Trường | Mặc định có sẵn cho mọi người chơi |
| `BADGE_FIRST_WIN` | ⚔️ Chiến Thắng Đầu Tiên | Thắng **1 trận PvP** đầu tiên |
| `BADGE_VETERAN_10` | 🔥 Chiến Binh Bền Bỉ | Tham gia đủ **10 trận PvP** |
| `BADGE_WINNER_5` | 🏅 Đấu Sĩ Xuất Sắc | Thắng **5 trận PvP** |
| `BADGE_WINNER_20` | 👑 Bá Chủ Đấu Trường | Thắng **20 trận PvP** |
| `BADGE_SILVER` | 🥈 Ấn Bạc Đấu Trường | Đạt hạng **Bạc** ($\ge 1000$ ELO) |
| `BADGE_GOLD` | 🥇 Ấn Vàng Đấu Trường | Đạt hạng **Vàng** ($\ge 1200$ ELO) |
| `BADGE_PLATINUM` | 💠 Ấn Bạch Kim | Đạt hạng **Bạch Kim** ($\ge 1400$ ELO) |
| `BADGE_DIAMOND` | 💎 Ấn Kim Cương | Đạt hạng **Kim Cương** ($\ge 1600$ ELO) |
| `BADGE_MASTER` | 🐉 Ấn Cao Thủ Vũ Trụ | Đạt hạng **Cao Thủ** ($\ge 1900$ ELO) |

- Khi người chơi bấm **"Trang bị"** (`POST /api/v1/arena/cosmetics/equip`), khung avatar và huy hiệu sẽ lập tức hiển thị đồng bộ trên:
  1. Thanh điều hướng đầu trang (`Layout.tsx`).
  2. Trang Hồ sơ cá nhân (`OtherPages.tsx`).
  3. Phòng chờ xác nhận, màn hình thi đấu PvP và Bảng xếp hạng ELO (`ArenaPage.tsx`).

---

## 3. KIẾN TRÚC CƠ SỞ DỮ LIỆU & BACKEND

### 3.1. Flyway Migration [`V28__pvp_elo_ranks_cosmetics.sql`](file:///d:/EnglishWeb/source/server/src/main/resources/db/migration/V28__pvp_elo_ranks_cosmetics.sql)
- **Mở rộng bảng `users`**:
  - `pvp_elo` (`INT`, mặc định `1000`), `pvp_rank_tier` (`VARCHAR(24)`, mặc định `'SILVER'`).
  - `pvp_wins`, `pvp_losses`, `pvp_draws` (`INT`, mặc định `0`).
  - `pvp_decline_count` (`INT`, mặc định `0`), `pvp_banned_until` (`DATETIME NULL`).
  - `equipped_frame` (`VARCHAR(64)`, mặc định `'FRAME_DEFAULT'`), `equipped_badge` (`VARCHAR(64)`, mặc định `'BADGE_ROOKIE'`).
- **Mở rộng bảng `arena_rooms`**:
  - `host_confirmed`, `guest_confirmed` (`BOOLEAN`): Trạng thái xác nhận tham gia trận.
  - `confirm_deadline_at`, `countdown_ends_at`, `match_deadline_at` (`DATETIME NULL`): Mốc thời gian xác nhận (15s), đếm ngược (3s) và giới hạn tổng trận (180s).
  - `host_elo_before`, `guest_elo_before`, `host_elo_delta`, `guest_elo_delta` (`INT`): Lưu lịch sử biến động ELO của từng trận đấu.
- **Tạo mới 2 bảng Cosmetics**:
  - `pvp_cosmetics`: Danh mục 18 vật phẩm khung & huy hiệu cùng điều kiện mở khóa (`unlock_type`, `unlock_value`, `css_class`, `icon_symbol`).
  - `user_cosmetics`: Lưu các vật phẩm người chơi đã mở khóa (`user_id`, `cosmetic_code`, `unlocked_at`).

### 3.2. Các Class Backend chính
- [`PvpRankRules.java`](file:///d:/EnglishWeb/source/server/src/main/java/com/grammarquest/util/PvpRankRules.java): Chứa toàn bộ hằng số thời gian, công thức tính ELO ($K=32$) và phân bậc Rank.
- [`ArenaMatchmaker.java`](file:///d:/EnglishWeb/source/server/src/main/java/com/grammarquest/service/ArenaMatchmaker.java): Hàng đợi ghép cặp theo trình độ ELO và cấp độ.
- [`ArenaMatchFactory.java`](file:///d:/EnglishWeb/source/server/src/main/java/com/grammarquest/service/ArenaMatchFactory.java): Khởi tạo phòng đấu ở trạng thái `CONFIRMING` và chọn ngẫu nhiên 10 câu hỏi.
- [`ArenaController.java`](file:///d:/EnglishWeb/source/server/src/main/java/com/grammarquest/controller/ArenaController.java):
  - Xử lý REST API & chu kỳ sống của phòng đấu (`CONFIRMING` $\rightarrow$ `COUNTDOWN` $\rightarrow$ `PLAYING` $\rightarrow$ `FINISHED` / `CANCELLED`).
  - Xử lý chấp nhận / từ chối trận đấu, phạt cấm ghép trận 5 phút khi từ chối 3 lần, chấm điểm câu trả lời, tính ELO và tự động mở khóa Cosmetics.
- [`SocketArenaService.java`](file:///d:/EnglishWeb/source/server/src/main/java/com/grammarquest/service/SocketArenaService.java) & [`RealtimeActions.java`](file:///d:/EnglishWeb/source/server/src/main/java/com/grammarquest/controller/RealtimeActions.java): Điều phối các gói tin WebSocket thời gian thực và bộ lập lịch kiểm tra timeout mỗi giây.

### 3.3. Danh sách WebSocket Events & REST Endpoints
- **WebSocket Actions (Client $\rightarrow$ Server qua `/ws/system`)**:
  - `ARENA_MATCHMAKE`: Vào hàng đợi tìm đối thủ theo ELO.
  - `ARENA_CREATE` / `ARENA_JOIN`: Tạo phòng hoặc vào phòng bằng mã code.
  - `ARENA_CONFIRM_ACCEPT` / `ARENA_CONFIRM_DECLINE`: Chấp nhận hoặc từ chối xác nhận trận đấu.
  - `ARENA_ANSWER`: Gửi đáp án câu hỏi trong trận.
  - `ARENA_LEAVE`: Rời phòng / đầu hàng.
- **WebSocket Broadcasts (Server $\rightarrow$ Client)**:
  - `ARENA_CONFIRM_REQUIRED`: Thông báo tìm thấy trận, yêu cầu 2 bên xác nhận trong 15s.
  - `ARENA_CANCELLED`: Thông báo trận đấu bị hủy do có người từ chối hoặc quá hạn xác nhận.
  - `ARENA_STATE`: Đồng bộ toàn bộ trạng thái phòng (`CONFIRMING`, `COUNTDOWN`, `PLAYING`, `FINISHED`), điểm số, câu hỏi, thời gian và biến động ELO.
- **REST Endpoints**:
  - `GET /api/v1/arena/leaderboard`: Lấy bảng xếp hạng Top 50 ELO, danh mục 6 bậc Rank và thống kê PvP cá nhân.
  - `GET /api/v1/arena/cosmetics`: Lấy danh sách 18 vật phẩm Cosmetic và trạng thái mở khóa.
  - `POST /api/v1/arena/cosmetics/equip`: Trang bị Khung Avatar hoặc Huy hiệu đã mở khóa.

---

## 4. HƯỚNG DẪN CHẠY VÀ KIỂM THỬ

### 4.1. Khởi chạy ứng dụng
1. **Chạy Backend (Cổng `8080`)**:
   ```powershell
   cd d:\EnglishWeb\source\server
   .\run-local.ps1
   ```
2. **Chạy Frontend (Cổng `5173`)**:
   ```powershell
   cd d:\EnglishWeb\source\client
   npm run dev
   ```

### 4.2. Chạy bộ Unit Test tự động cho PvP
Dự án đi kèm bộ kiểm thử [`PvpArenaFeaturesTest.java`](file:///d:/EnglishWeb/source/server/src/test/java/com/grammarquest/controller/PvpArenaFeaturesTest.java) kiểm tra toàn diện công thức ELO, phân hạng Rank, xác nhận trận đấu, phạt cấm ghép trận sau 3 lần từ chối, tính điểm trận đấu (không cộng EXP) và mở khóa/trang bị Cosmetic:
```powershell
cd d:\EnglishWeb\source\server
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21"
.\mvnw.cmd test "-Dtest=PvpArenaFeaturesTest,ArenaMatchmakerTest,ArenaClockTest,SocketArenaServiceTest"
```
