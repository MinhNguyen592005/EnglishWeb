# UI — Grammar Quest / Trạm không gian

> Quy chuẩn giao diện để xây dựng frontend React/Vite nhất quán.
> Đọc cùng `PROJECT_SPEC.md`. Tài liệu này mô tả thiết kế; các ảnh là tham khảo, chưa phải UI chạy được.

## 1. Hướng thiết kế

Website chỉ phục vụ **ngữ pháp tiếng Anh**. Chủ đề không gian được thể hiện bằng hành tinh, phi hành gia, tên lửa và robot đơn giản. Người dùng phải đọc câu hỏi và thao tác dễ dàng hơn là ngắm hình trang trí.

- Nền sáng, thẻ trắng, chữ xanh navy, nút xanh tím, trạng thái đúng màu xanh ngọc.
- Ảnh minh họa nhỏ; không dùng lâu đài, pháp sư, fantasy anime hoặc nền thiên hà tối từ bộ thiết kế cũ.
- Không biến mockup thành ảnh nền nguyên trang. Dựng chữ, nút, input, bảng, thanh tiến độ thành component React thật.
- Ít hiệu ứng, không cần game engine. Boss chỉ cần ảnh nhân vật, thanh HP và chuyển động ngắn bằng CSS.
- Tất cả nhãn giao diện tiếng Việt; câu hỏi/ví dụ bằng tiếng Anh; lời giải tiếng Việt.
- Trên màn học và biểu mẫu, nội dung chức năng chiếm ưu thế. Tranh lớn chỉ dùng hạn chế ở trang auth hoặc khu vực chiến đấu.

## 2. Thứ tự ưu tiên

1. Yêu cầu mới nhất của chủ dự án.
2. Luật nghiệp vụ `PROJECT_SPEC.md`.
3. Token, component và quy tắc trong file này.
4. Ảnh tham khảo của màn hình đang làm.

Không lấy tên người, ngày, EXP, số câu hoặc thanh tiến độ không chính xác trong ảnh làm nguồn dữ liệu. Các ảnh có thể khác nhẹ về icon, avatar, kích thước; implementation dùng một bộ component và token duy nhất.

## 3. Design tokens

```css
:root {
  --color-page: #F8FAFC;
  --color-surface: #FFFFFF;
  --color-text: #14213D;
  --color-text-secondary: #52627A;
  --color-border: #E5EAF2;
  --color-primary: #6674E8;
  --color-primary-strong: #4B57C9;
  --color-primary-soft: #EEF0FF;
  --color-success: #16B8A6;
  --color-success-text: #087F73;
  --color-success-soft: #E8FAF6;
  --color-warning: #F4B544;
  --color-warning-text: #925500;
  --color-warning-soft: #FFF7E6;
  --color-danger: #DC3545;
  --color-danger-soft: #FFF0F2;
  --color-focus: #3643BD;
  --radius-control: 8px;
  --radius-card: 12px;
  --radius-dialog: 16px;
  --shadow-card: 0 2px 8px rgb(20 33 61 / 4%);
  --shadow-dialog: 0 16px 48px rgb(20 33 61 / 18%);
  --sidebar-width: 240px;
  --header-height: 72px;
}
```

- Dùng primary cho điểm nhấn; nút chữ trắng dùng primary-strong để tăng tương phản. Kiểm tra tương phản trên cặp màu thực tế, không chỉ dựa vào token.
- Success mặc định cho thanh tiến độ/icon; đoạn chữ nhỏ dùng success-text. Warning không dùng chữ trắng trên nền vàng nhạt.
- Không hard-code màu khác nhau cho từng trang. Ánh xạ token vào Tailwind/theme chung.
- Khoảng cách theo thang `4, 8, 12, 16, 24, 32, 48` px.
- Font mặc định **Segoe UI**, fallback `system-ui, Arial, sans-serif`; dùng độ đậm tối đa 700 và giữ khoảng cách chữ tiêu đề gần mức mặc định. Lựa chọn này tránh việc trình duyệt ghép Arial Black với font khác cho dấu tiếng Việt khi không có file Be Vietnam Pro.
- Nội dung 16px, line-height 1.5–1.7; nhãn phụ 14px; tránh text chức năng dưới 12px.
- H1 desktop 28–32px, mobile 24px; H2 20–24px; tiêu đề card 18px.
- Icon thông thường 20–24px; dùng Lucide nhất quán. Không trộn emoji làm icon điều hướng.

