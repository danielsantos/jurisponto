ALTER TABLE case_updates
  ADD COLUMN event_type ENUM('note', 'client_contact', 'hearing', 'document', 'payment', 'decision') NOT NULL DEFAULT 'note' AFTER author_user_id,
  ADD COLUMN is_automatic TINYINT(1) NOT NULL DEFAULT 0 AFTER event_type,
  ADD COLUMN client_visible TINYINT(1) NOT NULL DEFAULT 1 AFTER is_automatic;

CREATE INDEX idx_case_updates_timeline_type ON case_updates (case_id, event_type, created_at);
