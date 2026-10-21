CREATE TABLE topics (
  slug VARCHAR(80) NOT NULL PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  description VARCHAR(255) NOT NULL,
  outcome VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL,
  planet_style VARCHAR(20) NOT NULL,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  INDEX ix_topics_order (published, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO topics (slug,title,description,outcome,sort_order,planet_style,published) VALUES
('basic-tenses','Nền tảng các thì','Xác định thời điểm của hành động trước khi ghép câu dài hơn.','Dùng đúng thì hiện tại và quá khứ trong tình huống quen thuộc.',1,'aqua',TRUE),
('conditionals','Câu điều kiện','Từ quy luật có thật đến giả định về hiện tại và quá khứ.','Chọn đúng cấu trúc if theo khả năng xảy ra của sự việc.',2,'violet',TRUE),
('passive-voice','Câu bị động','Đổi trọng tâm câu và chọn đúng dạng be theo thì.','Viết câu bị động ở hiện tại, quá khứ, tương lai và hiện tại hoàn thành.',3,'coral',TRUE),
('relative-clauses','Mệnh đề quan hệ','Nối thông tin về người, vật, nơi chốn và thời gian.','Dùng đúng đại từ quan hệ và dấu phẩy trong câu phức.',4,'gold',TRUE);
