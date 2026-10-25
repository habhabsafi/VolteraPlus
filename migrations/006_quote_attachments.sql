CREATE TABLE quote_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quote_id INT NOT NULL,
  mime VARCHAR(40) NOT NULL,
  data LONGBLOB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_quote_attachments_quote (quote_id),
  CONSTRAINT fk_quote_attachments_quote FOREIGN KEY (quote_id)
    REFERENCES quote_requests(id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;
