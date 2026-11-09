-- Keep existing account IDs and record which API owns each environment's account.
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_live_account_version TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_test_account_version TEXT;
