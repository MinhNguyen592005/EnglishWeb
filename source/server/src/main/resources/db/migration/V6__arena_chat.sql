CREATE TABLE arena_messages (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  room_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  body VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_arena_message_room FOREIGN KEY (room_id) REFERENCES arena_rooms(id),
  CONSTRAINT fk_arena_message_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX ix_arena_message_room (room_id,id),
  INDEX ix_arena_message_user_time (user_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
