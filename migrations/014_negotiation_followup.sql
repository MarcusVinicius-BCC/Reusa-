CREATE TABLE IF NOT EXISTS delivery_reminders (
 delivery_id TEXT NOT NULL REFERENCES collection_deliveries(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 scheduled_for TEXT NOT NULL, kind TEXT NOT NULL,
 PRIMARY KEY(delivery_id,user_id,scheduled_for,kind)
);
CREATE TABLE IF NOT EXISTS delivery_incidents (
 id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL REFERENCES collection_deliveries(id) ON DELETE CASCADE,
 reporter_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS delivery_incidents_delivery ON delivery_incidents(delivery_id,created_at);
