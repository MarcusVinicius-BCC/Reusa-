CREATE TABLE IF NOT EXISTS message_clears (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  cleared_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, thread_id)
);

CREATE INDEX IF NOT EXISTS message_clears_thread_idx
  ON message_clears(thread_id, cleared_at);

