# Lộ trình 5 hành tinh theo STUDY.md

Phần này phục vụ `/roadmap`. Dữ liệu nằm trong các bảng `study_*`; không thay nội dung các bảng `topics`, `lessons`, `questions`, `attempts`, `xp_ledger` hay quy tắc hoàn thành bài học. Kiểm tra đầu vào cho tài khoản mới và quyền bắt đầu học được mô tả tại [PLACEMENT.md](PLACEMENT.md).

## Nội dung

- 5 level tương ứng 5 hành tinh, 28 module, 120 chủ điểm/bài học.
- Module mở tuần tự trong mỗi level: hoàn thành toàn bộ bài học của tất cả module trước mới mở module tiếp theo. Server chặn đọc bài, tạo/xem/lưu/nộp lượt làm của module chưa mở. Ôn tập level chỉ lấy câu từ các module đã mở; kiểm tra lên level vẫn yêu cầu 8/10.
- Mỗi bài có mục tiêu, bài trước để tham khảo, giải thích tiếng Việt, cấu trúc, ba ví dụ có nghĩa tiếng Việt, lỗi thường gặp, vận dụng viết và tổng kết.
- Mỗi bài dùng ba câu trắc nghiệm cố định. Nộp đủ là hoàn thành, kể cả đúng 0/3. Kết quả không bị tính lặp; làm lại giữ trạng thái hoàn thành.
- Câu trả lời nháp được lưu qua socket; được đổi trước khi nộp. Server không trả điểm, đúng/sai, đáp án hoặc giải thích trước khi nộp.
- Phần viết vận dụng là ghi chú tự đối chiếu, lưu trong `sessionStorage` của tab; không được chấm hoặc dùng làm điều kiện hoàn thành.
- Có ôn tập/kiểm tra module và ôn tập level. Kiểm tra module mở khi đã hoàn thành các bài trong module, dùng tối đa 10 câu và chỉ phản hồi điểm. Tài liệu chưa quy định ngưỡng đạt module nên không dùng điểm module để khóa level.
- Kiểm tra cuối level: hoàn thành tất cả bài của level để mở đề; đúng ít nhất 8/10 để vượt level. Được làm lại; lần làm lại chưa đạt không thu hồi level đã mở.
- Đề tổng hợp lấy ít nhất một câu từ mỗi module, sau đó phân phối các câu còn lại theo vòng. 10 câu là mẫu đại diện kiến thức các module, không phải một câu cho từng chủ điểm. Các lượt kiểm tra có thể lấy bộ câu khác nhau.
- Không cộng EXP từ lộ trình mới. Các quy tắc EXP bên ngoài lộ trình giữ nguyên.

Giải thích và bài tập được biên soạn mới dựa trên danh sách chủ điểm trong `STUDY.md`, không sao chép nguyên văn sách. Bản PDF Longman không có trong workspace; nội dung này không phải bản số hóa đầy đủ hay bản đã đối chiếu từng trang của sách.

## Cập nhật nội dung

Mỗi file `content/levelN.txt` gồm các khối:

```text
@mã_chủ_điểm
Giải thích quy tắc bằng tiếng Việt.
Cấu trúc và các mẫu cần nhớ.
Câu hỏi có ___||đáp án||nhiễu 1||nhiễu 2||nhiễu 3||nghĩa tiếng Việt
... (đúng ba dòng câu hỏi)
```

Trình biên dịch lấy cách phân chia level/module, tên bài và mã bài từ `STUDY.md`. Ba câu luyện có ID ổn định theo bài, thứ tự đáp án được xáo trộn xác định theo mã câu. Bộ câu và lời giải được chụp vào lượt làm; sửa dữ liệu mới không sửa kết quả cũ.

Từ thư mục gốc, xác minh dữ liệu hiện tại:

```powershell
python scripts/study-course/build.py --check
```

Sau khi sửa nội dung, tạo **migration mới với số phiên bản chưa dùng**, ví dụ:

```powershell
python scripts/study-course/build.py --migration source/server/src/main/resources/db/migration/V24__study_content_update.sql
```

Chương trình từ chối ghi đè migration đã có. Không sửa `V19`/`V20` sau khi đã áp dụng. Migration nội dung mới cập nhật level/module/bài; không xóa tiến độ hay sửa snapshot các lượt cũ. Nếu bổ sung hoặc di chuyển bài giữa các level đã có người học, cần xem xét chính sách tiến độ trước khi phát hành.

## Giao thức socket

Các action đều gửi qua `/api/ws-system`, dùng phiên đăng nhập học viên. Phản hồi là `ROADMAP_COURSE_DATA` cùng `requestId`; lỗi là `ERROR` theo giao thức có sẵn.

| Action | Payload |
| --- | --- |
| `ROADMAP_OPEN` | `{}` |
| `ROADMAP_LESSON` | `{lessonId:"1.1"}` |
| `ROADMAP_START` | `{kind,referenceId,requestKey}` |
| `ROADMAP_ATTEMPT` | `{attemptId}` |
| `ROADMAP_SAVE` | `{attemptId,answers:{"1.1-q1":"A"}}` |
| `ROADMAP_SUBMIT` | `{attemptId,answers:{...}}` |

`kind`: `LESSON`, `MODULE_REVIEW`, `MODULE_TEST`, `LEVEL_REVIEW`, `LEVEL_TEST`. `referenceId` tương ứng mã bài, mã module như `l1-m1`, hoặc số level dạng chuỗi `"1"`. `requestKey` giữ nguyên khi gửi lại một yêu cầu tạo lượt bị gián đoạn. Tạo lượt tiếp theo dùng mã mới.

Server kiểm tra quyền sở hữu, điều kiện mở level, đáp án đủ/hợp lệ; khóa dòng lượt làm khi lưu/nộp. Nộp lại lượt đã kết thúc trả kết quả cũ. `ROADMAP_PROGRESS_CHANGED` chỉ gửi cho các socket của cùng tài khoản sau commit; trang lộ trình tải lại tiến độ.

## Kiểm tra

Build giao diện: `npm run build` trong `source/client`.

Unit/regression: `mvnw.cmd test` trong `source/server`.

MySQL + Flyway + socket thật, từ `source/server`:

```powershell
. .\.env.local.ps1
$env:RUN_STUDY_TEST = 'true'
.\mvnw.cmd '-Dtest=StudyRoadmapIntegrationTest' test
```

Test tự tạo database `grammar_quest_study_<mã_ngẫu_nhiên>_test` và thu hồi sau khi chạy; không sử dụng database ứng dụng để làm fixture.

Kiểm tra Edge desktop/mobile với ứng dụng local đang chạy trên cổng 5173/8080 và database `grammar_quest`, từ `source/client`:

```powershell
. ..\server\.env.local.ps1
node scripts/check-study-roadmap.mjs
```

Script tạo tài khoản `study_ui_*` riêng, kiểm tra lưu nháp, nộp thiếu câu, hoàn thành 0 điểm, làm lại, mốc 7/10 và 8/10, cập nhật tab khác và kích thước mobile. Script chỉ thêm tiến độ fixture cho tài khoản này để đến bước kiểm tra level nhanh hơn; kiểm thử Java bao phủ nộp từng bài thật. Tài khoản và dữ liệu fixture được thu hồi khi kết thúc. Ảnh nằm trong `source/client/artifacts/study-roadmap/`.
