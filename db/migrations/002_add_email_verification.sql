SET @email_verified_column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'email_verified_at'
);
SET @email_verified_migration_sql := IF(
  @email_verified_column_exists = 0,
  'ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL AFTER password_hash',
  'SELECT 1'
);
PREPARE email_verified_migration_statement FROM @email_verified_migration_sql;
EXECUTE email_verified_migration_statement;
DEALLOCATE PREPARE email_verified_migration_statement;

CREATE TABLE IF NOT EXISTS email_verification_codes (
  user_id CHAR(36) PRIMARY KEY,
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_verification_codes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_verification_codes_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;
