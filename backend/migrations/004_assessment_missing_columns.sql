ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS in_sfha BOOLEAN,
  ADD COLUMN IF NOT EXISTS cal_fire_hazard_class VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cal_fire_responsibility_area VARCHAR(100);
