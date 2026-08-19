CREATE TABLE IF NOT EXISTS document_upload_links (
  id CHAR(36) PRIMARY KEY,
  document_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_document_upload_links_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  UNIQUE KEY uq_document_upload_links_token_hash (token_hash),
  INDEX idx_document_upload_links_document_active (document_id, used_at, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
