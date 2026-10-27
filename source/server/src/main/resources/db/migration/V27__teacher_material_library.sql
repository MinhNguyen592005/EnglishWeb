CREATE TABLE teacher_materials (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT NOT NULL,
  name VARCHAR(160) NOT NULL,
  description VARCHAR(1000) NOT NULL DEFAULT '',
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_material_teacher FOREIGN KEY (teacher_id) REFERENCES users(id),
  INDEX ix_material_teacher (teacher_id, archived, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE questions MODIFY COLUMN lesson_id BIGINT NULL,
  ADD COLUMN material_id BIGINT NULL,
  ADD COLUMN material_order INT NOT NULL DEFAULT 0,
  ADD CONSTRAINT fk_question_material FOREIGN KEY (material_id) REFERENCES teacher_materials(id);

ALTER TABLE assignments MODIFY COLUMN lesson_id BIGINT NULL,
  ADD COLUMN material_id BIGINT NULL,
  ADD CONSTRAINT fk_assignment_material FOREIGN KEY (material_id) REFERENCES teacher_materials(id);
