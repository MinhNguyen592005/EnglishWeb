-- 1. Bổ sung thông tin ELO, thành tích PvP, giới hạn từ chối và vật phẩm cosmetic trang bị trên bảng users
ALTER TABLE users
  ADD COLUMN pvp_elo INT NOT NULL DEFAULT 1000,
  ADD COLUMN pvp_peak_elo INT NOT NULL DEFAULT 1000,
  ADD COLUMN pvp_wins INT NOT NULL DEFAULT 0,
  ADD COLUMN pvp_losses INT NOT NULL DEFAULT 0,
  ADD COLUMN pvp_draws INT NOT NULL DEFAULT 0,
  ADD COLUMN pvp_win_streak INT NOT NULL DEFAULT 0,
  ADD COLUMN pvp_best_win_streak INT NOT NULL DEFAULT 0,
  ADD COLUMN pvp_decline_count INT NOT NULL DEFAULT 0,
  ADD COLUMN pvp_ban_until TIMESTAMP(6) NULL,
  ADD COLUMN equipped_frame VARCHAR(50) NOT NULL DEFAULT 'FRAME_DEFAULT',
  ADD COLUMN equipped_badge VARCHAR(50) NULL,
  ADD INDEX ix_users_pvp_elo (role, pvp_elo DESC, pvp_wins DESC);

-- 2. Bổ sung trạng thái xác nhận trận, đếm ngược, giới hạn thời gian toàn trận và lịch sử biến động ELO trên arena_rooms
ALTER TABLE arena_rooms
  ADD COLUMN is_matchmade BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN confirm_deadline_at TIMESTAMP(6) NULL,
  ADD COLUMN countdown_until TIMESTAMP(6) NULL,
  ADD COLUMN match_deadline_at TIMESTAMP(6) NULL,
  ADD COLUMN host_elo_before INT NOT NULL DEFAULT 1000,
  ADD COLUMN guest_elo_before INT NOT NULL DEFAULT 1000,
  ADD COLUMN host_elo_change INT NOT NULL DEFAULT 0,
  ADD COLUMN guest_elo_change INT NOT NULL DEFAULT 0,
  ADD COLUMN result_type VARCHAR(30) NULL,
  ADD COLUMN cancel_reason VARCHAR(60) NULL,
  ADD COLUMN elo_settled BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Bảng danh mục vật phẩm Cosmetic PvP (Khung Avatar & Huy hiệu theo Rank / Thành tích)
