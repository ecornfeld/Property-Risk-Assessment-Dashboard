-- Migration 011: PropertyLens pivot
-- Clears all cached government API data and replaces the schema
-- with PropertyLens-native columns.

-- 1. Clear old cached data (permission granted by user, pivoting to new API)
TRUNCATE TABLE address_cache;
TRUNCATE TABLE assessments CASCADE;

-- 2. Drop old government API columns from address_cache
ALTER TABLE address_cache
  DROP COLUMN IF EXISTS fema_flood_zone,
  DROP COLUMN IF EXISTS fema_risk_level,
  DROP COLUMN IF EXISTS annual_chance_pct,
  DROP COLUMN IF EXISTS base_flood_elevation,
  DROP COLUMN IF EXISTS in_sfha,
  DROP COLUMN IF EXISTS firm_panel,
  DROP COLUMN IF EXISTS firm_effective_date,
  DROP COLUMN IF EXISTS zone_subtype,
  DROP COLUMN IF EXISTS flood_depth,
  DROP COLUMN IF EXISTS wildfire_risk_level,
  DROP COLUMN IF EXISTS whp_classification,
  DROP COLUMN IF EXISTS whp_score,
  DROP COLUMN IF EXISTS burn_probability_raw,
  DROP COLUMN IF EXISTS wui_class,
  DROP COLUMN IF EXISTS in_wui,
  DROP COLUMN IF EXISTS vegetation_coverage,
  DROP COLUMN IF EXISTS cal_fire_hazard_class,
  DROP COLUMN IF EXISTS cal_fire_responsibility_area,
  DROP COLUMN IF EXISTS superfund_nearby,
  DROP COLUMN IF EXISTS superfund_count,
  DROP COLUMN IF EXISTS radon_zone,
  DROP COLUMN IF EXISTS environmental_risk_level;

-- 3. Add PropertyLens columns to address_cache
--    pl_raw stores the full API response for future-proofing.
--    Extracted fields are indexed key values for display and export.
ALTER TABLE address_cache
  ADD COLUMN IF NOT EXISTS pl_raw           JSONB,
  ADD COLUMN IF NOT EXISTS elevation        NUMERIC,
  -- Natural hazards (grade: A–F, rating: Very Low / Low / Moderate / High / Very High)
  ADD COLUMN IF NOT EXISTS wildfire_grade   VARCHAR(2),
  ADD COLUMN IF NOT EXISTS wildfire_rating  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS flood_grade      VARCHAR(2),
  ADD COLUMN IF NOT EXISTS flood_rating     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS earthquake_grade VARCHAR(2),
  ADD COLUMN IF NOT EXISTS earthquake_rating VARCHAR(50),
  ADD COLUMN IF NOT EXISTS hurricane_grade  VARCHAR(2),
  ADD COLUMN IF NOT EXISTS hurricane_rating VARCHAR(50),
  ADD COLUMN IF NOT EXISTS tornado_grade    VARCHAR(2),
  ADD COLUMN IF NOT EXISTS tornado_rating   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS hail_grade       VARCHAR(2),
  ADD COLUMN IF NOT EXISTS hail_rating      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS wind_grade       VARCHAR(2),
  ADD COLUMN IF NOT EXISTS wind_rating      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS lightning_grade  VARCHAR(2),
  ADD COLUMN IF NOT EXISTS lightning_rating VARCHAR(50),
  -- Human / environmental hazards
  ADD COLUMN IF NOT EXISTS crime_grade      VARCHAR(2),
  ADD COLUMN IF NOT EXISTS crime_rating     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS water_quality_pfas VARCHAR(50),
  ADD COLUMN IF NOT EXISTS noise_road_rating  VARCHAR(50),
  -- Neighborhood
  ADD COLUMN IF NOT EXISTS fire_response_rating VARCHAR(50),
  ADD COLUMN IF NOT EXISTS walkability_rating   VARCHAR(50),
  -- Computed overall
  ADD COLUMN IF NOT EXISTS overall_risk_level   VARCHAR(50);

-- 4. Drop old government API columns from assessments
ALTER TABLE assessments
  DROP COLUMN IF EXISTS fema_flood_zone,
  DROP COLUMN IF EXISTS fema_risk_level,
  DROP COLUMN IF EXISTS annual_chance_pct,
  DROP COLUMN IF EXISTS base_flood_elevation,
  DROP COLUMN IF EXISTS in_sfha,
  DROP COLUMN IF EXISTS firm_panel,
  DROP COLUMN IF EXISTS firm_effective_date,
  DROP COLUMN IF EXISTS zone_subtype,
  DROP COLUMN IF EXISTS flood_depth,
  DROP COLUMN IF EXISTS wildfire_risk_score,
  DROP COLUMN IF EXISTS wildfire_risk_level,
  DROP COLUMN IF EXISTS whp_classification,
  DROP COLUMN IF EXISTS whp_score,
  DROP COLUMN IF EXISTS burn_probability_raw,
  DROP COLUMN IF EXISTS wui_class,
  DROP COLUMN IF EXISTS in_wui,
  DROP COLUMN IF EXISTS vegetation_coverage,
  DROP COLUMN IF EXISTS cal_fire_hazard_class,
  DROP COLUMN IF EXISTS cal_fire_responsibility_area,
  DROP COLUMN IF EXISTS superfund_nearby,
  DROP COLUMN IF EXISTS superfund_count,
  DROP COLUMN IF EXISTS radon_zone,
  DROP COLUMN IF EXISTS environmental_risk_level;

-- 5. Add PropertyLens columns to assessments
ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS pl_raw              JSONB,
  ADD COLUMN IF NOT EXISTS elevation           NUMERIC,
  ADD COLUMN IF NOT EXISTS wildfire_grade      VARCHAR(2),
  ADD COLUMN IF NOT EXISTS wildfire_rating     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS flood_grade         VARCHAR(2),
  ADD COLUMN IF NOT EXISTS flood_rating        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS earthquake_grade    VARCHAR(2),
  ADD COLUMN IF NOT EXISTS earthquake_rating   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS hurricane_grade     VARCHAR(2),
  ADD COLUMN IF NOT EXISTS hurricane_rating    VARCHAR(50),
  ADD COLUMN IF NOT EXISTS tornado_grade       VARCHAR(2),
  ADD COLUMN IF NOT EXISTS tornado_rating      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS hail_grade          VARCHAR(2),
  ADD COLUMN IF NOT EXISTS hail_rating         VARCHAR(50),
  ADD COLUMN IF NOT EXISTS wind_grade          VARCHAR(2),
  ADD COLUMN IF NOT EXISTS wind_rating         VARCHAR(50),
  ADD COLUMN IF NOT EXISTS lightning_grade     VARCHAR(2),
  ADD COLUMN IF NOT EXISTS lightning_rating    VARCHAR(50),
  ADD COLUMN IF NOT EXISTS crime_grade         VARCHAR(2),
  ADD COLUMN IF NOT EXISTS crime_rating        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS water_quality_pfas  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS noise_road_rating   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fire_response_rating VARCHAR(50),
  ADD COLUMN IF NOT EXISTS walkability_rating   VARCHAR(50);