## 4. Bố cục và điều hướng

### Desktop (từ 1024px)

- Sidebar trái rộng 240px, nền trắng, viền phải mảnh. Logo tên lửa và `Grammar Quest` ở đầu; profile ngắn ở cuối.
- Header cao 72px, tiêu đề/breadcrumb bên trái, chuông thông báo và avatar bên phải.
- Content padding 24–32px, max-width khoảng 1440px, không ép trang rộng vô hạn.
- Trang dashboard có thể 2 cột 2:1. Trang bài học/câu hỏi ưu tiên cột nội dung 65–75%.
- Không tạo thanh cuộn lồng nhau vô ích; chat có vùng cuộn riêng hợp lý.

### Tablet (768–1023px)

- Sidebar chuyển thành drawer mở bằng nút menu.
- Các thẻ tự xuống hàng; nội dung phụ có thể xuống dưới câu hỏi.

### Mobile (dưới 768px)

- Một cột, padding 16px. Các đáp án xếp dọc, nút cao ít nhất 44px.
- Learner có bottom navigation: Trang chủ, Lộ trình, Luyện tập, Hồ sơ.
- PvP, Lớp học và Thông báo vẫn truy cập được từ menu drawer/header hoặc shortcut; không làm mất chức năng chỉ vì bottom nav ít mục.
- Teacher/admin dùng drawer. Bảng quan trọng chuyển thành card hoặc cho cuộn ngang bên trong vùng bảng có nhãn rõ; không làm toàn trang tràn ngang.
- Tính safe-area cho bottom nav và chừa padding đáy. Không để nav che nút xác nhận/câu trả lời.
- Không thu nhỏ nguyên ảnh desktop để giả làm responsive.

### Menu theo vai trò

| Người học | Giáo viên | Admin |
| --- | --- | --- |
| Tổng quan | Tổng quan | Tổng quan |
| Lộ trình | Lớp học, bài giao và kết quả | Tài khoản |
| Luyện tập | Ngân hàng câu hỏi | Nội dung |
| Đấu trường | Hồ sơ | Báo cáo vi phạm |
| Lớp học |  | Cài đặt |
| Hồ sơ |  | Hồ sơ qua avatar |

Giáo viên vào tổng quan giảng dạy với lớp học, bài giao và ngân hàng câu hỏi; không hiển thị lộ trình, luyện tập, đấu trường, cấp độ hay EXP của người học. Item active dựa vào route, không dựa vào state rời rạc từng trang.

## 5. Component dùng chung

| Nhóm | Component gợi ý | Yêu cầu |
| --- | --- | --- |
| Shell | AppShell, Sidebar, Header, MobileNav, PageHeader | Menu theo role, responsive |
| Cơ bản | Button, Input, Select, Textarea, Checkbox, Switch | Focus, error, disabled, loading |
| Nội dung | Card, Badge, Tabs, Breadcrumb, EmptyState | Padding/typography nhất quán |
| Dữ liệu | DataTable, Pagination, FilterBar, StatCard | Loading/trống/lỗi, lọc và phân trang |
| Phản hồi | Alert, Toast, ConfirmDialog, Skeleton | Không chỉ dựa vào màu; dialog có focus trap |
| Học | TopicCard, LessonRow, LessonStepper, QuestionCard, AnswerOption, ExplanationPanel | Dùng chung ở luyện, boss, PvP |
| Tiến độ | ProgressBar, XpBar, LevelBadge, AchievementBadge | Lấy số liệu server, clamp giá trị |
| Game | BossArena, BossHealthBar, PlayerCard, MatchTimer, MatchScoreboard | Animation chỉ phản ánh state chính thức |
| Tương tác | ChatPanel, NotificationItem, RoomCodeCard | Quyền, kết nối, lỗi gửi và chống trùng |

