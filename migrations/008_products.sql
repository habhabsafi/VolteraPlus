CREATE TABLE product_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4;

CREATE TABLE products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(190) NOT NULL UNIQUE,
  category_id INT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  image VARCHAR(190) NOT NULL,
  description MEDIUMTEXT NOT NULL,
  details MEDIUMTEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  published TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_products_category (category_id, published, sort_order),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id)
    REFERENCES product_categories(id) ON DELETE RESTRICT
) CHARACTER SET utf8mb4;

CREATE TABLE product_tags (
  product_id INT UNSIGNED NOT NULL,
  tag VARCHAR(80) NOT NULL,
  PRIMARY KEY (product_id, tag),
  KEY idx_product_tags_tag (tag),
  CONSTRAINT fk_product_tags_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;

CREATE TABLE product_quotes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(40) NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  status ENUM('new','contacted','quoted','won','lost') NOT NULL DEFAULT 'new',
  notes TEXT NOT NULL,
  email_sent TINYINT(1) NOT NULL DEFAULT 0,
  email_error VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_product_quotes_status (status, created_at)
) CHARACTER SET utf8mb4;

CREATE TABLE product_quote_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quote_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NULL,
  product_title VARCHAR(255) NOT NULL,
  product_slug VARCHAR(190) NOT NULL,
  product_image VARCHAR(190) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  KEY idx_product_quote_items_quote (quote_id),
  KEY idx_product_quote_items_product (product_id),
  CONSTRAINT fk_product_quote_items_quote FOREIGN KEY (quote_id)
    REFERENCES product_quotes(id) ON DELETE CASCADE,
  CONSTRAINT fk_product_quote_items_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON DELETE SET NULL
) CHARACTER SET utf8mb4;
