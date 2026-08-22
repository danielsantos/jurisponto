CREATE TABLE IF NOT EXISTS user_privacy_acceptances (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  privacy_policy_version VARCHAR(50) NOT NULL,
  terms_version VARCHAR(50) NOT NULL,
  accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  CONSTRAINT fk_privacy_acceptance_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_privacy_acceptance_user_date (user_id, accepted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS privacy_requests (
  id CHAR(36) PRIMARY KEY,
  office_id CHAR(36) NULL,
  requester_user_id CHAR(36) NULL,
  requester_name VARCHAR(255) NULL,
  requester_email VARCHAR(255) NOT NULL,
  request_type ENUM('access', 'correction', 'deletion', 'information', 'office_deletion') NOT NULL,
  message TEXT NULL,
  status ENUM('received', 'in_review', 'completed', 'rejected') NOT NULL DEFAULT 'received',
  response_note TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  CONSTRAINT fk_privacy_request_office FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE SET NULL,
  CONSTRAINT fk_privacy_request_user FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_privacy_request_email_created (requester_email, created_at),
  INDEX idx_privacy_request_office_status (office_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
