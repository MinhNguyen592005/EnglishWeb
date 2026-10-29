# Rà soát realtime sau các thay đổi giao diện

Ngày: 29/10/2026. Kiểm tra mã nguồn frontend, đường ghi HTTP, handler WebSocket và các test hiện có. Không thay đổi chức năng trong lần rà soát này. Chưa xác minh hai phiên người dùng trên database thật.

## Kết luận

Các màn chính đã có đường cập nhật qua socket hoặc invalidation. Tuy nhiên chưa thể coi toàn bộ trải nghiệm realtime là hoàn chỉnh: vẫn có dữ liệu chi tiết bị cũ, một số sự kiện bị bỏ sót và việc tải lại quá rộng.

## Cần ưu tiên sửa

### 1. Tải lại toàn hệ thống quá rộng — ưu tiên cao

- `RealtimeInvalidationConfig.java:29-31` phát `Changed("*")` cho phần lớn mutation HTTP.
- `SystemSocketHandler.java:272-273` cũng đánh dấu `*` cho từng `SUBMIT_ANSWER`, thao tác lớp và nhiều lệnh PvP; `pushInvalidations()` gửi đến mọi session ở dòng 792.
- `ClassroomPages.tsx:362,426,433` vừa tải lại theo invalidation, vừa tải theo `CLASS_UPDATE`; tab bảng điểm lại gọi API kết quả cho từng bài sau khi đối tượng lớp thay đổi.
- Tác động: một lớp gửi chat hay học sinh trả lời có thể khiến màn học liệu, danh sách tài khoản, nhiệm vụ và bảng điểm của các phiên không liên quan tải lại. Gộp theo nhịp 500 ms chỉ giảm tần suất, chưa giải quyết phạm vi và số lượng request.
- Đề xuất: phân loại sự kiện theo domain, userId, classId, assignmentId; dùng snapshot socket đã nhận; batch kết quả lớp thay vì một request mỗi bài.

### 2. Modal báo cáo vẫn giữ dữ liệu cũ — ưu tiên cao

- `AdminPage.tsx:613` lưu cả đối tượng `selectedReport`. Callback `update` ở dòng 650 chỉ thay danh sách và tổng quan; modal ở dòng 856 tiếp tục nhận đối tượng đã lưu.
- Tái hiện: admin A mở báo cáo; admin B xử lý. Danh sách của A nhận cập nhật nhưng modal còn trạng thái OPEN và các nút quyết định cũ.
- Đề xuất: lưu khóa `(source, id)`, lấy bản mới nhất từ danh sách hoặc đồng bộ đối tượng đang mở khi nhận workspace update; xử lý trường hợp báo cáo biến mất.

### 3. Đăng ký mới chưa làm mới danh sách tài khoản và biểu đồ ngay — ưu tiên vừa

- `AuthController.java:135-148` tạo người dùng mà không phát sự kiện invalidation cho admin.
- `RealtimeInvalidationConfig.java:26,29` bỏ request chưa đăng nhập và mọi đường `/auth/`, nên đăng ký mới không đi qua đường thông báo hiện tại.
- Tác động: danh sách tài khoản và `BusinessOverview` đang mở có thể cũ cho tới lần reload/reconnect/thay đổi khác. Tổng số tài khoản ở workspace tổng quan vẫn có thể cập nhật theo snapshot định kỳ; đây không phải mất realtime toàn bộ trang admin.
- Đề xuất: phát sự kiện UserRegistered sau commit, chỉ thông báo các màn quản trị liên quan. Giữ đăng nhập/CSRF qua HTTP.

### 4. Trang bài học con của roadmap chưa nhận thay đổi — ưu tiên vừa

- `StudyRoadmap.tsx:30` có refresh cho course, nhưng `LessonScreen` ở dòng 436 tải `ROADMAP_LESSON` theo id/connected/revision mà không subscribe invalidation/progress.
- Tác động: course tổng thể được tải lại nhưng state `lesson` trong component con không tự thay theo; hoàn thành bài ở tab khác hoặc thay đổi nội dung có thể chưa phản ánh vào bài học đang mở.
- `AttemptPage.tsx` cũng chỉ tải GET_ATTEMPT theo id/reconnect, không đồng bộ tiến độ khi cùng một lượt đang được dùng ở hai tab. Không nên tự thay câu hỏi/bản nháp trong lúc trả lời; cần thông báo lượt đã thay đổi/hoàn thành và cho đồng bộ có kiểm soát.
- Đề xuất: listener theo lesson/attempt, phân biệt nội dung tĩnh, tiến độ và lượt đang làm; bảo vệ câu trả lời chưa gửi.

