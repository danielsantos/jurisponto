SET @documents_status_definition := (
  SELECT COLUMN_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'documents'
    AND COLUMN_NAME = 'status'
  LIMIT 1
);

SET @documents_status_sql := IF(
  @documents_status_definition = "enum('pending','received','rejected')",
  'SELECT 1',
  "ALTER TABLE documents MODIFY COLUMN status ENUM('pending','received','rejected') NOT NULL DEFAULT 'pending'"
);

PREPARE documents_status_statement FROM @documents_status_sql;
EXECUTE documents_status_statement;
DEALLOCATE PREPARE documents_status_statement;
