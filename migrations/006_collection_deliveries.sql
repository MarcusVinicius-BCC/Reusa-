CREATE TABLE IF NOT EXISTS collection_deliveries (
  id TEXT PRIMARY KEY,
  negotiation_id TEXT NOT NULL UNIQUE REFERENCES negotiations(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('pickup', 'dropoff')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  collection_point_id TEXT REFERENCES collection_points(id),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'in_transit', 'completed', 'cancelled')),
  confirmation_token_hash TEXT NOT NULL,
  confirmation_token_expires_at TIMESTAMPTZ NOT NULL,
  qr_code_data_url TEXT NOT NULL DEFAULT '',
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS collection_deliveries_status_idx
  ON collection_deliveries(status, scheduled_for);
