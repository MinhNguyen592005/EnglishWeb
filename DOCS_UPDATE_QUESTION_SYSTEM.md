# TÀI LIỆU CẬP NHẬT HỆ THỐNG CÂU HỎI VÀ ĐỀ THI
**Hệ thống Grammar Quest — Phiên bản Cập nhật Quản lý Câu hỏi & Đề thi Đa dạng**  
*Tác giả / Người cập nhật: Nguyen Ngoc Hoang Nam (namnguyen260805@gmail.com)*  
*Thời gian cập nhật: Tháng 10/2026*  
*Nhánh Git: `hoangnam`*

---

## 1. TỔNG QUAN BẢN CẬP NHẬT

Bản cập nhật này giải quyết triệt để bài toán nhập liệu thủ công tốn thời gian của giáo viên, mở rộng hệ thống câu hỏi hỗ trợ đầy đủ 4 dạng câu hỏi ngữ pháp, đồng thời thiết lập ranh giới kiến trúc rõ ràng giữa **Hành tinh chính / Đấu trường PvP** và **Lớp học / Bài kiểm tra trực tiếp**.

### Bảng phân định phạm vi sử dụng giữa các dạng câu hỏi:

| Khu vực chức năng | Dạng câu hỏi hỗ trợ | Hành vi hệ thống |
| :--- | :--- | :--- |
| **Hành tinh chính (Lộ trình)** | **Chỉ Trắc nghiệm (MCQ)** | Vượt ải, đánh boss bài học (`LESSON_BOSS`), boss chương (`CHAPTER_BOSS`), mở khóa cốt truyện. |
| **Đấu trường PvP 1v1 (Arena)** | **Chỉ Trắc nghiệm (MCQ)** | Thi đấu tốc độ cao thời gian thực 20s/câu với 4 phương án A/B/C/D. |
| **Kho câu hỏi của giáo viên** | **Cả 4 dạng** (`MCQ`, `FILL_BLANK`, `ERROR_CORRECTION`, `REWRITE`) | Soạn thảo, nhập tự động hàng loạt từ `.txt`, lưu trữ, lọc và quản lý. |
| **Bài tập về nhà của lớp (Assignment)** | **Cả 4 dạng** | Giáo viên giao bài tập cho học viên trong lớp từ kho câu hỏi cá nhân. |
| **Kiểm tra trực tiếp tại lớp (Live Exam)** | **Cả 4 dạng** | Tổ chức phòng thi trực tiếp với bảng xếp hạng và chấm điểm tự động. |

---

## 2. CHI TIẾT CÁC TÍNH NĂNG ĐÃ TRIỂN KHAI

### 2.1. Module Tự động nhập câu hỏi từ file .txt (`TxtQuestionImporter`)
- **Tập tin**: `source/client/src/components/TxtQuestionImporter.tsx` & `.css`
- **Bộ phân tích cú pháp**: `source/client/src/services/questionTxtParser.ts`
- **Hỗ trợ 4 phương thức nạp dữ liệu**:
  1. Dán trực tiếp file `.txt` từ Clipboard bằng tổ hợp phím **Ctrl+V**.
  2. Dán đoạn văn bản thô copy từ file `.txt` (Ctrl+V text).
  3. Kéo và thả file `.txt` trực tiếp vào vùng Dropzone.
  4. Bấm nút chọn file `.txt` từ ổ cứng máy tính.
- **Tự động nhận diện & bóc tách**:
  - Tự động nhận biết dạng câu hỏi qua tiêu đề hoặc từ khóa (`[MCQ]`, `[FILL_BLANK]`, `[ERROR_CORRECTION]`, `[REWRITE]`).
  - Tách Đề bài (`prompt`), các lựa chọn A/B/C/D (đối với MCQ), Đáp án mẫu (`acceptedAnswer` đối với tự luận), và Giải thích chi tiết (`explanation`).
  - Tự động hoàn thiện giải thích mặc định nếu trong file còn thiếu.
  - Kiểm tra tính hợp lệ tức thì trước khi lưu, hiển thị cảnh báo lỗi chi tiết theo từng dòng câu hỏi.
  - Hỗ trợ xem cú pháp mẫu và nút nạp nhanh dữ liệu mẫu thử nghiệm (*"Thử mẫu .txt"*).

