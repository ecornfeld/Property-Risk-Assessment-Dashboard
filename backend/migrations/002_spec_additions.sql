-- Migration: Add spec-required tables and columns
-- Run this in psql: \i migrations/002_spec_additions.sql

-- 1. Add missing columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100) DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(100) DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS state VARCHAR(2),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Add missing columns to assessments table
ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS state VARCHAR(2),
  ADD COLUMN IF NOT EXISTS county VARCHAR(100),
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_assessments_created_at ON assessments(created_at);
CREATE INDEX IF NOT EXISTS idx_assessments_overall_risk ON assessments(overall_risk_level);

-- 3. Monthly usage tracking
CREATE TABLE IF NOT EXISTS usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  addresses_assessed INT DEFAULT 0,
  csv_uploads INT DEFAULT 0,
  api_calls INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_usage_user_month ON usage(user_id, month);

-- 4. Subscriptions (for future Stripe integration)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255) UNIQUE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  tier VARCHAR(50) NOT NULL DEFAULT 'free',
  monthly_limit INT DEFAULT 100,
  cost_per_month INT DEFAULT 0,
  current_period_start DATE,
  current_period_end DATE,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  canceled_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);

-- 5. Audit log (compliance / debugging)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100),
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),
  changes JSONB,
  ip_address INET,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);

-- 6. Flood zone reference table
CREATE TABLE IF NOT EXISTS flood_zones (
  code VARCHAR(10) PRIMARY KEY,
  name VARCHAR(100),
  risk_level VARCHAR(50),
  requires_flood_insurance BOOLEAN,
  nfip_eligible BOOLEAN
);

INSERT INTO flood_zones VALUES
  ('A',   'Special Flood Hazard Area',               'High',    true,  true),
  ('AE',  'Special Flood Hazard Area (Regulatory)',   'High',    true,  true),
  ('AH',  'Shallow Flooding (Ponding)',                'High',    true,  true),
  ('AO',  'Shallow Flooding (Sheet Flow)',             'High',    true,  true),
  ('AR',  'SFHA with Temporary Reduced Designation',  'High',    true,  true),
  ('A99', 'Area Protected by Levee (Federal)',        'High',    true,  true),
  ('V',   'Coastal High Hazard Area',                 'Very High', true, true),
  ('VE',  'Coastal High Hazard Area (Regulatory)',    'Very High', true, true),
  ('X',   'Area of Minimal Flood Risk',               'Low',     false, false),
  ('D',   'Undetermined Risk',                        'Unknown', false, false)
ON CONFLICT (code) DO NOTHING;

SELECT 'Migration 002 complete' AS status;
