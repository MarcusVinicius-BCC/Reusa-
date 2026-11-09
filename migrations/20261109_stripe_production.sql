ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_live_account_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_test_account_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_status_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_checked_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_live_account_idx ON users(stripe_live_account_id) WHERE stripe_live_account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_test_account_idx ON users(stripe_test_account_id) WHERE stripe_test_account_id IS NOT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_account_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_payment_intent TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_request_json TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_livemode INTEGER;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS dispute_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS dispute_status TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_status TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_requested_at TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reconciled_at TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reconcile_after TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reconcile_until TEXT;
CREATE INDEX IF NOT EXISTS payments_intent_idx ON payments(provider_payment_intent);
CREATE INDEX IF NOT EXISTS payments_provider_reference_idx ON payments(provider_reference);
CREATE INDEX IF NOT EXISTS payments_reconcile_idx ON payments(reconcile_after);
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL DEFAULT '', livemode INTEGER NOT NULL,
 type TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL,
 received_at TEXT NOT NULL, processed_at TEXT, last_error TEXT
);
CREATE INDEX IF NOT EXISTS stripe_events_pending_idx ON stripe_webhook_events(status,next_attempt_at);
