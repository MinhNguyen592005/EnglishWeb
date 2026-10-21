CREATE TABLE class_exams (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  class_id BIGINT NOT NULL,
  title VARCHAR(160) NOT NULL,
  questions_json JSON NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  revision BIGINT NOT NULL DEFAULT 1,
  closed BOOLEAN NOT NULL DEFAULT FALSE,
  ends_at TIMESTAMP(6) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_exam_class FOREIGN KEY (class_id) REFERENCES classrooms(id),
  INDEX ix_exam_class (class_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE class_exam_submissions (
  exam_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  answers_json JSON NOT NULL,
  correct_count INT NOT NULL DEFAULT 0,
  answered_count INT NOT NULL DEFAULT 0,
  submitted BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (exam_id,user_id),
  CONSTRAINT fk_exam_submission_exam FOREIGN KEY (exam_id) REFERENCES class_exams(id),
  CONSTRAINT fk_exam_submission_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
