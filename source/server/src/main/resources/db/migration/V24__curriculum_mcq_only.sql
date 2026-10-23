-- Ensure common questions bank (owner_id IS NULL) strictly contains MCQ only for roadmap planets & PvP
DELETE FROM questions WHERE owner_id IS NULL AND question_type IS NOT NULL AND question_type != 'MCQ';
