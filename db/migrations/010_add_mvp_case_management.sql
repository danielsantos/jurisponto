SET @clients_email_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'email'
);
SET @clients_email_sql := IF(
  @clients_email_exists = 0,
  'ALTER TABLE clients ADD COLUMN email VARCHAR(255) NULL AFTER name',
  'SELECT 1'
);
PREPARE clients_email_statement FROM @clients_email_sql;
EXECUTE clients_email_statement;
DEALLOCATE PREPARE clients_email_statement;

SET @clients_phone_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'phone'
);
SET @clients_phone_sql := IF(
  @clients_phone_exists = 0,
  'ALTER TABLE clients ADD COLUMN phone VARCHAR(40) NULL AFTER email',
  'SELECT 1'
);
PREPARE clients_phone_statement FROM @clients_phone_sql;
EXECUTE clients_phone_statement;
DEALLOCATE PREPARE clients_phone_statement;

SET @clients_document_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'document_id'
);
SET @clients_document_sql := IF(
  @clients_document_exists = 0,
  'ALTER TABLE clients ADD COLUMN document_id VARCHAR(40) NULL AFTER phone',
  'SELECT 1'
);
PREPARE clients_document_statement FROM @clients_document_sql;
EXECUTE clients_document_statement;
DEALLOCATE PREPARE clients_document_statement;

SET @clients_notes_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'notes'
);
SET @clients_notes_sql := IF(
  @clients_notes_exists = 0,
  'ALTER TABLE clients ADD COLUMN notes TEXT NULL AFTER document_id',
  'SELECT 1'
);
PREPARE clients_notes_statement FROM @clients_notes_sql;
EXECUTE clients_notes_statement;
DEALLOCATE PREPARE clients_notes_statement;

SET @responsible_user_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cases' AND COLUMN_NAME = 'responsible_user_id'
);
SET @responsible_user_sql := IF(
  @responsible_user_exists = 0,
  'ALTER TABLE cases ADD COLUMN responsible_user_id CHAR(36) NULL AFTER client_id',
  'SELECT 1'
);
PREPARE responsible_user_statement FROM @responsible_user_sql;
EXECUTE responsible_user_statement;
DEALLOCATE PREPARE responsible_user_statement;

SET @case_internal_notes_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cases' AND COLUMN_NAME = 'internal_notes'
);
SET @case_internal_notes_sql := IF(
  @case_internal_notes_exists = 0,
  'ALTER TABLE cases ADD COLUMN internal_notes TEXT NULL AFTER due_date',
  'SELECT 1'
);
PREPARE case_internal_notes_statement FROM @case_internal_notes_sql;
EXECUTE case_internal_notes_statement;
DEALLOCATE PREPARE case_internal_notes_statement;

SET @case_archived_at_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cases' AND COLUMN_NAME = 'archived_at'
);
SET @case_archived_at_sql := IF(
  @case_archived_at_exists = 0,
  'ALTER TABLE cases ADD COLUMN archived_at DATETIME NULL AFTER internal_notes',
  'SELECT 1'
);
PREPARE case_archived_at_statement FROM @case_archived_at_sql;
EXECUTE case_archived_at_statement;
DEALLOCATE PREPARE case_archived_at_statement;

SET @case_archived_by_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cases' AND COLUMN_NAME = 'archived_by_user_id'
);
SET @case_archived_by_sql := IF(
  @case_archived_by_exists = 0,
  'ALTER TABLE cases ADD COLUMN archived_by_user_id CHAR(36) NULL AFTER archived_at',
  'SELECT 1'
);
PREPARE case_archived_by_statement FROM @case_archived_by_sql;
EXECUTE case_archived_by_statement;
DEALLOCATE PREPARE case_archived_by_statement;

CREATE TABLE IF NOT EXISTS case_tasks (
  id CHAR(36) PRIMARY KEY,
  case_id CHAR(36) NOT NULL,
  title VARCHAR(500) NOT NULL,
  due_date DATE NULL,
  is_done TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_case_tasks_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  INDEX idx_case_tasks_case_sort (case_id, sort_order, created_at),
  INDEX idx_case_tasks_case_done (case_id, is_done, due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @idx_cases_responsible_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cases' AND INDEX_NAME = 'idx_cases_responsible_user'
);
SET @idx_cases_responsible_sql := IF(
  @idx_cases_responsible_exists = 0,
  'ALTER TABLE cases ADD INDEX idx_cases_responsible_user (responsible_user_id)',
  'SELECT 1'
);
PREPARE idx_cases_responsible_statement FROM @idx_cases_responsible_sql;
EXECUTE idx_cases_responsible_statement;
DEALLOCATE PREPARE idx_cases_responsible_statement;

SET @idx_cases_archived_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cases' AND INDEX_NAME = 'idx_cases_archived_at'
);
SET @idx_cases_archived_sql := IF(
  @idx_cases_archived_exists = 0,
  'ALTER TABLE cases ADD INDEX idx_cases_archived_at (archived_at)',
  'SELECT 1'
);
PREPARE idx_cases_archived_statement FROM @idx_cases_archived_sql;
EXECUTE idx_cases_archived_statement;
DEALLOCATE PREPARE idx_cases_archived_statement;

SET @idx_clients_email_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND INDEX_NAME = 'idx_clients_email'
);
SET @idx_clients_email_sql := IF(
  @idx_clients_email_exists = 0,
  'ALTER TABLE clients ADD INDEX idx_clients_email (email)',
  'SELECT 1'
);
PREPARE idx_clients_email_statement FROM @idx_clients_email_sql;
EXECUTE idx_clients_email_statement;
DEALLOCATE PREPARE idx_clients_email_statement;

SET @fk_cases_responsible_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cases' AND CONSTRAINT_NAME = 'fk_cases_responsible_user'
);
SET @fk_cases_responsible_sql := IF(
  @fk_cases_responsible_exists = 0,
  'ALTER TABLE cases ADD CONSTRAINT fk_cases_responsible_user FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE fk_cases_responsible_statement FROM @fk_cases_responsible_sql;
EXECUTE fk_cases_responsible_statement;
DEALLOCATE PREPARE fk_cases_responsible_statement;

SET @fk_cases_archived_by_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cases' AND CONSTRAINT_NAME = 'fk_cases_archived_by_user'
);
SET @fk_cases_archived_by_sql := IF(
  @fk_cases_archived_by_exists = 0,
  'ALTER TABLE cases ADD CONSTRAINT fk_cases_archived_by_user FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE fk_cases_archived_by_statement FROM @fk_cases_archived_by_sql;
EXECUTE fk_cases_archived_by_statement;
DEALLOCATE PREPARE fk_cases_archived_by_statement;
