SET @document_file_name_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'file_name'
);

SET @add_document_file_name_sql := IF(
  @document_file_name_exists = 0,
  'ALTER TABLE documents
     ADD COLUMN file_name VARCHAR(500) NULL AFTER name,
     ADD COLUMN file_path VARCHAR(1000) NULL AFTER file_name,
     ADD COLUMN mime_type VARCHAR(255) NULL AFTER file_path,
     ADD COLUMN file_size INT UNSIGNED NULL AFTER mime_type,
     ADD COLUMN uploaded_at DATETIME NULL AFTER last_reminded_at',
  'SELECT 1'
);
PREPARE add_document_file_name_statement FROM @add_document_file_name_sql;
EXECUTE add_document_file_name_statement;
DEALLOCATE PREPARE add_document_file_name_statement;
