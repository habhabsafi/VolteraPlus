CREATE TABLE admin_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('owner','staff') NOT NULL DEFAULT 'staff',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL DEFAULT NULL
) CHARACTER SET utf8mb4;

CREATE TABLE admin_sessions (
  id CHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  csrf CHAR(32) NOT NULL,
  expires_at DATETIME NOT NULL,
  KEY idx_admin_sessions_user (user_id),
  CONSTRAINT fk_admin_sessions_user FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;
