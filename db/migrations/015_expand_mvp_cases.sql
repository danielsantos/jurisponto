-- Estrutura de casos do MVP: dados juridicos essenciais e encerramento formal.
ALTER TABLE cases
  ADD COLUMN legal_area VARCHAR(120) NULL AFTER title,
  ADD COLUMN case_description TEXT NULL AFTER legal_area,
  ADD COLUMN opposing_party VARCHAR(255) NULL AFTER case_description,
  ADD COLUMN process_number VARCHAR(100) NULL AFTER opposing_party,
  ADD COLUMN closed_at DATE NULL AFTER archived_by_user_id,
  ADD COLUMN closure_result VARCHAR(500) NULL AFTER closed_at,
  ADD COLUMN closure_notes TEXT NULL AFTER closure_result,
  ADD COLUMN closure_reason VARCHAR(255) NULL AFTER closure_notes,
  ADD COLUMN closure_financial_status ENUM('pending', 'settled', 'unknown') NULL AFTER closure_reason;

-- Mantem os registros antigos utilizaveis com os novos status simples.
ALTER TABLE cases MODIFY COLUMN status_key ENUM('waiting', 'review', 'done', 'analysis', 'active', 'closed') NOT NULL DEFAULT 'analysis';
UPDATE cases
SET status_key = CASE status_key
  WHEN 'review' THEN 'analysis'
  WHEN 'done' THEN 'closed'
  ELSE 'waiting'
END;
ALTER TABLE cases MODIFY COLUMN status_key ENUM('analysis', 'active', 'waiting', 'closed') NOT NULL DEFAULT 'analysis';
UPDATE cases
SET status = CASE status_key
  WHEN 'analysis' THEN 'Em analise'
  WHEN 'active' THEN 'Em andamento'
  WHEN 'closed' THEN 'Encerrado'
  ELSE 'Aguardando'
END;

CREATE INDEX idx_cases_process_number ON cases (process_number);
