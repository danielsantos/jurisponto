SET @documents_requested_by_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'requested_by_user_id'
);
SET @documents_requested_by_sql := IF(
  @documents_requested_by_exists = 0,
  'ALTER TABLE documents ADD COLUMN requested_by_user_id CHAR(36) NULL AFTER case_id',
  'SELECT 1'
);
PREPARE documents_requested_by_statement FROM @documents_requested_by_sql;
EXECUTE documents_requested_by_statement;
DEALLOCATE PREPARE documents_requested_by_statement;

SET @documents_reviewed_by_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'reviewed_by_user_id'
);
SET @documents_reviewed_by_sql := IF(
  @documents_reviewed_by_exists = 0,
  'ALTER TABLE documents ADD COLUMN reviewed_by_user_id CHAR(36) NULL AFTER requested_by_user_id',
  'SELECT 1'
);
PREPARE documents_reviewed_by_statement FROM @documents_reviewed_by_sql;
EXECUTE documents_reviewed_by_statement;
DEALLOCATE PREPARE documents_reviewed_by_statement;

SET @documents_reviewed_at_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'reviewed_at'
);
SET @documents_reviewed_at_sql := IF(
  @documents_reviewed_at_exists = 0,
  'ALTER TABLE documents ADD COLUMN reviewed_at DATETIME NULL AFTER uploaded_at',
  'SELECT 1'
);
PREPARE documents_reviewed_at_statement FROM @documents_reviewed_at_sql;
EXECUTE documents_reviewed_at_statement;
DEALLOCATE PREPARE documents_reviewed_at_statement;

SET @documents_status_note_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'status_note'
);
SET @documents_status_note_sql := IF(
  @documents_status_note_exists = 0,
  'ALTER TABLE documents ADD COLUMN status_note TEXT NULL AFTER reviewed_at',
  'SELECT 1'
);
PREPARE documents_status_note_statement FROM @documents_status_note_sql;
EXECUTE documents_status_note_statement;
DEALLOCATE PREPARE documents_status_note_statement;

SET @documents_resend_requested_at_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'resend_requested_at'
);
SET @documents_resend_requested_at_sql := IF(
  @documents_resend_requested_at_exists = 0,
  'ALTER TABLE documents ADD COLUMN resend_requested_at DATETIME NULL AFTER status_note',
  'SELECT 1'
);
PREPARE documents_resend_requested_at_statement FROM @documents_resend_requested_at_sql;
EXECUTE documents_resend_requested_at_statement;
DEALLOCATE PREPARE documents_resend_requested_at_statement;

SET @documents_resend_note_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'resend_note'
);
SET @documents_resend_note_sql := IF(
  @documents_resend_note_exists = 0,
  'ALTER TABLE documents ADD COLUMN resend_note TEXT NULL AFTER resend_requested_at',
  'SELECT 1'
);
PREPARE documents_resend_note_statement FROM @documents_resend_note_sql;
EXECUTE documents_resend_note_statement;
DEALLOCATE PREPARE documents_resend_note_statement;

SET @documents_source_template_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'source_template_id'
);
SET @documents_source_template_sql := IF(
  @documents_source_template_exists = 0,
  'ALTER TABLE documents ADD COLUMN source_template_id CHAR(36) NULL AFTER resend_note',
  'SELECT 1'
);
PREPARE documents_source_template_statement FROM @documents_source_template_sql;
EXECUTE documents_source_template_statement;
DEALLOCATE PREPARE documents_source_template_statement;

SET @documents_source_template_item_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'source_template_item_id'
);
SET @documents_source_template_item_sql := IF(
  @documents_source_template_item_exists = 0,
  'ALTER TABLE documents ADD COLUMN source_template_item_id CHAR(36) NULL AFTER source_template_id',
  'SELECT 1'
);
PREPARE documents_source_template_item_statement FROM @documents_source_template_item_sql;
EXECUTE documents_source_template_item_statement;
DEALLOCATE PREPARE documents_source_template_item_statement;

CREATE TABLE IF NOT EXISTS document_checklist_templates (
  id CHAR(36) PRIMARY KEY,
  office_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  service_type VARCHAR(255) NULL,
  description TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_document_templates_office FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE,
  INDEX idx_document_templates_office_name (office_id, name),
  INDEX idx_document_templates_office_service (office_id, service_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS document_checklist_template_items (
  id CHAR(36) PRIMARY KEY,
  template_id CHAR(36) NOT NULL,
  name VARCHAR(500) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_document_template_items_template FOREIGN KEY (template_id) REFERENCES document_checklist_templates(id) ON DELETE CASCADE,
  INDEX idx_document_template_items_template_sort (template_id, sort_order, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @idx_documents_case_status_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND INDEX_NAME = 'idx_documents_case_status_uploaded'
);
SET @idx_documents_case_status_sql := IF(
  @idx_documents_case_status_exists = 0,
  'ALTER TABLE documents ADD INDEX idx_documents_case_status_uploaded (case_id, status, uploaded_at)',
  'SELECT 1'
);
PREPARE idx_documents_case_status_statement FROM @idx_documents_case_status_sql;
EXECUTE idx_documents_case_status_statement;
DEALLOCATE PREPARE idx_documents_case_status_statement;

SET @idx_documents_template_item_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND INDEX_NAME = 'idx_documents_template_item'
);
SET @idx_documents_template_item_sql := IF(
  @idx_documents_template_item_exists = 0,
  'ALTER TABLE documents ADD INDEX idx_documents_template_item (source_template_item_id)',
  'SELECT 1'
);
PREPARE idx_documents_template_item_statement FROM @idx_documents_template_item_sql;
EXECUTE idx_documents_template_item_statement;
DEALLOCATE PREPARE idx_documents_template_item_statement;