Không tạo bản sao Button/QuestionCard/Sidebar trong từng trang. Ưu tiên composition thay vì một component khổng lồ chứa mọi trường hợp.

## 6. Trạng thái component

### Nút và biểu mẫu

- Primary: hành động chính duy nhất của một vùng, ví dụ “Bắt đầu”, “Lưu”, “Xác nhận”.
- Secondary: viền mảnh, “Quay lại”, “Hủy”, “Xem lý thuyết”.
- Danger: hành động khóa/xóa/rời trận; có xác nhận khi gây mất tiến độ hoặc tác động đến người khác.
- Loading: spinner + giữ nhãn có nghĩa, chặn click trùng nhưng không làm layout nhảy.
- Trường bắt buộc có nhãn rõ. Error hiện dưới trường và có tóm tắt khi phù hợp; không chỉ toast rồi mất dấu.
- Sau khi lưu thành công, thông báo ngắn và cập nhật dữ liệu thật. Không hiện success trước response.

### Đáp án

| State | Biểu hiện |
| --- | --- |
| Chưa chọn | Nền trắng, viền xám, radio rỗng |
| Đang chọn, chưa nộp | Nền primary-soft, viền xanh tím; chưa hiện đúng/sai |
| Đang gửi | Khóa thay đổi và hiển thị loading |
| Chọn đúng | Nền xanh nhạt, check + chữ “Đúng” |
| Chọn sai | Nền đỏ nhạt, X + chữ “Bạn đã chọn” |
| Đáp án đúng sau khi sai | Viền xanh, check + chữ “Đáp án đúng”; không đánh dấu radio như thể người dùng đã chọn nó |
| Chờ đối thủ | Không cho sửa; chỉ hiện “Đã gửi, chờ kết thúc câu” |

Trắc nghiệm dùng radio group, không mô phỏng checkbox nhiều lựa chọn. Phím bàn phím chọn được. Feedback đúng/sai lấy server; dữ liệu giả chỉ được dùng ở chế độ mock rõ ràng.

### Tiến độ

- Phân biệt tiến độ hoàn thành bài, tỷ lệ trả lời đúng, HP boss và EXP. Nhãn của mỗi thanh phải nói rõ nó đo gì.
- Bài hoàn thành có thể đạt 8/10 câu đúng nhưng tiến độ hoàn thành vẫn là 100%; không hiển thị 80% như chưa làm xong.
- `aria-valuenow/min/max` đúng; % vẽ thanh khớp con số. HP không âm, progress không vượt 100%.

## 7. Danh mục màn hình và route đề xuất

Route là React Router trong ứng dụng Vite, không phải cấu trúc route Next.js. Mọi route động cần kiểm tra dữ liệu/quyền; khi sai ID phải có trạng thái phù hợp.

