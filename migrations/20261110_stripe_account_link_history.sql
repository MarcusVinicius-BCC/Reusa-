CREATE TABLE IF NOT EXISTS stripe_account_link_history (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 account_id TEXT NOT NULL,
 account_version TEXT NOT NULL,
 environment TEXT NOT NULL,
 replacement_account_id TEXT NOT NULL,
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS stripe_account_link_history_user_idx ON stripe_account_link_history(user_id,created_at);
