-- Preserve the exact teacher-selected questions when an assignment is published.
ALTER TABLE assignments ADD COLUMN question_snapshot_json JSON NULL;
