SET @office_id_column_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'office_id'
);
SET @office_id_migration_sql := IF(
  @office_id_column_exists = 0,
  'ALTER TABLE clients ADD COLUMN office_id CHAR(36) NULL AFTER id',
  'SELECT 1'
);
PREPARE office_id_migration_statement FROM @office_id_migration_sql;
EXECUTE office_id_migration_statement;
DEALLOCATE PREPARE office_id_migration_statement;

INSERT IGNORE INTO offices (id, name) VALUES ('00000000-0000-0000-0000-000000000099', 'JurisPonto Demonstração');
UPDATE clients SET office_id = '00000000-0000-0000-0000-000000000099' WHERE office_id IS NULL;
ALTER TABLE clients MODIFY COLUMN office_id CHAR(36) NOT NULL;

SET @legacy_unique_name_index := (
  SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND INDEX_NAME = 'name' AND NON_UNIQUE = 0
  LIMIT 1
);
SET @drop_legacy_unique_name_sql := IF(
  @legacy_unique_name_index IS NOT NULL,
  CONCAT('ALTER TABLE clients DROP INDEX `', @legacy_unique_name_index, '`'),
  'SELECT 1'
);
PREPARE drop_legacy_unique_name_statement FROM @drop_legacy_unique_name_sql;
EXECUTE drop_legacy_unique_name_statement;
DEALLOCATE PREPARE drop_legacy_unique_name_statement;

SET @office_name_index_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND INDEX_NAME = 'uq_clients_office_name'
);
SET @office_name_index_sql := IF(
  @office_name_index_exists = 0,
  'ALTER TABLE clients ADD UNIQUE KEY uq_clients_office_name (office_id, name)',
  'SELECT 1'
);
PREPARE office_name_index_statement FROM @office_name_index_sql;
EXECUTE office_name_index_statement;
DEALLOCATE PREPARE office_name_index_statement;

SET @office_foreign_key_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND CONSTRAINT_NAME = 'fk_clients_office'
);
SET @office_foreign_key_sql := IF(
  @office_foreign_key_exists = 0,
  'ALTER TABLE clients ADD CONSTRAINT fk_clients_office FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE office_foreign_key_statement FROM @office_foreign_key_sql;
EXECUTE office_foreign_key_statement;
DEALLOCATE PREPARE office_foreign_key_statement;
