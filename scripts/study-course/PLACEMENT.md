# Kiểm tra đầu vào

Áp dụng cho học viên đăng ký qua `/api/v1/auth/register` từ phiên bản này. Backend Spring, phiên đăng nhập/CSRF, socket `/api/ws-system` và giao diện hành tinh hiện có được tái sử dụng. Không thay cách hoàn thành bài học hay ngưỡng 8/10 của bài kiểm tra cuối level.

## Cập nhật database

Khởi động server bằng `source/server/run-local.ps1` với cấu hình database của từng máy. Flyway tự chạy các migration còn thiếu theo thứ tự:

- `V19`, `V20`: lộ trình và nội dung có sẵn nếu máy chưa cập nhật.
- `V21__study_placement.sql`: cột `users.placement_eligible` và ba bảng đầu vào. Giá trị mặc định `false` giữ nguyên quyền học của tài khoản cũ, không tạo kết quả đầu vào hay sửa tiến độ của họ. Đăng ký mới đặt `true` và tạo hồ sơ `NOT_STARTED` trong cùng transaction.
- `V22__study_placement_questions.sql`: 50 câu cố định, chọn từ câu có sẵn trong lộ trình theo xác nhận của chủ dự án; 10 câu/level, phân bố qua các module. Không dùng AI khi làm bài.
- `V23__study_welcome.sql`: migration lịch sử của form làm quen cũ. Các cột `onboarding_json` và `placement_accepted_at` hiện không còn được đọc/ghi bởi luồng popup. Giữ nguyên migration đã áp dụng để không gây lỗi checksum; không thêm bảng/cột cho ba câu hỏi popup.

Không đổi tên/xóa database, không import đè dữ liệu, không sửa checksum migration đã áp dụng. Đồng đội pull đầy đủ code và migration rồi khởi động server như bình thường; dùng thông tin database local của mỗi người. Nên sao lưu trước khi nâng cấp. Học viên demo/tài khoản được tạo trực tiếp từ trước vẫn được miễn kiểm tra.

Từ thư mục gốc kiểm tra seed bằng `python scripts/study-course/build-placement.py --check`. Trình tạo từ chối ghi đè migration. Nếu đổi ngân hàng sau khi phát hành, thêm migration phiên bản mới; đề đã tạo lưu snapshot nên không bị thay đổi theo ngân hàng.

## Dữ liệu và quy tắc

Sau đăng ký và đăng nhập tự động, học viên mới thấy **popup chào mừng** ở giữa màn hình, nền sau tối nhẹ. Ba câu hỏi chọn sẵn về nhóm tuổi, tự đánh giá trình độ và thời gian học chỉ dùng state bên trong popup. Không có ô nhập tay; mỗi câu chọn một đáp án, được đổi và không bắt buộc chọn đủ. Không gửi các lựa chọn qua HTTP/socket, không ghi database/localStorage/sessionStorage, không dùng chúng để chấm hay xếp level.

`RegistrationWelcomeProvider` chỉ giữ sự kiện đăng ký trong bộ nhớ React, gắn với tài khoản vừa đăng ký. Không dùng route state hay cờ lưu bền. Nút “Xác nhận và làm bài kiểm tra”, nút X, Escape và bấm nền ngoài popup đều xóa state tạm/đóng popup rồi mở trang đầu vào hiện có. Có chặn bấm lặp; server vẫn giữ một lượt đầu vào/tài khoản. Popup dùng native dialog, giữ focus trong popup, điều khiển radio bằng bàn phím và cuộn nội dung khi màn hình thấp.

Popup hiển thị từng câu trong ba bước, với thanh tiến độ, nút “Tiếp tục”, “Quay lại” và “Bỏ qua câu này”. Nút xác nhận làm bài chỉ ở bước cuối. Quay lại giữ lựa chọn trước đó trong state để sửa. Giao diện dùng gradient tím/xanh, thẻ chọn có dấu tích, hiệu ứng mở popup/chuyển câu tiến-lùi và phản hồi khi chọn. Khóa thao tác đổi bước trong lúc chuyển động để tránh bấm nhanh nhảy nhiều câu. Sau chuyển câu, focus về tiêu đề câu mới; `prefers-reduced-motion` tắt animation và dùng chuyển bước tức thời.

