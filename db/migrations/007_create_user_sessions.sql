CREATE TABLE IF NOT EXISTS user_sessions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  office_id CHAR(36) NOT NULL,
  session_token_hash CHAR(64) NOT NULL,
  session_version INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_sessions_office FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_sessions_token_hash (session_token_hash),
  INDEX idx_user_sessions_user (user_id),
  INDEX idx_user_sessions_office (office_id),
  INDEX idx_user_sessions_expires (expires_at),
  INDEX idx_user_sessions_revoked (revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELETE FROM user_sessions
WHERE revoked_at IS NOT NULL OR expires_at < NOW();
