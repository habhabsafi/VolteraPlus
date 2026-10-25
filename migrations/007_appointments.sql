CREATE TABLE appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  access_token_hash CHAR(64) NOT NULL UNIQUE,
  access_token_encrypted TEXT NOT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  service VARCHAR(190) NOT NULL,
  details TEXT NOT NULL,
  address VARCHAR(500) NOT NULL,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  proposed_date DATE NULL,
  proposed_start_time TIME NULL,
  status ENUM('pending','confirmed','rejected','cancelled') NOT NULL DEFAULT 'pending',
  internal_notes TEXT NOT NULL,
  email_error VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_appointments_date (appointment_date, start_time),
  KEY idx_appointments_status (status, appointment_date),
  CONSTRAINT chk_appointment_proposal CHECK (
    (proposed_date IS NULL AND proposed_start_time IS NULL)
    OR (proposed_date IS NOT NULL AND proposed_start_time IS NOT NULL)
  )
) CHARACTER SET utf8mb4;

CREATE TABLE appointment_slot_reservations (
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  appointment_id INT NOT NULL,
  reservation_type ENUM('current','proposed') NOT NULL,
  PRIMARY KEY (appointment_date, start_time),
  KEY idx_appointment_reservations_id (appointment_id),
  CONSTRAINT fk_appointment_reservations_appointment FOREIGN KEY (appointment_id)
    REFERENCES appointments(id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;

CREATE TABLE appointment_blocks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason VARCHAR(255) NOT NULL DEFAULT 'Unavailable',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_appointment_blocks_dates (start_date, end_date)
) CHARACTER SET utf8mb4;

CREATE TABLE appointment_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL,
  mime VARCHAR(40) NOT NULL,
  data LONGBLOB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_appointment_attachments_appointment (appointment_id),
  CONSTRAINT fk_appointment_attachments_appointment FOREIGN KEY (appointment_id)
    REFERENCES appointments(id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;