| Nhóm | Route | Nội dung chính |
| --- | --- | --- |
| Auth | `/login` | Đăng nhập |
| Auth | `/register` | Đăng ký learner |
| Auth P1 | `/forgot-password` | Yêu cầu reset |
| Auth P1 | `/reset-password` | Token từ link, mật khẩu mới, xác nhận, hết hạn/thành công |
| Learner | `/dashboard` | Bài đang học, nhiệm vụ, EXP, shortcut |
| Learner | `/roadmap` | Hành tinh/chủ đề và trạng thái |
| Learner | `/topics/:topicId` | Bài trong chương và boss chương |
| Learner | `/lessons/:lessonId` | Lý thuyết, ví dụ, bắt đầu luyện |
| Learner | `/practice` | Chọn chủ đề và thiết lập lượt |
| Learner | `/practice/:attemptId` | Trả lời và chữa lỗi |
| Learner | `/boss/:attemptId` | Trận boss |
| Learner | `/attempts/:attemptId/result` | Thắng/thua, lời giải, thưởng thật |
| PvP | `/arena` | Tạo phòng, nhập mã |
| PvP | `/arena/rooms/:roomId` | Phòng chờ, ready, chat |
| PvP | `/arena/matches/:matchId` | Câu hỏi, điểm, đồng hồ |
| PvP | `/arena/matches/:matchId/result` | Kết quả, lời giải, chơi lại |
| Learner | `/classes` | Danh sách lớp đã tham gia, nhập mã |
| Learner | `/classes/:classId` | Nhiệm vụ, thành viên, thông báo/chat |
| Learner | `/profile` | Level, thành tích, lịch sử |
| Learner P1 | `/profile/settings` | Thông tin, bảo mật, tùy chọn |
| Learner P1 | `/notifications` | Nhiệm vụ, lời mời, học tập, huy hiệu |
| Teacher | `/teacher/dashboard` | Tổng quan lớp |
| Teacher | `/teacher/classes` | Danh sách/tạo lớp |
| Teacher | `/teacher/classes/:classId` | Thành viên, mã lớp, nhiệm vụ, trao đổi |
| Teacher | `/teacher/questions` | Danh sách, tìm và lọc câu hỏi |
| Teacher | `/teacher/questions/new`, `/teacher/questions/:questionId/edit` | Soạn/sửa, đáp án, lời giải |
| Teacher | `/teacher/assignments` | Danh sách nhiệm vụ |
| Teacher | `/teacher/assignments/new`, `/teacher/assignments/:assignmentId` | Giao bài, xem kết quả |
| Teacher P1 | `/teacher/reports` | Báo cáo chi tiết, xuất CSV |
| Admin | `/admin/dashboard` | Tổng quan, việc cần xử lý |
| Admin | `/admin/users` | Tìm/lọc, role, trạng thái, khóa/mở |
| Admin | `/admin/content` | Chủ đề/bài học/câu hỏi, nháp/xuất bản |
| Admin | `/admin/reports` | Báo cáo vi phạm và quyết định xử lý |
| Admin P1 | `/admin/settings` | Luật học, EXP, thi đấu |
| Chung | `/403`, route `*` | Thiếu quyền, không tìm thấy |

Sidebar ẩn route không được phép, nhưng backend vẫn là nơi bảo vệ dữ liệu. Trong giai đoạn chưa làm P1, không để route/nút giả như đã hoạt động.

## 8. Chi tiết các luồng quan trọng

### 8.1 Đăng nhập/đăng ký

Hai cột trên desktop: minh họa nhỏ bên trái, form bên phải; mobile ưu tiên form. Không cho chọn role Admin. Password có nút hiện/ẩn có nhãn. Sau login tới route trước đó nếu được phép, nếu không tới dashboard phù hợp role. Logout xóa cache dữ liệu người dùng và đóng socket.

Quên mật khẩu: phản hồi chung không tiết lộ tài khoản tồn tại; có trạng thái gửi, cooldown, lỗi kết nối. Chế độ dev chưa gửi email thật phải ghi đúng như đặc tả backend.

### 8.2 Lộ trình và bài học

- Hành tinh xanh có check = hoàn thành; tím = đang/có thể học; xám có lock = chưa mở.
- Đường nối đi đúng thứ tự bài/chương. Không để bố cục đường nối chỉ sang chương sau sai thứ tự.
- Bấm bài khóa hiển thị điều kiện cần hoàn thành, không điều hướng tới lỗi trắng.
- Bài lý thuyết gồm cấu trúc, cách dùng, ví dụ, lưu ý. Tô màu mệnh đề để hỗ trợ đọc, kèm chữ không chỉ màu.
- Nút tiếp theo phải phản ánh trạng thái thực: “Bắt đầu luyện tập”, “Tiếp tục”, “Ôn lại”.

### 8.3 Đánh boss

