CREATE TABLE IF NOT EXISTS notification_service_processed_events (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notification_service_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  link TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ,
  correlation_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notification_service_notifications_user_idx
  ON notification_service_notifications(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS notification_service_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS impact_service_processed_events (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS impact_service_totals (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  items INTEGER NOT NULL DEFAULT 0,
  donations INTEGER NOT NULL DEFAULT 0,
  exchanges INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS impact_service_beneficiaries (user_id TEXT PRIMARY KEY);
INSERT INTO impact_service_totals(id) VALUES (1) ON CONFLICT (id) DO NOTHING;