### 5. Realtime có thể ghi đè tên bài giáo viên đang soạn — ưu tiên vừa

- `MaterialDeliveryForm.tsx:70-97` tải lại khi revision học liệu đổi và luôn gọi `setTitle(result.name)` ở dòng 84.
- `ClassroomPages.tsx:397` hiện làm mới học liệu khi có invalidation. Nếu giáo viên đã sửa tên bài giao, một phiên khác cập nhật học liệu có thể thay tên đang nhập bằng tên bộ bài.
- Đề xuất: chỉ tự điền khi chọn bộ bài lần đầu hoặc tên chưa được sửa; báo học liệu nguồn đã thay đổi, không tự thay bản nháp đang soạn. Bản xem trước học liệu đang mở trong `TeacherMaterialsPage` cũng hiện là snapshot, không tự tải lại theo danh sách.

### 6. Nhiệm vụ ngày chưa tự chuyển ngày — ưu tiên vừa

- `DailyQuestsContext.tsx:46-103` refresh khi có invalidation, đổi route, focus/visibility/storage; không có lịch theo mốc đổi ngày.
- `DailyQuestService.java:96` và các thao tác nhiệm vụ dùng `LocalDate.now()` theo timezone server.
- Tái hiện: giữ nguyên tab nhiệm vụ qua nửa đêm, không focus lại và không có mutation. Nhiệm vụ cũ có thể còn hiển thị; bấm đổi nhiệm vụ cũ có thể bị server từ chối.
- Đề xuất: server trả ngày hiệu lực, timezone và mốc reset; client refresh tại mốc đó, kiểm tra lại khi focus/reconnect. Tránh mặc định ngày trình duyệt trùng ngày server.

### 7. Lỗi refresh nền có thể bị nuốt — ưu tiên vừa

- `services/realtimeRefresh.ts` catch lỗi và giả định reader có state lỗi. Nhưng `AdminPage.reload()` chỉ await và set dữ liệu; callback này không tự catch khi được hook gọi.
- Tác động: nếu một lần HTTP tải lại thất bại, dữ liệu cũ có thể vẫn hiện với trạng thái socket đang kết nối mà không báo đồng bộ thất bại; chưa có retry riêng cho lần đọc đó.
- Đề xuất: trạng thái lastSyncedAt/error và retry có backoff, phân biệt kết nối socket với đồng bộ dữ liệu; giữ dữ liệu gần nhất và cho tải lại thủ công.

## Những luồng hiện hợp lý

- Chat hỗ trợ có SUPPORT_UPDATE cho hội thoại, SUPPORT_THREAD_CHANGED cho danh sách và mở lại theo connected. Giao diện admin đã có vùng cuộn và trạng thái riêng.
- Chat lớp/danh sách lớp có CLASS_LIST/CLASS_OPEN, unsubscribe và đăng ký lại khi reconnect. Cần tối ưu tải trùng, không cần viết lại toàn bộ socket.
- Kiểm tra trực tiếp có EXAM_UPDATE, kèm sync dự phòng 5 giây. Sync dự phòng là hợp lý; không cần bỏ chỉ để gọi là realtime.
- Snapshot của đề/lượt đã hoàn thành, nội dung công bố cố định không cần liên tục bị thay bằng bản mới trong lúc đang làm.
- Đăng nhập, đăng xuất, CSRF và mutation HTTP kết hợp thông báo WebSocket là hợp lý. Không cần mọi API đều chuyển sang WebSocket.

## Khoảng trống kiểm chứng

Các script Playwright hiện tại chặn HTTP/WebSocket để kiểm tra UI và event handling. Chúng chưa chứng minh sự kiện được phát đúng sau transaction trên server thật. Các test tích hợp DB lớp/học liệu có điều kiện `RUN_CLASSROOM_DB_TEST` và `RUN_MATERIAL_TEST`, không mặc định chạy.

Cần kiểm thử hai phiên thật cho: đăng ký mới → admin đang mở; admin B xử lý → modal admin A; sửa học liệu → bản nháp giao bài; nộp bài → bảng điểm/modal giáo viên; mất/kết nối lại mạng; thao tác đồng thời nhiều lớp; chuyển ngày nhiệm vụ theo timezone cấu hình.
