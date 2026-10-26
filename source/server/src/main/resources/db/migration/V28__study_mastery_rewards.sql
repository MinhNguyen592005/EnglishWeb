-- Keep historical completions and balances; new submissions follow the mastery rule.
ALTER TABLE study_attempts ADD COLUMN awarded_xp INT NOT NULL DEFAULT 0;
CREATE TABLE study_module_mastery (
  user_id BIGINT NOT NULL,
  module_id VARCHAR(30) NOT NULL,
  passed_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY(user_id,module_id),
  CONSTRAINT fk_mastery_user FOREIGN KEY(user_id) REFERENCES users(id),
  CONSTRAINT fk_mastery_module FOREIGN KEY(module_id) REFERENCES study_modules(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO study_module_mastery(user_id,module_id)
SELECT p.user_id,l.module_id FROM study_progress p JOIN study_lessons l ON l.id=p.lesson_id
GROUP BY p.user_id,l.module_id
HAVING count(p.completed_at)=(SELECT count(*) FROM study_lessons all_lessons WHERE all_lessons.module_id=l.module_id);

-- Mandatory daily quests can all be completed through individual study.
UPDATE daily_quests SET active=false WHERE target_type IN ('ARENA_PLAY','ARENA_WIN','BOSS_DAMAGE','BOSS_WIN','CLASS_ASSIGNMENT');
-- Already allocated quests remain achievable on the day this migration is applied.
UPDATE daily_quests SET target_type='QUALITY_STUDY',target_count=1,category='PRACTICE',title='Củng cố kiến thức',description='Đạt ít nhất 80% trong một bài học, ôn tập hoặc kiểm tra' WHERE active=false AND target_type IN ('ARENA_PLAY','ARENA_WIN','BOSS_DAMAGE','BOSS_WIN','CLASS_ASSIGNMENT');
UPDATE daily_quests SET reward_xp=CASE tier WHEN 'EASY' THEN 20 WHEN 'MEDIUM' THEN 30 ELSE 50 END;
INSERT INTO daily_quests(code,tier,title,description,category,target_type,target_count,reward_xp,icon)
VALUES ('QUALITY_STUDY_1','HARD','Học chắc mỗi ngày','Đạt ít nhất 80% trong một bài học, ôn tập hoặc kiểm tra','PRACTICE','QUALITY_STUDY',1,50,'Target');
