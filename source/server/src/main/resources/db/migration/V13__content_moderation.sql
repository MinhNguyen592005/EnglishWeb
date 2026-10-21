-- Xóa mềm giữ nguyên FK, lịch sử làm bài và chứng cứ kiểm duyệt.
ALTER TABLE lessons ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE questions ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT FALSE;
