CREATE TABLE users (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  total_xp BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE lessons (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  topic_slug VARCHAR(80) NOT NULL,
  ordinal_no INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  summary VARCHAR(255) NOT NULL,
  theory TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uk_lesson_topic_order (topic_slug, ordinal_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE questions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  lesson_id BIGINT NOT NULL,
  prompt VARCHAR(500) NOT NULL,
  option_a VARCHAR(255) NOT NULL,
  option_b VARCHAR(255) NOT NULL,
  option_c VARCHAR(255) NOT NULL,
  option_d VARCHAR(255) NOT NULL,
  correct_option CHAR(1) NOT NULL,
  explanation TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_question_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id),
  INDEX ix_question_lesson (lesson_id, published)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE attempts (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  lesson_id BIGINT NULL,
  kind VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  required_correct INT NOT NULL,
  total_questions INT NOT NULL,
  correct_count INT NOT NULL DEFAULT 0,
  awarded_xp INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  completed_at TIMESTAMP(6) NULL,
  CONSTRAINT fk_attempt_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_attempt_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id),
  INDEX ix_attempt_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE attempt_items (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  attempt_id BIGINT NOT NULL,
  ordinal_no INT NOT NULL,
  question_id BIGINT NOT NULL,
  prompt VARCHAR(500) NOT NULL,
  option_a VARCHAR(255) NOT NULL,
  option_b VARCHAR(255) NOT NULL,
  option_c VARCHAR(255) NOT NULL,
  option_d VARCHAR(255) NOT NULL,
  correct_option CHAR(1) NOT NULL,
  explanation TEXT NOT NULL,
  answer CHAR(1) NULL,
  answered_at TIMESTAMP(6) NULL,
  CONSTRAINT fk_item_attempt FOREIGN KEY (attempt_id) REFERENCES attempts(id),
  CONSTRAINT fk_item_question FOREIGN KEY (question_id) REFERENCES questions(id),
  UNIQUE KEY uk_attempt_ordinal (attempt_id, ordinal_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE xp_ledger (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  reward_key VARCHAR(160) NOT NULL,
  amount INT NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_xp_user FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY uk_xp_reward (user_id, reward_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
