-- Migration 012: Replace subscription model with prepaid credits

-- 1. Add credits balance to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 0;

-- Give existing test accounts 25 starter credits
UPDATE users SET credits = 25 WHERE credits = 0;

-- 2. Credit transaction log (purchases + deductions)
CREATE TABLE IF NOT EXISTS credit_transactions (
  id            SERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount        INTEGER NOT NULL,          -- positive = added, negative = deducted
  type          VARCHAR(50) NOT NULL,      -- 'purchase', 'assessment', 'admin_grant', 'refund'
  description   TEXT,
  stripe_session_id VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON credit_transactions(user_id);

-- 3. Demo assessments table (pre-loaded PropertyLens results for public showcase)
CREATE TABLE IF NOT EXISTS demo_assessments (
  id            SERIAL PRIMARY KEY,
  address       TEXT NOT NULL,
  pl_raw        JSONB NOT NULL,
  latitude      NUMERIC,
  longitude     NUMERIC,
  elevation     NUMERIC,
  overall_risk_level VARCHAR(50),
  loaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Credit pack definitions (readable by frontend via /api/credit-packs)
CREATE TABLE IF NOT EXISTS credit_packs (
  id            SERIAL PRIMARY KEY,
  credits       INTEGER NOT NULL,
  price_cents   INTEGER NOT NULL,   -- price in USD cents
  label         TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO credit_packs (credits, price_cents, label) VALUES
  (10,  2700,  'Starter'),
  (50,  13500, 'Standard'),
  (200, 54000, 'Professional')
ON CONFLICT DO NOTHING;