Tải lại/thoát/đăng nhập lại không còn sự kiện đăng ký trong bộ nhớ nên vào trực tiếp bài đầu vào hoặc khôi phục lượt đang làm; không hỏi lại popup. `PLACEMENT_OPEN` không yêu cầu thông tin làm quen hay xác nhận cũ. Action `PLACEMENT_ACCEPT` đã được loại bỏ, không có endpoint nhận các lựa chọn popup. Dữ liệu lịch sử của form cũ không bị xóa hay dùng để xếp level.

Mọi route trong phần website của học viên mới đều chuyển về `/placement` trong lúc chưa hoàn thành kiểm tra. Tài khoản cũ được miễn đầu vào giữ nguyên hành vi; người đã hoàn thành đầu vào đăng nhập vào lộ trình/bài đang học bình thường.

Khi mở website, ứng dụng chờ `/auth/me` xác minh phiên trước khi hiện form đăng nhập hoặc điều hướng. Không có phiên thì `/`, `/placement` và `/roadmap` đều dẫn về đăng nhập, không gửi yêu cầu đầu vào. Nếu cookie phiên vẫn hợp lệ, ứng dụng khôi phục tài khoản đã đăng nhập và tiếp tục bài đầu vào còn dở. Header trang đầu vào hiện rõ tên/tên đăng nhập, trạng thái “Đã đăng nhập” và nút “Đăng xuất”. Nút này gọi logout của server, xóa trạng thái tài khoản ở client rồi về `/login`; muốn làm tiếp phải đăng nhập lại.

| Bảng | Nội dung |
| --- | --- |
| `study_entry_questions` | Nội dung, bốn lựa chọn, đáp án đúng, level và mã câu nguồn |
| `study_entry_profiles` | Trạng thái NOT_STARTED/IN_PROGRESS/COMPLETED, level bắt đầu, level hiện tại, các level vượt qua theo đầu vào, thời điểm hoàn thành và bài đang học |
| `study_entry_attempts` | Một lượt đầu vào/tài khoản; snapshot 10 câu, các lựa chọn đã lưu, số câu đúng và thời điểm hoàn thành |
| `study_progress`, `study_attempts` | Tiến độ bài học, luyện tập và kiểm tra level theo cơ chế cũ |

Lấy đề 3–3–2–1–1 câu cho level 1–5, không trùng câu. Lưu đề trước khi trả về; mở lại/tải lại không random lại. Lưu lựa chọn theo từng câu; nộp đủ 10 câu hợp lệ rồi mới chấm tại server. Khóa hồ sơ/lượt làm khi ghi; các yêu cầu nộp đồng thời/nộp lại trả cùng kết quả, không tạo lượt mới. Transaction dùng READ_COMMITTED để đọc được kết quả vừa commit sau khi chờ khóa.

Điểm 0–5 bắt đầu Level 1; 6–8 bắt đầu Level 2; 9–10 bắt đầu Level 3. Level đầu vào lưu riêng, không tăng khi người học tiến bộ. Các level thấp hơn được mở toàn bộ module để ôn, không đánh dấu bài học hoàn thành. Từ level bắt đầu trở lên vẫn mở module tuần tự và lên level bằng bài kiểm tra cuối level. Mở bài ghi lại bài gần nhất; vượt level cập nhật level hiện tại. Đăng nhập lại trở về bài đang học hoặc lộ trình ở level hiện tại.

Route học được chặn ở React; server cũng chặn toàn bộ action lộ trình và dịch vụ học khi chưa kiểm tra. Các thao tác học level/module kiểm tra quyền ở server khi mở, tạo lượt, xem, lưu và nộp. Tài khoản cũ không chịu ràng buộc mới.

## Socket

Phản hồi `PLACEMENT_DATA` cùng `requestId`, lỗi `ERROR` như giao thức hiện có.

