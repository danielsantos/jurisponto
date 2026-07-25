SET @client_id_column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'client_id'
);

SET @add_client_id_sql := IF(
  @client_id_column_exists = 0,
  'ALTER TABLE users ADD COLUMN client_id CHAR(36) NULL AFTER office_id',
  'SELECT 1'
);
PREPARE add_client_id_statement FROM @add_client_id_sql;
EXECUTE add_client_id_statement;
DEALLOCATE PREPARE add_client_id_statement;

SET @role_definition := (
  SELECT COLUMN_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'
);

SET @update_role_enum_sql := IF(
  @role_definition = "enum('admin','lawyer','assistant','client')",
  'SELECT 1',
  'ALTER TABLE users MODIFY COLUMN role ENUM(''admin'', ''lawyer'', ''assistant'', ''client'') NOT NULL DEFAULT ''admin'''
);
PREPARE update_role_enum_statement FROM @update_role_enum_sql;
EXECUTE update_role_enum_statement;
DEALLOCATE PREPARE update_role_enum_statement;

SET @client_id_index_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_client'
);

SET @add_client_id_index_sql := IF(
  @client_id_index_exists = 0,
  'ALTER TABLE users ADD INDEX idx_users_client (client_id)',
  'SELECT 1'
);
PREPARE add_client_id_index_statement FROM @add_client_id_index_sql;
EXECUTE add_client_id_index_statement;
DEALLOCATE PREPARE add_client_id_index_statement;

SET @client_fk_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND CONSTRAINT_NAME = 'fk_users_client'
);

SET @add_client_fk_sql := IF(
  @client_fk_exists = 0,
  'ALTER TABLE users ADD CONSTRAINT fk_users_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE add_client_fk_statement FROM @add_client_fk_sql;
EXECUTE add_client_fk_statement;
DEALLOCATE PREPARE add_client_fk_statement;
