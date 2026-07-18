CREATE TABLE clients (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  avatar_color VARCHAR(20) NOT NULL DEFAULT '#a8c6b3',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cases (
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

CREATE TABLE documents (
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

INSERT INTO clients (id, name, avatar_color) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Mariana Almeida', '#c7a86b'),
  ('00000000-0000-0000-0000-000000000002', 'Ricardo Lima', '#96b7c9'),
  ('00000000-0000-0000-0000-000000000003', 'Sofia Martins', '#c2adcf'),
  ('00000000-0000-0000-0000-000000000004', 'Carlos Eduardo', '#b9caab'),
  ('00000000-0000-0000-0000-000000000005', 'Juliana Ferreira', '#d7ae9e');

INSERT INTO cases (id, client_id, title, status, status_key, due_date) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Ação de divórcio consensual', 'Aguardando cliente', 'waiting', '2026-07-22'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Revisão de contrato de locação', 'Em análise', 'review', '2026-07-24'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'Inventário extrajudicial', 'Aguardando cliente', 'waiting', '2026-07-29'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', 'Rescisão contratual', 'Concluído', 'done', NULL),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005', 'Acordo trabalhista', 'Em análise', 'review', '2026-07-31');

INSERT INTO documents (id, case_id, name, status, requested_at) VALUES
  (UUID(), '10000000-0000-0000-0000-000000000001', 'Comprovante de residência', 'pending', NOW() - INTERVAL 4 DAY),
  (UUID(), '10000000-0000-0000-0000-000000000001', 'RG e CPF', 'received', NOW()),
  (UUID(), '10000000-0000-0000-0000-000000000001', 'Certidão de casamento', 'received', NOW()),
  (UUID(), '10000000-0000-0000-0000-000000000001', 'Comprovante de renda', 'pending', NOW()),
  (UUID(), '10000000-0000-0000-0000-000000000002', 'Contrato de locação assinado', 'pending', NOW() - INTERVAL 2 DAY),
  (UUID(), '10000000-0000-0000-0000-000000000002', 'Laudo de vistoria', 'received', NOW()),
  (UUID(), '10000000-0000-0000-0000-000000000002', 'Comprovante de pagamento', 'received', NOW()),
  (UUID(), '10000000-0000-0000-0000-000000000003', 'Certidão de casamento atualizada', 'pending', NOW()),
  (UUID(), '10000000-0000-0000-0000-000000000003', 'Certidão de óbito', 'received', NOW()),
  (UUID(), '10000000-0000-0000-0000-000000000003', 'Documento dos herdeiros', 'received', NOW()),
  (UUID(), '10000000-0000-0000-0000-000000000004', 'Termo de rescisão', 'received', NOW()),
  (UUID(), '10000000-0000-0000-0000-000000000005', 'Contrato de trabalho', 'received', NOW());
