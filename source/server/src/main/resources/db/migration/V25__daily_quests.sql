CREATE TABLE daily_quests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    tier VARCHAR(20) NOT NULL DEFAULT 'EASY',
    title VARCHAR(150) NOT NULL,
    description VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'PRACTICE',
    target_type VARCHAR(50) NOT NULL,
    target_count INT NOT NULL DEFAULT 1,
    reward_xp INT NOT NULL DEFAULT 30,
    icon VARCHAR(50) NOT NULL DEFAULT 'Sparkles',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_daily_quests (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    quest_id INT NOT NULL,
    quest_date DATE NOT NULL,
    current_progress INT NOT NULL DEFAULT 0,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    claimed BOOLEAN NOT NULL DEFAULT FALSE,
    claimed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_udq_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_udq_quest FOREIGN KEY (quest_id) REFERENCES daily_quests(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_quest_date (user_id, quest_id, quest_date),
    INDEX idx_user_date (user_id, quest_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_quest_streaks (
    user_id BIGINT PRIMARY KEY,
    current_streak INT NOT NULL DEFAULT 0,
    longest_streak INT NOT NULL DEFAULT 0,
    last_completed_date DATE NULL,
    milestone_claimed_date DATE NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_uqs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Gói 10 nhiệm vụ mẫu theo 3 tầng độ khó cân bằng
INSERT INTO daily_quests (code, tier, title, description, category, target_type, target_count, reward_xp, icon) VALUES
('PRACTICE_1', 'EASY', 'Khởi động trạm không gian', 'Hoàn thành 1 bài luyện tập ngữ pháp bất kỳ', 'PRACTICE', 'PRACTICE_COUNT', 1, 30, 'BookOpen'),
('CORRECT_5', 'EASY', 'Tia chớp tri thức', 'Trả lời đúng 5 câu hỏi bất kỳ trong ngày', 'PRACTICE', 'CORRECT_COUNT', 5, 30, 'Zap'),
('ARENA_PLAY_1', 'EASY', 'Tinh thần đấu sĩ', 'Tham gia 1 trận đấu trường PvP', 'ARENA', 'ARENA_PLAY', 1, 30, 'Swords'),
('CORRECT_15', 'MEDIUM', 'Kỹ sư ngôn từ', 'Trả lời đúng tổng cộng 15 câu hỏi trong ngày', 'PRACTICE', 'CORRECT_COUNT', 15, 50, 'CheckCircle2'),
('STREAK_CORRECT_5', 'MEDIUM', 'Bắn phá chuẩn xác', 'Trả lời đúng liên tiếp 5 câu trong 1 lượt làm', 'PRACTICE', 'STREAK_CORRECT', 5, 50, 'Sparkles'),
('BOSS_DAMAGE_100', 'MEDIUM', 'Công phá giáp Boss', 'Làm tiêu hao tổng cộng 100 HP của Boss', 'BOSS', 'BOSS_DAMAGE', 100, 50, 'Heart'),
('CLASS_ASSIGNMENT_1', 'MEDIUM', 'Bài tập chuyên cần', 'Hoàn thành 1 bài tập do giáo viên giao trong lớp', 'CLASSROOM', 'CLASS_ASSIGNMENT', 1, 50, 'School'),
('DEFEAT_BOSS_1', 'HARD', 'Hạ gục Robot canh trạm', 'Đánh bại 1 Boss bài học hoặc Boss chương', 'BOSS', 'BOSS_WIN', 1, 70, 'Target'),
('ARENA_WIN_1', 'HARD', 'Vinh quang Đấu trường', 'Giành chiến thắng trong 1 trận đấu trường PvP', 'ARENA', 'ARENA_WIN', 1, 70, 'Trophy'),
('PERFECT_PRACTICE_1', 'HARD', 'Tuyệt đối 100%', 'Đạt điểm tuyệt đối 10/10 trong 1 lượt luyện tập', 'PRACTICE', 'PERFECT_PRACTICE', 1, 70, 'Sparkles');
