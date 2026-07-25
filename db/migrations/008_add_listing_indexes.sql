SET @idx_cases_client_created_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cases' AND INDEX_NAME = 'idx_cases_client_created'
);
SET @idx_cases_client_created_sql := IF(
  @idx_cases_client_created_exists = 0,
  'ALTER TABLE cases ADD INDEX idx_cases_client_created (client_id, created_at)',
  'SELECT 1'
);
PREPARE idx_cases_client_created_statement FROM @idx_cases_client_created_sql;
EXECUTE idx_cases_client_created_statement;
DEALLOCATE PREPARE idx_cases_client_created_statement;

SET @idx_cases_status_created_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cases' AND INDEX_NAME = 'idx_cases_status_created'
);
SET @idx_cases_status_created_sql := IF(
  @idx_cases_status_created_exists = 0,
  'ALTER TABLE cases ADD INDEX idx_cases_status_created (status_key, created_at)',
  'SELECT 1'
);
PREPARE idx_cases_status_created_statement FROM @idx_cases_status_created_sql;
EXECUTE idx_cases_status_created_statement;
DEALLOCATE PREPARE idx_cases_status_created_statement;

SET @idx_cases_title_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cases' AND INDEX_NAME = 'idx_cases_title'
);
SET @idx_cases_title_sql := IF(
  @idx_cases_title_exists = 0,
  'ALTER TABLE cases ADD INDEX idx_cases_title (title(191))',
  'SELECT 1'
);
PREPARE idx_cases_title_statement FROM @idx_cases_title_sql;
EXECUTE idx_cases_title_statement;
DEALLOCATE PREPARE idx_cases_title_statement;

SET @idx_documents_case_requested_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND INDEX_NAME = 'idx_documents_case_requested'
);
SET @idx_documents_case_requested_sql := IF(
  @idx_documents_case_requested_exists = 0,
  'ALTER TABLE documents ADD INDEX idx_documents_case_requested (case_id, requested_at)',
  'SELECT 1'
);
PREPARE idx_documents_case_requested_statement FROM @idx_documents_case_requested_sql;
EXECUTE idx_documents_case_requested_statement;
DEALLOCATE PREPARE idx_documents_case_requested_statement;

SET @idx_documents_status_requested_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND INDEX_NAME = 'idx_documents_status_requested'
);
SET @idx_documents_status_requested_sql := IF(
  @idx_documents_status_requested_exists = 0,
  'ALTER TABLE documents ADD INDEX idx_documents_status_requested (status, requested_at)',
  'SELECT 1'
);
PREPARE idx_documents_status_requested_statement FROM @idx_documents_status_requested_sql;
EXECUTE idx_documents_status_requested_statement;
DEALLOCATE PREPARE idx_documents_status_requested_statement;

SET @idx_documents_name_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND INDEX_NAME = 'idx_documents_name'
);
SET @idx_documents_name_sql := IF(
  @idx_documents_name_exists = 0,
  'ALTER TABLE documents ADD INDEX idx_documents_name (name(191))',
  'SELECT 1'
);
PREPARE idx_documents_name_statement FROM @idx_documents_name_sql;
EXECUTE idx_documents_name_statement;
DEALLOCATE PREPARE idx_documents_name_statement;

SET @idx_users_office_role_created_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_office_role_created'
);
SET @idx_users_office_role_created_sql := IF(
  @idx_users_office_role_created_exists = 0,
  'ALTER TABLE users ADD INDEX idx_users_office_role_created (office_id, role, created_at)',
  'SELECT 1'
);
PREPARE idx_users_office_role_created_statement FROM @idx_users_office_role_created_sql;
EXECUTE idx_users_office_role_created_statement;
DEALLOCATE PREPARE idx_users_office_role_created_statement;

SET @idx_users_office_verified_created_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_office_verified_created'
);
SET @idx_users_office_verified_created_sql := IF(
  @idx_users_office_verified_created_exists = 0,
  'ALTER TABLE users ADD INDEX idx_users_office_verified_created (office_id, email_verified_at, created_at)',
  'SELECT 1'
);
PREPARE idx_users_office_verified_created_statement FROM @idx_users_office_verified_created_sql;
EXECUTE idx_users_office_verified_created_statement;
DEALLOCATE PREPARE idx_users_office_verified_created_statement;

SET @idx_users_full_name_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_full_name'
);
SET @idx_users_full_name_sql := IF(
  @idx_users_full_name_exists = 0,
  'ALTER TABLE users ADD INDEX idx_users_full_name (full_name(191))',
  'SELECT 1'
);
PREPARE idx_users_full_name_statement FROM @idx_users_full_name_sql;
EXECUTE idx_users_full_name_statement;
DEALLOCATE PREPARE idx_users_full_name_statement;
