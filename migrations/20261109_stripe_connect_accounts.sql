-- Stripe Express Connect seller accounts.
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;
CREATE INDEX IF NOT EXISTS users_stripe_account_id_idx ON users(stripe_account_id) WHERE stripe_account_id IS NOT NULL;
