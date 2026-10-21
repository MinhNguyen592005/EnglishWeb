# Sao chép file này thành .env.local.ps1 và điền tài khoản MySQL của riêng dự án.
# Chạy server bằng .\run-local.ps1; Spring Boot không tự đọc file cấu hình PowerShell.
$env:DB_HOST = 'localhost'
$env:DB_PORT = '3306'
$env:DB_NAME = 'grammar_quest'
$env:DB_USERNAME = '<tài khoản MySQL>'
$env:DB_PASSWORD = '<mật khẩu MySQL>'
$env:SPRING_PROFILES_ACTIVE = 'dev'
$env:CLIENT_ORIGIN = 'http://127.0.0.1:5173'
# Tùy chọn: tạo bốn tài khoản demo lần đầu khởi động.
# $env:APP_SEED_DEMO = 'true'
# $env:DEMO_PASSWORD = '<mật khẩu demo riêng, ít nhất 8 ký tự>'
