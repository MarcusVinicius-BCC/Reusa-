ALTER TABLE users ADD COLUMN IF NOT EXISTS mercado_pago_user_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mercado_pago_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mercado_pago_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mercado_pago_token_expires_at TIMESTAMPTZ;
