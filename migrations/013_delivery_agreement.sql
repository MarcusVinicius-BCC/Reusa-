ALTER TABLE collection_deliveries ADD COLUMN IF NOT EXISTS proposed_by TEXT REFERENCES users(id);
ALTER TABLE collection_deliveries ADD COLUMN IF NOT EXISTS accepted_by TEXT REFERENCES users(id);
ALTER TABLE collection_deliveries ADD COLUMN IF NOT EXISTS accepted_at TEXT;
ALTER TABLE collection_deliveries ADD COLUMN IF NOT EXISTS received_at TEXT;
ALTER TABLE collection_deliveries ADD COLUMN IF NOT EXISTS payment_attempt_key TEXT;
ALTER TABLE collection_deliveries ADD COLUMN IF NOT EXISTS payment_locked INTEGER NOT NULL DEFAULT 0;

-- Old QR schedules did not record consent from both participants. Reconfirm them.
UPDATE collection_deliveries SET status='cancelled' WHERE proposed_by IS NULL AND status IN ('scheduled','confirmed','in_transit');
