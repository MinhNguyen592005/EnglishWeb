-- Preserve the full 500-character admin note plus the action prefix.
ALTER TABLE reports MODIFY COLUMN decision VARCHAR(600) NULL;
ALTER TABLE arena_reports MODIFY COLUMN decision VARCHAR(600) NULL;
ALTER TABLE learner_reports MODIFY COLUMN decision VARCHAR(600) NULL;
