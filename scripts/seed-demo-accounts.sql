-- Run against the database used by your local server after Flyway migrations.
-- All three demo accounts use password: 12345678 (stored as BCrypt).
-- Existing usernames are preserved, including passwords, roles and progress.
SET NAMES utf8mb4;
START TRANSACTION;
INSERT INTO users (username, display_name, password_hash, role, locked, placement_eligible)
SELECT demo.username, demo.display_name, demo.password_hash, demo.role, FALSE, FALSE
FROM (
    SELECT 'student1' AS username, 'Học sinh 1' AS display_name,
           '$2a$10$WVdsnCee/rSEhScVkASMCe2fsAqLMOOWmq9aUH/4NzR5x1fchAOje' AS password_hash, 'LEARNER' AS role
    UNION ALL
    SELECT 'teacher1', 'Giáo viên 1', '$2a$10$WVdsnCee/rSEhScVkASMCe2fsAqLMOOWmq9aUH/4NzR5x1fchAOje', 'TEACHER'
    UNION ALL
    SELECT 'admin1', 'Quản trị viên 1', '$2a$10$WVdsnCee/rSEhScVkASMCe2fsAqLMOOWmq9aUH/4NzR5x1fchAOje', 'ADMIN'
) AS demo
WHERE NOT EXISTS (SELECT 1 FROM users existing WHERE existing.username = demo.username);
COMMIT;
SELECT username, display_name, role, locked
FROM users
WHERE username IN ('student1', 'teacher1', 'admin1')
ORDER BY username;
