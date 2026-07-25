CREATE TABLE IF NOT EXISTS case_updates (
  id CHAR(36) PRIMARY KEY,
  case_id CHAR(36) NOT NULL,
  office_id CHAR(36) NOT NULL,
  author_user_id CHAR(36) NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_case_updates_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_case_updates_office FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE,
  CONSTRAINT fk_case_updates_author FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_case_updates_case_created (case_id, created_at),
  INDEX idx_case_updates_office_created (office_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
