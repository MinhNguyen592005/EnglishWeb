CREATE TABLE classrooms (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT NOT NULL,
  name VARCHAR(120) NOT NULL,
  join_code VARCHAR(12) NOT NULL UNIQUE,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_class_teacher FOREIGN KEY (teacher_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE class_members (
  class_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  joined_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (class_id,user_id),
  CONSTRAINT fk_member_class FOREIGN KEY (class_id) REFERENCES classrooms(id),
  CONSTRAINT fk_member_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE assignments (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  class_id BIGINT NOT NULL,
  lesson_id BIGINT NOT NULL,
  title VARCHAR(160) NOT NULL,
  instructions VARCHAR(1000) NOT NULL DEFAULT '',
  pass_percent INT NOT NULL DEFAULT 80,
  due_at TIMESTAMP(6) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED',
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_assignment_class FOREIGN KEY (class_id) REFERENCES classrooms(id),
  CONSTRAINT fk_assignment_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE assignment_attempts (
  assignment_id BIGINT NOT NULL,
  attempt_id BIGINT NOT NULL,
  PRIMARY KEY (assignment_id,attempt_id),
  UNIQUE KEY uk_assignment_attempt (attempt_id),
  CONSTRAINT fk_aa_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id),
  CONSTRAINT fk_aa_attempt FOREIGN KEY (attempt_id) REFERENCES attempts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE class_messages (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  class_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  body VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_message_class FOREIGN KEY (class_id) REFERENCES classrooms(id),
  CONSTRAINT fk_message_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX ix_class_message (class_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE chat_mutes (
  user_id BIGINT NOT NULL PRIMARY KEY,
  expires_at TIMESTAMP(6) NOT NULL,
  CONSTRAINT fk_mute_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE reports (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reporter_id BIGINT NOT NULL,
  message_id BIGINT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  decision VARCHAR(500) NULL,
  decided_by BIGINT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_report_user FOREIGN KEY (reporter_id) REFERENCES users(id),
  CONSTRAINT fk_report_message FOREIGN KEY (message_id) REFERENCES class_messages(id),
  CONSTRAINT fk_report_admin FOREIGN KEY (decided_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE audit_logs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_id BIGINT NOT NULL,
  action VARCHAR(60) NOT NULL,
  target_type VARCHAR(30) NOT NULL,
  target_id BIGINT NOT NULL,
  detail VARCHAR(500) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE arena_rooms (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(12) NOT NULL UNIQUE,
  host_id BIGINT NOT NULL,
  guest_id BIGINT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'WAITING',
  host_ready BOOLEAN NOT NULL DEFAULT FALSE,
  guest_ready BOOLEAN NOT NULL DEFAULT FALSE,
  question_limit INT NOT NULL DEFAULT 10,
  current_round INT NOT NULL DEFAULT 0,
  round_deadline_at TIMESTAMP(6) NULL,
  host_score INT NOT NULL DEFAULT 0,
  guest_score INT NOT NULL DEFAULT 0,
  winner_id BIGINT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_arena_host FOREIGN KEY (host_id) REFERENCES users(id),
  CONSTRAINT fk_arena_guest FOREIGN KEY (guest_id) REFERENCES users(id),
  CONSTRAINT fk_arena_winner FOREIGN KEY (winner_id) REFERENCES users(id),
  INDEX ix_arena_host (host_id,status),
  INDEX ix_arena_guest (guest_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE arena_rounds (
  room_id BIGINT NOT NULL,
  round_no INT NOT NULL,
  question_id BIGINT NOT NULL,
  prompt VARCHAR(500) NOT NULL,
  option_a VARCHAR(255) NOT NULL,
  option_b VARCHAR(255) NOT NULL,
  option_c VARCHAR(255) NOT NULL,
  option_d VARCHAR(255) NOT NULL,
  correct_option CHAR(1) NOT NULL,
  explanation TEXT NOT NULL,
  host_answer CHAR(1) NULL,
  guest_answer CHAR(1) NULL,
  host_answered_at TIMESTAMP(6) NULL,
  guest_answered_at TIMESTAMP(6) NULL,
  started_at TIMESTAMP(6) NULL,
  closed BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (room_id,round_no),
  CONSTRAINT fk_round_room FOREIGN KEY (room_id) REFERENCES arena_rooms(id),
  CONSTRAINT fk_round_question FOREIGN KEY (question_id) REFERENCES questions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
