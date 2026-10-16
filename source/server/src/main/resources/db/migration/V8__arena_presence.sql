ALTER TABLE arena_rooms
  ADD COLUMN host_seen_at TIMESTAMP(6) NULL,
  ADD COLUMN guest_seen_at TIMESTAMP(6) NULL,
  ADD COLUMN pause_started_at TIMESTAMP(6) NULL,
  ADD COLUMN paused_user_id BIGINT NULL,
  ADD COLUMN state_version BIGINT NOT NULL DEFAULT 0;