- Khu vực nhân vật/robot tối đa khoảng 25–35% chiều cao nội dung desktop. Câu hỏi và đáp án lớn, rõ.
- Hiển thị câu hiện tại/tổng câu, HP, ngưỡng đạt và phần thưởng dự kiến.
- Trả lời đúng: server phản hồi rồi mới chạy hiệu ứng năng lượng ngắn, cập nhật HP chính thức.
- Trả lời sai: feedback và quyền đi tiếp theo luật; không cộng điểm phía client.
- Mặc định boss bài học 5 câu, cần đúng 5; boss chương 10 câu, cần đúng 8. Lấy cấu hình từ API, không hard-code trong component.
- Khi HP về 0 trước khi hết câu, giữ thông tin “Đã đạt ngưỡng, hoàn thành các câu còn lại”; chưa công bố thưởng cho đến khi server chốt lượt.
- Thắng: điểm, EXP thực nhận, mở khóa, xem lại bài. Lần chơi lại không thưởng phải ghi “Đã nhận thưởng trước đó”.
- Thua: “Chưa vượt qua trạm”, nêu điểm/ngưỡng, ôn câu sai, thử lại. Không dùng lời chê trách.

### 8.4 PvP

- Sảnh và phòng chờ có thể dùng chung layout, nhưng route và trạng thái phòng phải rõ.
- Hiển thị host, ready của từng người; chỉ host có nút bắt đầu hợp lệ. Không đủ người thì disabled kèm lý do.
- Trận: hai avatar nhỏ, điểm, số câu, đồng hồ; không cần hai nhân vật chiến đấu toàn màn hình.
- Sau gửi đáp án: khóa lựa chọn, hiện đã gửi; không tiết lộ đáp án đúng trước khi vòng đóng.
- Đồng hồ tính từ deadline/serverTime, không tự quyết định hết hạn ở client.
- Mất kết nối: overlay/drawer rõ nguyên nhân, thời gian chờ, thử lại/rời trận; điểm và lượt từ snapshot khi reconnect.
- Kết quả có thắng/thua/hòa/hủy; không dùng cùng màn “Chiến thắng” cho mọi trạng thái.
- “Chơi lại” là yêu cầu vòng mới cần đối thủ chấp nhận/sẵn sàng, không tự ép người kia vào trận.

### 8.5 Lớp học và chat

- Danh sách lớp có mã tham gia; chưa có lớp có empty state và nút nhập mã.
- Bên trong lớp: nhiệm vụ trước, chat ở cột phụ hoặc tab riêng trên mobile.
- Tin nhắn pending khác tin đã gửi. Gửi lỗi có retry; không hiển thị một tin hai lần sau reconnect.
- Tin trống/giới hạn ký tự/cấm chat phải có phản hồi. Không dùng nút đính kèm nếu chưa hỗ trợ upload.
- Lời mời hết hạn/phòng đầy: thông báo rõ thay vì điều hướng tới phòng không vào được.

### 8.6 Giáo viên/admin

- Dùng bảng, form, bộ lọc và panel chi tiết. Hạn chế minh họa để nhường diện tích cho dữ liệu.
- Soạn câu hỏi tách câu hỏi, đáp án, lựa chọn đúng, giải thích. Chặn lưu thiếu đáp án; có preview.
- Giao nhiệm vụ có preview người học, lớp đích, số câu, ngưỡng đạt và hạn; validate ngưỡng không lớn hơn số câu.
- Báo cáo tách “chưa hoàn thành” với “đã làm nhưng chưa đạt”.
- Admin khóa/cấm chat chọn lý do và thời hạn, có xác nhận, hiển thị audit history.
- Phân biệt “Nội dung” chung và “Ngân hàng câu hỏi” giáo viên sở hữu; không để frontend cho sửa dữ liệu ngoài quyền.

## 9. Trạng thái toàn ứng dụng

Mỗi màn lấy dữ liệu phải có:

