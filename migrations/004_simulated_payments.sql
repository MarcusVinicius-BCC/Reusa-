CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  negotiation_id TEXT NOT NULL REFERENCES negotiations(id) ON DELETE CASCADE,
  payer_id TEXT NOT NULL REFERENCES users(id),
  payee_id TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK(currency = 'BRL'),
  method TEXT NOT NULL CHECK(method IN ('pix','card','boleto')),
  status TEXT NOT NULL CHECK(status IN ('processing','succeeded','failed','refunded')),
  idempotency_key TEXT NOT NULL,
  provider_reference TEXT NOT NULL,
  failure_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  UNIQUE(negotiation_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS payment_audit_events (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_negotiation_idx ON payments(negotiation_id, created_at DESC);
