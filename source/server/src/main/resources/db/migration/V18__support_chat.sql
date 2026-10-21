CREATE TABLE support_threads (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE,
  last_message_id BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_support_owner FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX ix_support_updated(updated_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE support_messages (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  thread_id BIGINT NOT NULL,
  sender_id BIGINT NULL,
  sender_type VARCHAR(10) NOT NULL,
  client_message_id VARCHAR(64) NULL,
  body VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_support_thread FOREIGN KEY (thread_id) REFERENCES support_threads(id),
  CONSTRAINT fk_support_sender FOREIGN KEY (sender_id) REFERENCES users(id),
  UNIQUE KEY uk_support_client_message(thread_id,client_message_id),
  INDEX ix_support_history(thread_id,id),
  INDEX ix_support_rate(thread_id,sender_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