1. `loading`: skeleton gần bố cục cuối, không nhảy layout.
2. `success`: dữ liệu thật hoặc mock được bật rõ.
3. `empty`: giải thích và hành động phù hợp (tạo lớp, bắt đầu học...).
4. `error`: lỗi ngắn, retry; giữ dữ liệu form khi hợp lý.
5. `unauthenticated`: chuyển login, giữ đường dẫn trở lại hợp lệ.
6. `forbidden`: không có quyền, không lộ dữ liệu trong nền.
7. `not_found`: không tìm thấy tài nguyên.

Tình huống cần bao phủ: phòng đầy, mã lớp sai, câu hỏi không đủ, nhiệm vụ hết hạn, session hết hạn, tài khoản khóa, thay đổi chưa lưu, server offline. Khi realtime mất kết nối, không báo client đang online hoặc bịa cập nhật điểm.

## 10. Tài nguyên và ảnh tham khảo

- Ảnh toàn màn hình để ở `statics/ui/`; không import chúng làm giao diện.
- Ảnh dùng thật: `source/client/public/images/space/` (astronaut, robot, planets, rocket). Đặt tên rõ ràng, tránh ảnh base64 khổng lồ trong JSX.
- Nếu chưa có tài nguyên rời, dùng icon hoặc SVG đơn giản do nhóm tự tạo; không cắt ảnh chụp UI có lẫn chữ/nút để thay component.
- Chỉ dùng tài nguyên có quyền sử dụng. Không tự hotlink ảnh bên ngoài làm dependency bắt buộc.
- Ảnh trang trí có alt rỗng; ảnh có ý nghĩa có alt tiếng Việt.
- Khi nhờ AI code một trang, gửi ảnh trang đó và một ảnh layout chuẩn. Không cần gửi cả bộ một lần.

### Tên tham khảo gợi ý

Đây là quy ước đặt tên để nhóm lưu ảnh, **không phải danh sách file đã tồn tại**. Có thể dùng tên khác nếu cập nhật prompt tương ứng.

| Tên file trong `statics/ui/` | Màn hình |
| --- | --- |
| `01-login.png` | Đăng nhập |
| `02-register.png` | Đăng ký |
| `03-dashboard.png` | Tổng quan |
| `04-roadmap.png` | Bản đồ |
| `05-lesson.png` | Lý thuyết |
| `06-practice.png` | Làm bài/giải thích |
| `07-boss.png` | Đánh boss |
| `08-boss-result.png` | Kết quả boss |
| `09-arena-lobby.png` | Sảnh/phòng chờ |
| `10-arena-match.png` | Trận PvP |
| `11-arena-result.png` | Kết quả PvP |
| `12-classroom.png` | Lớp và chat |
| `13-profile.png` | Hồ sơ |
| `14-teacher-dashboard.png` | Theo dõi lớp |
| `15-question-editor.png` | Soạn câu hỏi |
| `16-assignment-editor.png` | Giao nhiệm vụ |
| `17-admin-users.png` | Tài khoản |
| `18-admin-reports.png` | Báo cáo vi phạm |
| `19-forgot-password.png` | Quên mật khẩu |
| `20-topic-detail.png` | Chi tiết chương |
| `21-practice-setup.png` | Chọn bài luyện |
| `22-boss-failed.png` | Thua boss |
| `23-arena-reconnect.png` | Mất kết nối |
| `24-teacher-classes.png` | Danh sách lớp |
| `25-class-members.png` | Thành viên |
| `26-learning-report.png` | Báo cáo học tập |
| `27-admin-dashboard.png` | Tổng quan admin |
| `28-content-editor.png` | Quản lý nội dung |
| `29-game-settings.png` | Luật chơi |
| `30-profile-settings.png` | Cài đặt tài khoản |
| `31-notifications.png` | Thông báo |
| `32-mobile.png` | Mẫu responsive; dùng bản đã sửa, không có nhiệm vụ từ vựng |

## 11. Accessibility và chuyển động

