-- Cover the batched completed-lessons lookup without loading full attempts.
CREATE INDEX ix_attempt_progress ON attempts(user_id,status,kind,lesson_id);
-- Published lesson listing is used by roadmap and unlock checks.
CREATE INDEX ix_lesson_published_order ON lessons(published,ordinal_no);
