-- Retain reward history; classroom assignments no longer belong to daily quests.
UPDATE daily_quests SET active = FALSE
WHERE category = 'CLASSROOM' OR target_type = 'CLASS_ASSIGNMENT';
