-- Stripe Express Connect seller accounts. Existing Mercado Pago fields are preserved
-- only for historical records and rollback; they are never used for new payments.
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;
CREATE INDEX IF NOT EXISTS users_stripe_account_id_idx ON users(stripe_account_id) WHERE stripe_account_id IS NOT NULL;