### 2.2. Trang Soạn câu hỏi của giáo viên (`TeacherQuestionsPage.tsx`)
- **Tập tin**: `source/client/src/pages/TeacherQuestionsPage.tsx` & `.css`
- **Backend Controller**: `source/server/src/main/java/com/grammarquest/controller/TeacherQuestionController.java`
- **Các cải tiến chính**:
  - Tích hợp 2 tab làm việc: **Thêm tự động từ file .txt** và **Soạn thủ công / Quản lý kho**.
  - Dropdown **Dạng câu hỏi** hỗ trợ đầy đủ 4 dạng:
    - `MCQ`: Trắc nghiệm 4 lựa chọn A/B/C/D.
    - `FILL_BLANK`: Điền từ vào chỗ trống (nhập đáp án mẫu để chấm tự động).
    - `ERROR_CORRECTION`: Tìm và sửa lỗi sai trong câu.
    - `REWRITE`: Viết lại câu giữ nguyên nghĩa.
  - **Bộ lọc kho câu hỏi nâng cao**:
    - Lọc theo bài học (`lessonId`).
    - Lọc theo dạng câu hỏi (`questionType`: Tất cả / Trắc nghiệm / Điền từ / Sửa lỗi / Viết lại câu).
    - Lọc theo khoảng số thứ tự câu hỏi (ví dụ: từ câu 1 đến câu 10) giúp giáo viên thao tác hàng loạt nhanh chóng.
  - **Thao tác nhanh trên từng câu hỏi**:
    - Nút **"Đưa vào chung"**: Chỉ hiển thị trên câu hỏi Trắc nghiệm (`MCQ`). Tự động bảo vệ ngân hàng chung không bị lẫn câu tự luận.
    - Nút **"Kiểm tra lớp"**: Tạo bài kiểm tra trực tiếp cho một lớp học cụ thể ngay từ câu hỏi được chọn.
    - Nút **"Sửa"** & **"Lưu trữ / Bật lại"**.
  - **Thao tác hàng loạt (Bulk Actions)**:
    - Chọn nhiều câu hỏi bằng checkbox để đưa vào câu hỏi chung (tự động bỏ qua các câu tự luận kèm thông báo minh bạch).
    - Gom nhóm các câu hỏi đã chọn để tạo đề Kiểm tra trực tiếp cho lớp học.

### 2.3. Hỗ trợ 4 dạng câu hỏi trong Kiểm tra trực tiếp (`LiveClassExam`)
- **Tập tin Frontend**: `source/client/src/components/LiveClassExam.tsx` & `.css`
- **Tập tin Backend**: `source/server/src/main/java/com/grammarquest/service/LiveExamService.java`
- **Tính năng**:
  - Khi giáo viên tạo bài thi trực tiếp từ kho câu hỏi cá nhân, dữ liệu JSON lưu trữ đầy đủ `questionType`, `options` (nếu là MCQ) hoặc `acceptedAnswer` (nếu là tự luận).
  - Giao diện làm bài của học sinh tự động chuyển đổi tương thích:
    - MCQ: 4 nút chọn A/B/C/D.
    - Điền từ / Sửa lỗi / Viết lại câu: Khung `<textarea>` nhập đáp án bằng tiếng Anh.
  - Chấm điểm tự động chuẩn hóa chuỗi (bỏ khoảng trắng thừa, không phân biệt hoa/thường, bỏ dấu chấm câu cuối).

### 2.4. Khóa & Chuẩn hóa Ngân hàng Câu hỏi chung (`TeacherCurriculumPage.tsx`)
- **Tập tin Frontend**: `source/client/src/pages/TeacherCurriculumPage.tsx`
- **Tập tin Backend**: `source/server/src/main/java/com/grammarquest/controller/TeacherCurriculumController.java`
- **Nguyên tắc**: Ngân hàng câu hỏi chung (`owner_id IS NULL`) chỉ dùng cho Lộ trình hành tinh và Đấu trường PvP.
- **Tính năng**:
  - Tab "Câu hỏi chung" khóa importer ở chế độ `commonCurriculumMode={true}`.
  - Form thêm/sửa thủ công chỉ cho phép nhập câu hỏi trắc nghiệm 4 phương án A/B/C/D.
  - Backend `TeacherCurriculumController.validateQuestionType` từ chối mọi yêu cầu thêm câu hỏi tự luận với mã lỗi `ONLY_MCQ_ALLOWED`.
  - Endpoint `promoteCommon` trong `TeacherQuestionController` lọc nghiêm ngặt chỉ sao chép các câu hỏi MCQ.

