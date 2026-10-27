-- Existing users remain exempt. Only the registration endpoint opts new users in.
ALTER TABLE users ADD COLUMN placement_eligible BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE study_entry_questions (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  level_id INT NOT NULL,
  prompt VARCHAR(1000) NOT NULL,
  options_json JSON NOT NULL,
  correct_option CHAR(1) NOT NULL,
  source_question_id VARCHAR(64) NOT NULL UNIQUE,
  CONSTRAINT fk_entry_question_level FOREIGN KEY (level_id) REFERENCES study_levels(id),
  INDEX ix_entry_level (level_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE study_entry_profiles (
  user_id BIGINT NOT NULL PRIMARY KEY,
  status VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED',
  starting_level INT NULL,
  current_level INT NOT NULL DEFAULT 1,
  passed_levels JSON NOT NULL,
  completed_at TIMESTAMP(6) NULL,
  last_lesson_id VARCHAR(20) NULL,
  CONSTRAINT fk_entry_profile_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_entry_last_lesson FOREIGN KEY (last_lesson_id) REFERENCES study_lessons(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE study_entry_attempts (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
  questions_json JSON NOT NULL,
  answers_json JSON NOT NULL,
  correct_count INT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  completed_at TIMESTAMP(6) NULL,
  CONSTRAINT fk_entry_attempt_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
