CREATE TABLE learner_reports (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reporter_id BIGINT NOT NULL,
  target_id BIGINT NOT NULL,
  context_type VARCHAR(10) NOT NULL,
  context_id BIGINT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  decision VARCHAR(500) NULL,
  decided_by BIGINT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_learner_reporter FOREIGN KEY (reporter_id) REFERENCES users(id),
  CONSTRAINT fk_learner_target FOREIGN KEY (target_id) REFERENCES users(id),
  CONSTRAINT fk_learner_decider FOREIGN KEY (decided_by) REFERENCES users(id),
  INDEX ix_learner_report (reporter_id,target_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