CREATE TABLE pvp_cosmetics (
  code VARCHAR(50) NOT NULL PRIMARY KEY,
  type VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  unlock_type VARCHAR(30) NOT NULL,
  unlock_threshold INT NOT NULL DEFAULT 0,
  rank_tier VARCHAR(20) NULL,
  css_class VARCHAR(60) NOT NULL,
  icon VARCHAR(50) NOT NULL DEFAULT 'Award',
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Bảng lưu trữ vật phẩm Cosmetic người chơi đã mở khóa
CREATE TABLE user_cosmetics (
  user_id BIGINT NOT NULL,
  cosmetic_code VARCHAR(50) NOT NULL,
  unlocked_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id, cosmetic_code),
  CONSTRAINT fk_uc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_uc_cosmetic FOREIGN KEY (cosmetic_code) REFERENCES pvp_cosmetics(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Seed danh mục Khung Avatar (FRAME) và Huy hiệu (BADGE)
INSERT INTO pvp_cosmetics (code, type, name, description, unlock_type, unlock_threshold, rank_tier, css_class, icon, sort_order) VALUES
('FRAME_DEFAULT', 'FRAME', 'Khung Tân Binh Không Gian', 'Khung avatar mặc định dành cho mọi phi hành gia.', 'DEFAULT', 0, NULL, 'frame-default', 'Shield', 1),
('FRAME_BRONZE', 'FRAME', 'Khung Đồng Tinh Vân', 'Mở khóa khi đạt phân hạng Đồng (1000+ ELO).', 'ELO_PEAK', 1000, 'BRONZE', 'frame-bronze', 'Shield', 2),
('FRAME_SILVER', 'FRAME', 'Khung Bạc Ngân Hà', 'Mở khóa khi đạt phân hạng Bạc (1100+ ELO).', 'ELO_PEAK', 1100, 'SILVER', 'frame-silver', 'Shield', 3),
('FRAME_GOLD', 'FRAME', 'Khung Vàng Thái Dương', 'Mở khóa khi đạt phân hạng Vàng (1300+ ELO).', 'ELO_PEAK', 1300, 'GOLD', 'frame-gold', 'Crown', 4),
('FRAME_PLATINUM', 'FRAME', 'Khung Bạch Kim Tinh Tú', 'Mở khóa khi đạt phân hạng Bạch Kim (1500+ ELO).', 'ELO_PEAK', 1500, 'PLATINUM', 'frame-platinum', 'Sparkles', 5),
('FRAME_DIAMOND', 'FRAME', 'Khung Kim Cương Vũ Trụ', 'Mở khóa khi đạt phân hạng Kim Cương (1700+ ELO).', 'ELO_PEAK', 1700, 'DIAMOND', 'frame-diamond', 'Gem', 6),
('FRAME_MASTER', 'FRAME', 'Khung Cao Thủ Siêu Tân Tinh', 'Mở khóa khi đạt phân hạng Cao Thủ (2000+ ELO).', 'ELO_PEAK', 2000, 'MASTER', 'frame-master', 'Flame', 7),
('FRAME_STREAK_5', 'FRAME', 'Khung Hỏa Chiến Bất Bại', 'Thành tích: Đạt chuỗi thắng 5 trận PvP liên tiếp.', 'WIN_STREAK', 5, NULL, 'frame-streak', 'Flame', 8),

('BADGE_BRONZE', 'BADGE', 'Tân Binh Đấu Trường', 'Huy hiệu khởi đầu của đấu sĩ hạng Đồng (1000+ ELO).', 'ELO_PEAK', 1000, 'BRONZE', 'badge-bronze', 'Award', 11),
('BADGE_FIRST_WIN', 'BADGE', 'Chiến Thắng Đầu Tiên', 'Thành tích: Giành chiến thắng trận PvP đầu tiên.', 'PVP_WINS', 1, NULL, 'badge-first-win', 'Swords', 12),
('BADGE_STREAK_3', 'BADGE', 'Chuỗi Thắng Bất Bại', 'Thành tích: Thắng liên tiếp 3 trận PvP.', 'WIN_STREAK', 3, NULL, 'badge-streak-3', 'Flame', 13),
('BADGE_VETERAN_5', 'BADGE', 'Chiến Binh Chuyên Cần', 'Thành tích: Hoàn thành 5 trận đấu PvP.', 'MATCHES_PLAYED', 5, NULL, 'badge-veteran', 'Target', 14),
('BADGE_GLADIATOR_10', 'BADGE', 'Đấu Sĩ Không Gian', 'Thành tích: Giành chiến thắng 10 trận PvP.', 'PVP_WINS', 10, NULL, 'badge-gladiator', 'Trophy', 15),
('BADGE_SILVER', 'BADGE', 'Chiến Binh Bạc', 'Mở khóa khi đạt phân hạng Bạc (1100+ ELO).', 'ELO_PEAK', 1100, 'SILVER', 'badge-silver', 'Award', 16),
('BADGE_GOLD', 'BADGE', 'Kỵ Sĩ Vàng', 'Mở khóa khi đạt phân hạng Vàng (1300+ ELO).', 'ELO_PEAK', 1300, 'GOLD', 'badge-gold', 'Crown', 17),
('BADGE_PLATINUM', 'BADGE', 'Thủ Lĩnh Bạch Kim', 'Mở khóa khi đạt phân hạng Bạch Kim (1500+ ELO).', 'ELO_PEAK', 1500, 'PLATINUM', 'badge-platinum', 'Sparkles', 18),
('BADGE_DIAMOND', 'BADGE', 'Bá Chủ Kim Cương', 'Mở khóa khi đạt phân hạng Kim Cương (1700+ ELO).', 'ELO_PEAK', 1700, 'DIAMOND', 'badge-diamond', 'Gem', 19),
('BADGE_MASTER', 'BADGE', 'Huyền Thoại Cao Thủ', 'Mở khóa khi đạt phân hạng Cao Thủ (2000+ ELO).', 'ELO_PEAK', 2000, 'MASTER', 'badge-master', 'Crown', 20);
