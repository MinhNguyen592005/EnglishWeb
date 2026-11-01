# Hướng dẫn đóng góp

## Chọn đúng thư mục

Thư mục gốc chứa `README.md`, `package.json`, `source/`, `scripts/` và `examples/`. Frontend nằm trong `source/client`, backend trong `source/server`, schema chung trong `source/common`.

- Đặt mã React, TypeScript và CSS trong `source/client/src`.
- Đặt kiểm thử giao diện trong `source/client/scripts`; output thử nghiệm ở `source/client/artifacts`.
- Đặt mã Java trong `source/server/src/main/java`; kiểm thử trong `source/server/src/test/java`.
- Thêm thay đổi database bằng migration mới trong `source/server/src/main/resources/db/migration`. Không format hoặc sửa nội dung migration đã áp dụng.
- Giữ script hỗ trợ chạy dự án, dọn output và sinh học liệu trong `scripts/`; dữ liệu nhập mẫu trong `examples/`.

## Cài đặt và kiểm tra

Cần JDK 21, Node.js và MySQL theo [README](README.md). Cài dependency frontend từ thư mục gốc:

```powershell
npm run setup:client
```

Chỉnh định dạng và kiểm tra trước khi commit:

```powershell
npm run format
npm run format:check
npm run build:client
```

Các lệnh format bao phủ TypeScript, TSX, CSS, JSON, HTML, script kiểm thử JavaScript, Java, YAML của backend và tài liệu Markdown ở thư mục gốc. Không format SQL migration, lockfile, dependency, output build hoặc cấu hình cục bộ.

Kiểm thử backend, bắt đầu từ thư mục gốc:

```powershell
cd source/server
.\mvnw.cmd test
```

Trên Linux/macOS dùng `./mvnw test`. Một số test tích hợp cần MySQL và biến bật test riêng; xem README và điều kiện trong lớp test. Ghi rõ những bộ kiểm thử đã chạy khi tạo pull request.

## Làm việc trên branch

Từ thư mục gốc:

```powershell
git fetch origin
git switch -c feature/ten-thay-doi origin/main
```

Sửa code, chạy các kiểm tra phù hợp, rồi chọn đúng các tệp cần đưa vào commit:

```powershell
git status --short
git add <cac-tep-da-sua>
git diff --cached --check
git diff --cached
git commit -m "feat: mo ta thay doi"
git push -u origin feature/ten-thay-doi
```

Tạo pull request về `main`, nêu vấn đề được giải quyết, hành vi sau thay đổi và kết quả kiểm thử. Tách commit chức năng khỏi commit chỉ chỉnh định dạng để dễ xem xét.

Git giữ phần lớn tệp văn bản ở LF; `.cmd` và `.bat` dùng CRLF khi checkout. Quyền thực thi của Maven Wrapper Unix được lưu trong Git.

## Tệp cục bộ

Chỉ đưa cấu hình mẫu vào Git. Điền cấu hình thật trong `source/server/.env.local.ps1` hoặc `.env.local.properties`; những tệp này được bỏ qua. Không thêm `node_modules`, `dist`, `target`, ảnh chụp/log kiểm thử hoặc bản sao lưu vào commit.

Có thể xem trước những output mà script dọn dẹp sẽ xóa:

```powershell
.\scripts\clean.ps1 -WhatIf
```

Chạy `.\scripts\clean.ps1` khi muốn dọn output build. Chỉ thêm `-IncludeTestArtifacts` nếu đã lưu bằng chứng thử nghiệm cần giữ; dừng server đang chạy trước khi dọn `target`.
