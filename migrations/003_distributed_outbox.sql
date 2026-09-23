ALTER TABLE event_outbox
  ADD COLUMN IF NOT EXISTS locked_by TEXT,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE INDEX IF NOT EXISTS outbox_ready_idx
  ON event_outbox(next_attempt_at, created_at, id)
  WHERE published_at IS NULL;

CREATE INDEX IF NOT EXISTS outbox_lease_idx
  ON event_outbox(locked_until)
  WHERE published_at IS NULL;
