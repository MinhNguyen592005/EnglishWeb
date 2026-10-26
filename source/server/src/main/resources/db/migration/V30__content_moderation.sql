ALTER TABLE questions ADD COLUMN admin_blocked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE lessons ADD COLUMN admin_blocked BOOLEAN NOT NULL DEFAULT FALSE;
-- Recover explicit admin decisions without treating teacher archives as admin blocks.
UPDATE questions q JOIN audit_logs a ON a.target_id=q.id AND a.target_type='QUESTION'
SET q.admin_blocked=TRUE
WHERE q.owner_id IS NOT NULL AND a.action='PRIVATE_QUESTION_MODERATE' AND a.detail='active=false'
AND a.id=(SELECT last_action.id FROM (SELECT target_id,MAX(id) AS id FROM audit_logs
    WHERE target_type='QUESTION' AND action IN ('PRIVATE_QUESTION_MODERATE','PRIVATE_QUESTION_ACTIVE') GROUP BY target_id) last_action WHERE last_action.target_id=q.id);
ALTER TABLE study_lessons ADD COLUMN published BOOLEAN NOT NULL DEFAULT TRUE;
CREATE TABLE study_question_blocks (
    lesson_id VARCHAR(20) NOT NULL,
    question_id VARCHAR(64) NOT NULL,
    PRIMARY KEY (lesson_id, question_id),
    FOREIGN KEY (lesson_id) REFERENCES study_lessons(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