### 2.5. Bảo vệ tuyệt đối cho Đấu trường PvP và Vượt ải Hành tinh
- **Tập tin**:
  - `source/server/src/main/java/com/grammarquest/controller/ArenaController.java`
  - `source/server/src/main/java/com/grammarquest/service/ArenaMatchmaker.java`
  - `source/server/src/main/java/com/grammarquest/service/LearningService.java`
- **Chi tiết**:
  - `ArenaController`: Query bốc ngẫu nhiên 10 câu cho trận đấu thêm điều kiện `and (question_type is null or question_type='MCQ')`. Khắc phục triệt để lỗi học viên vào đấu trường gặp câu hỏi rỗng phương án.
  - `ArenaMatchmaker`: Kiểm tra điều kiện tìm trận đủ 10 câu trắc nghiệm hợp lệ.
  - `LearningService`: Khi học viên tham gia `PRACTICE`, `LESSON_BOSS`, `CHAPTER_BOSS`, danh sách bốc câu hỏi từ ngân hàng chung được lọc chỉ lấy MCQ. Ngược lại, khi làm bài tập lớp (`startAssignment`), hệ thống vẫn nạp cả 4 dạng câu hỏi của giáo viên.
- **Migration Flyway**:
  - `source/server/src/main/resources/db/migration/V19__curriculum_mcq_only.sql`: Tự động dọn dẹp các câu hỏi tự luận không có chủ sở hữu trong ngân hàng chung.

---

## 3. CÁC API ENDPOINTS MỚI VÀ CẬP NHẬT

| Method | Endpoint | Quyền hạn | Mô tả |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/teacher/questions/batch` | Teacher | Nhập hàng loạt câu hỏi riêng của giáo viên (hỗ trợ cả 4 dạng). |
| `POST` | `/api/v1/teacher/questions/promote-common` | Teacher | Sao chép các câu hỏi trắc nghiệm đã chọn vào ngân hàng câu hỏi chung. |
| `POST` | `/api/v1/teacher/questions/to-live-exam` | Teacher | Tạo bài kiểm tra trực tiếp cho lớp từ danh sách ID câu hỏi (cả 4 dạng). |
| `POST` | `/api/v1/teacher/curriculum/questions/batch` | Teacher | Nhập hàng loạt câu hỏi trắc nghiệm vào ngân hàng lộ trình chung. |
| `GET` | `/api/v1/teacher/curriculum` | Teacher | Trả về danh sách hành tinh, bài học và câu hỏi chung (có `questionType`). |

---

## 4. CHUẨN ĐỊNH DẠNG FILE .TXT

Giáo viên có thể chuẩn bị file `.txt` theo các định dạng sau:

```text
[MCQ]
1. Which sentence is in the present simple tense?
A. She is reading a book.
B. She reads books every day.
C. She has read the book.
D. She will read a book.
Correct: B
Explanation: "Reads" với chủ ngữ "She" biểu thị thói quen hàng ngày.

[FILL_BLANK]
2. If it rains tomorrow, we _____ (stay) at home.
Answer: will stay
Explanation: Câu điều kiện loại 1: Mệnh đề If dùng hiện tại đơn, mệnh đề chính dùng will + V-inf.

[ERROR_CORRECTION]
3. If I had known your number, I would called you yesterday.
Answer: would have called
Explanation: Câu điều kiện loại 3: Mệnh đề chính phải có cấu trúc would have + V3/ed.

[REWRITE]
4. You don't study hard, so you don't pass the exam.
-> If you studied hard, you _____ the exam.
Answer: would pass
Explanation: Viết lại sang câu điều kiện loại 2 diễn tả sự việc trái ngược thực tế ở hiện tại.
```

---

## 5. KẾT QUẢ KIỂM THỬ (TEST VERIFICATION)

- **Frontend Client (`source/client`)**:
  - Lệnh: `npm run build`
  - Kết quả: `tsc -b && vite build` hoàn thành với **0 lỗi, 0 cảnh báo**.
- **Backend Server (`source/server`)**:
  - Lệnh: `.\mvnw.cmd test`
  - Kết quả: **91/91 unit tests PASS (0 failures, 0 errors)**.
  - Bao gồm các test chuyên biệt: `TeacherBatchQuestionTest`, `LiveExamTextQuestionsTest`, `ArenaMatchmakerTest`.
