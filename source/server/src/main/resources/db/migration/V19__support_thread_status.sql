ALTER TABLE support_threads
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  ADD INDEX ix_support_status_updated(status, updated_at, id);