| Action | Payload |
| --- | --- |
| `PLACEMENT_STATUS` | `{}`; không tự tạo lượt |
| `PLACEMENT_OPEN` | `{}`; tạo/khôi phục đề không cần dữ liệu popup; hoàn thành rồi chỉ trả tóm tắt |
| `PLACEMENT_SAVE` | `{attemptId,questionId,option:"A"}` |
| `PLACEMENT_SUBMIT` | `{attemptId,answers:{questionId:"A",...}}` |

Không trả `correctOption`/giải thích cho client. Khi hoàn thành, không trả lại câu hỏi hay lựa chọn đã chọn, chỉ trả tóm tắt điểm/level và đường dẫn học. Sự kiện `PLACEMENT_COMPLETED` sau commit thông báo cho các tab cùng tài khoản.

Trang kết quả chỉ có điểm, thông báo đúng theo ba khoảng điểm và nút “Bắt đầu học” tới module đầu tiên của level bắt đầu. Nhấn nút này mới vào giao diện website có thanh điều hướng chung.

## Kiểm tra

Từ `source/server`:

```powershell
. .\.env.local.ps1
$env:RUN_PLACEMENT_TEST = 'true'
$env:RUN_STUDY_TEST = 'true'
.\mvnw.cmd test
```

`PlacementIntegrationTest` tự tạo schema `grammar_quest_entry_<random>_test`, chạy tới V20, chèn người dùng/tiến độ cũ rồi nâng lên V23 để kiểm tra bảo toàn dữ liệu. Bao phủ mở đề không cần form làm quen, từ chối action lưu làm quen cũ, không ghi dữ liệu popup, phân bổ/khôi phục đề, sửa câu trả lời, nộp thiếu, mốc 0/5/6/8/9/10, nộp đồng thời/idempotency, dữ liệu trả về, quyền sở hữu, socket có phiên thật, ôn level thấp, khóa level/module, tăng level hiện tại mà giữ level bắt đầu. Test xóa schema riêng sau khi chạy.

Với ứng dụng local đang chạy, từ `source/client`:

```powershell
. ..\server\.env.local.ps1
npm run build
node scripts/check-placement.mjs
node scripts/check-welcome-popup.mjs
node scripts/check-study-roadmap.mjs
```

Smoke đầu vào dùng tài khoản `placement_ui_*` riêng, đăng ký trên UI, kiểm tra tải lại/tab khác, cố ý ngắt một frame lưu để xác minh tự gửi lại sau khi socket kết nối lại, trang kết quả, học/ôn và đăng nhập lại. Smoke lộ trình dùng fixture `study_ui_*` được đặt miễn đầu vào để kiểm tra hành vi tài khoản cũ. Cả hai thu hồi dữ liệu fixture; ảnh ở `artifacts/placement` và `artifacts/study-roadmap` (không đưa vào Git).

`check-welcome-popup.mjs` kiểm tra đăng ký thật, mỗi bước chỉ có ba lựa chọn của một câu, chọn/đổi độc lập, quay lại giữ lựa chọn, tiếp tục/bỏ qua khi chưa chọn, bấm lặp lúc chuyển câu, chế độ giảm chuyển động, bàn phím/focus, cuộn trên màn hình thấp và đóng bằng nút X/Escape/nền ngoài. Kiểm tra tải lại khi popup còn mở, đăng nhập lại trước khi hoàn thành đầu vào, guard lộ trình, chỉ một lượt kiểm tra, không có lựa chọn popup trong frame socket/body HTTP/storage/database. Dùng tài khoản `popup_ui_*` riêng và thu hồi sau từng trường hợp; ảnh ở `artifacts/placement/*-popup.png` và `desktop-popup-step2.png`.

Đã xác minh local ngày 23/10/2026: Maven 72 test chạy thành công, 15 test tích hợp khác không bật theo cấu hình opt-in. Các mốc 0, 5, 6, 8, 9, 10 và nộp đồng thời được kiểm tra trên MySQL thật ở schema riêng. Lần thay popup này không có migration mới và không thay đổi quy tắc tiến độ.

Ngân hàng đầu vào đã đủ 50 câu theo lựa chọn được duyệt, không còn thiếu dữ liệu để chạy chức năng này. Đây là câu hỏi từ lộ trình hiện tại, không phải chứng chỉ/xếp loại CEFR.
