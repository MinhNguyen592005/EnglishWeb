-- Isolated course data: legacy lessons, attempts, classrooms and arena remain intact.
CREATE TABLE study_levels (
  id INT NOT NULL PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  outcome VARCHAR(500) NOT NULL,
  planet_style VARCHAR(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE study_modules (
  id VARCHAR(30) NOT NULL PRIMARY KEY,
  level_id INT NOT NULL,
  ordinal_no INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  CONSTRAINT fk_study_module_level FOREIGN KEY (level_id) REFERENCES study_levels(id),
  UNIQUE KEY uk_study_module_order (level_id,ordinal_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE study_lessons (
  id VARCHAR(20) NOT NULL PRIMARY KEY,
  module_id VARCHAR(30) NOT NULL,
  ordinal_no INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  content_json JSON NOT NULL,
  questions_json JSON NOT NULL,
  CONSTRAINT fk_study_lesson_module FOREIGN KEY (module_id) REFERENCES study_modules(id),
  UNIQUE KEY uk_study_lesson_order (module_id,ordinal_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE study_enrollments (
  user_id BIGINT NOT NULL PRIMARY KEY,
  CONSTRAINT fk_study_enrollment_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE study_progress (
  user_id BIGINT NOT NULL,
  lesson_id VARCHAR(20) NOT NULL,
  opened_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  completed_at TIMESTAMP(6) NULL,
  PRIMARY KEY (user_id,lesson_id),
  CONSTRAINT fk_study_progress_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_study_progress_lesson FOREIGN KEY (lesson_id) REFERENCES study_lessons(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE study_attempts (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  kind VARCHAR(20) NOT NULL,
  reference_id VARCHAR(30) NOT NULL,
  request_key VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
  required_correct INT NOT NULL,
  questions_json JSON NOT NULL,
  answers_json JSON NOT NULL,
  correct_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  submitted_at TIMESTAMP(6) NULL,
  CONSTRAINT fk_study_attempt_user FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY uk_study_request (user_id,request_key),
  INDEX ix_study_attempt_progress (user_id,kind,reference_id,status),
  INDEX ix_study_attempt_latest (user_id,kind,reference_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