- Dùng HTML semantic, label cho input, tên truy cập cho nút chỉ có icon.
- Focus thấy rõ; dialog giữ focus và trả focus về nút mở khi đóng. Esc đóng khi an toàn.
- Màu trạng thái đi kèm chữ/icon. Không phân biệt đúng/sai chỉ bằng xanh/đỏ.
- Nội dung động quan trọng (lỗi gửi, kết quả) có thông báo hỗ trợ screen reader vừa đủ; không đọc đồng hồ mỗi giây gây nhiễu.
- Tôn trọng `prefers-reduced-motion`. Hiệu ứng boss khoảng 200–500ms; không chớp sáng mạnh hoặc animation liên tục cản trở học.
- Âm thanh mặc định tắt, người dùng bật được; không tự phát gây bất ngờ.
- Kích thước chạm tối thiểu 44×44px cho nút chính, icon thao tác có vùng click đủ lớn.

## 12. Tổ chức frontend và dữ liệu

- Router/providers ở `src/app/`; trang ở `src/pages/`; nghiệp vụ giao diện theo `src/features/`.
- `src/components/ui/`: primitive; `src/components/layout/`: shell; component chuyên môn đặt ở feature tương ứng.
- HTTP ở `src/services/apiClient.ts`; STOMP ở `src/services/realtimeClient.ts`; không gọi fetch rải rác trong mọi component.
- Dùng TypeScript DTO khớp hợp đồng trong `source/common/`. Không tự đổi field camelCase/snake_case ở từng trang.
- State cục bộ: lựa chọn đáp án chưa gửi, tab, form. State từ server: role, kết quả, XP, tiến độ, phòng và trận; không tự coi localStorage là dữ liệu chính.
- Context/reducer đủ cho auth, theme và trạng thái nhỏ; không thêm nhiều thư viện quản lý state trùng chức năng khi chưa cần.
- Hủy request/subscription khi rời trang; không gửi hai lệnh start do effect chạy lại; mutation gắn requestId theo đặc tả.
- Dữ liệu mock tách ở `src/mocks/`, chỉ dùng khi bật cờ. Lỗi API thật không được biến thành mock success.

## 13. Kiểm tra trước khi coi một màn hoàn thành

- [ ] Đúng bố cục, màu, font và component chung.
- [ ] Sidebar active và breadcrumb đúng route.
- [ ] Các nút chính có hành vi; không để nút bấm không làm gì.
- [ ] Form validate, loading/error/empty và quyền truy cập đầy đủ.
- [ ] Feedback, HP, điểm, EXP không suy ra tùy ý từ client.
- [ ] Không có đáp án đúng lộ trước khi được server công bố.
- [ ] Không tràn ngang ở 390px, 768px và 1440px; nội dung không bị nav che.
- [ ] Bàn phím, focus, tương phản và reduced motion được kiểm tra.
- [ ] Mockup chữ/số sai không bị chép nguyên vào dữ liệu thực.
- [ ] Không còn nội dung từ vựng/nghe/nói ngoài phạm vi.

## 14. Mẫu prompt dùng hai file

```text
Đọc PROJECT_SPEC.md và UI.md ở thư mục gốc trước khi làm.
Dự án dùng React + TypeScript + Vite, Spring Boot và MySQL; không Next.js, không Docker.

Nhiệm vụ lượt này: [ghi một màn hình hoặc một luồng cụ thể].
Ảnh tham khảo: [đường dẫn ảnh thực có hoặc ảnh gửi kèm].
Chế độ dữ liệu: [mock rõ ràng / API thật đã có].
Điều kiện hoàn thành: [hành vi, quyền, lưu dữ liệu và trạng thái lỗi cần kiểm tra].

Tái sử dụng layout/component hiện có. Không tự thêm chức năng ngoài phạm vi.
Luật nghiệp vụ theo PROJECT_SPEC.md; số liệu trong ảnh chỉ minh họa.
Nếu API chưa có, định nghĩa hợp đồng trước; không giả vờ đã tích hợp thật.
Sau khi làm, báo file thay đổi, cách kiểm tra và phần còn thiếu.
```
