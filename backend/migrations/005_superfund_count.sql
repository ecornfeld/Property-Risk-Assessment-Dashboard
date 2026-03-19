ALTER TABLE address_cache
  ADD COLUMN IF NOT EXISTS superfund_count INTEGER;

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS superfund_count INTEGER;
