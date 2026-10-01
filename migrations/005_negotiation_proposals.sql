ALTER TABLE negotiations
  ADD COLUMN IF NOT EXISTS proposal_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS proposal_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS proposal_method TEXT,
  ADD COLUMN IF NOT EXISTS proposal_created_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS negotiations_proposal_status_idx
  ON negotiations (post_id, interested_id, proposal_status);
