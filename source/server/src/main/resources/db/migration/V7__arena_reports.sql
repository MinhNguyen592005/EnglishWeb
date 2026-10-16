CREATE TABLE arena_reports (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reporter_id BIGINT NOT NULL,
  message_id BIGINT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  decision VARCHAR(500) NULL,
  decided_by BIGINT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_arena_report_reporter FOREIGN KEY (reporter_id) REFERENCES users(id),
  CONSTRAINT fk_arena_report_message FOREIGN KEY (message_id) REFERENCES arena_messages(id),
  CONSTRAINT fk_arena_report_admin FOREIGN KEY (decided_by) REFERENCES users(id),
  UNIQUE KEY uk_arena_report_once (reporter_id,message_id),
  INDEX ix_arena_report_status (status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
