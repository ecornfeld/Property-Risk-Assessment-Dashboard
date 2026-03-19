-- Migration: Promo codes system
-- Run: psql <connection_string> -f migrations/003_promo_codes.sql

CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  monthly_limit INT NOT NULL,
  duration_months INT NOT NULL,
  max_redemptions INT, -- NULL = unlimited
  redemption_count INT DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP -- optional expiry on the code itself (not the user's promo)
);

CREATE TABLE IF NOT EXISTS user_promos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id),
  redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  UNIQUE(user_id, promo_code_id)
);

CREATE INDEX IF NOT EXISTS idx_user_promos_user_id ON user_promos(user_id);
CREATE INDEX IF NOT EXISTS idx_user_promos_expires_at ON user_promos(expires_at);

-- Seed the beta promo code: 500/month for 6 months, max 100 redemptions
INSERT INTO promo_codes (code, monthly_limit, duration_months, max_redemptions)
VALUES ('BETA2026', 500, 6, 100)
ON CONFLICT (code) DO NOTHING;

SELECT 'Migration 003 complete' AS status;
