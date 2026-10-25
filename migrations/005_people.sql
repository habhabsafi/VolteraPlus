CREATE TABLE people (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  role VARCHAR(150) NOT NULL,
  headline VARCHAR(190) NOT NULL,
  bio TEXT NOT NULL,
  img VARCHAR(190) NOT NULL,
  highlights LONGTEXT NOT NULL,
  badge_img VARCHAR(190) NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  published TINYINT(1) NOT NULL DEFAULT 1,
  KEY idx_people_published_order (published, sort_order, id)
) CHARACTER SET utf8mb4;
