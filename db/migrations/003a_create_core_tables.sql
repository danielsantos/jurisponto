-- Schema-base das entidades centrais.
-- Esta migration precisa ser executada antes de qualquer migration que altere
-- clients, cases ou documents em bancos criados do zero.

CREATE TABLE IF NOT EXISTS clients (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  avatar_color VARCHAR(20) NOT NULL DEFAULT '#a8c6b3',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cases (
  id CHAR(36) PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  title VARCHAR(500) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'Aguardando cliente',
  status_key ENUM('waiting', 'review', 'done') NOT NULL DEFAULT 'waiting',
  due_date DATE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cases_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
  INDEX idx_cases_client (client_id),
  INDEX idx_cases_due_date (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS documents (
  id CHAR(36) PRIMARY KEY,
  case_id CHAR(36) NOT NULL,
  name VARCHAR(500) NOT NULL,
  status ENUM('pending', 'received') NOT NULL DEFAULT 'pending',
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_reminded_at DATETIME NULL,
  CONSTRAINT fk_documents_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  INDEX idx_documents_case (case_id),
  INDEX idx_documents_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
