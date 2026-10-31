ALTER TABLE study_modules ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN version INT NOT NULL DEFAULT 1;
ALTER TABLE study_lessons ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE study_module_access (
  user_id BIGINT NOT NULL,
  module_id VARCHAR(30) NOT NULL,
  PRIMARY KEY (user_id,module_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (module_id) REFERENCES study_modules(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE study_module_drafts (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  module_id VARCHAR(30) NOT NULL,
  author_id BIGINT NOT NULL,
  base_version INT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  payload_json JSON NOT NULL,
  review_note VARCHAR(1000) NOT NULL DEFAULT '',
  reviewer_id BIGINT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (author_id) REFERENCES users(id),
  FOREIGN KEY (reviewer_id) REFERENCES users(id),
  INDEX ix_study_draft_author (author_id,status),
  INDEX ix_study_draft_module (module_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE study_module_history (
  module_id VARCHAR(30) NOT NULL,
  version INT NOT NULL,
  payload_json JSON NOT NULL,
  actor_id BIGINT NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (module_id,version),
  FOREIGN KEY (actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
