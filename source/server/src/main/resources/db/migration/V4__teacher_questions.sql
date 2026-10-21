ALTER TABLE questions
  ADD COLUMN owner_id BIGINT NULL,
  ADD COLUMN teacher_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD CONSTRAINT fk_question_owner FOREIGN KEY (owner_id) REFERENCES users(id),
  ADD INDEX ix_question_owner_lesson (owner_id,lesson_id);
