const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const pg = require('pg');
const XLSX = require('xlsx');
const { createClient } = require('redis');
const { Queue, Worker } = require('bullmq');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Rate limiting
const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 1000, message: { error: 'Too many requests, slow down.' } });
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: 'Too many auth attempts, try again later.' } });
const assessLimiter = rateLimit({ windowMs: 60 * 1000, max: 1000, message: { error: 'Too many requests, slow down.' } });
app.use(globalLimiter);

// Redis client
const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redis.on('error', (err) => console.error('Redis error:', err));
redis.connect().then(() => console.log('Redis connected')).catch(console.error);

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

// Persistent HTTPS agent — reuses TCP/TLS connections across requests instead of re-handshaking each time
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 20 });

// BullMQ — uses its own ioredis-compatible connection config (separate from node-redis client)
const bullRedisOpts = { url: process.env.REDIS_URL || 'redis://localhost:6379' };
const bulkQueue = new Queue('bulk-assessments', { connection: bullRedisOpts });

// Worker: process 2 bulk jobs concurrently, addresses within each job run sequentially
// with a 50ms pause between calls to ease pressure on government APIs
const bulkWorker = new Worker('bulk-assessments', async (job) => {
  const { userId, addresses } = job.data;
  const results = [];

  for (let i = 0; i < addresses.length; i++) {
    try {
      const data = await assessSingleAddress(userId, addresses[i]);
      results.push({ address: addresses[i], success: true, data });
    } catch (err) {
      results.push({ address: addresses[i], success: false, error: err.message, limitReached: !!err.limitReached });
      // Stop processing if monthly limit hit
      if (err.limitReached) break;
    }

    await job.updateProgress(Math.round((i + 1) / addresses.length * 100));
    // Store partial results so frontend can poll mid-job
    await redis.setEx(`bulk:results:${job.id}`, 86400, JSON.stringify(results));

    // 50ms breathing room between addresses
    if (i < addresses.length - 1) await new Promise(r => setTimeout(r, 50));
  }

  return results;
}, { connection: bullRedisOpts, concurrency: 2 });

bulkWorker.on('failed', (job, err) => console.error(`Bulk job ${job.id} failed:`, err.message));

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20
});

// Returns the 1st of the current calendar month as a YYYY-MM-01 string
// Get current credit balance for a user
async function getCredits(userId) {
  const result = await pool.query('SELECT credits FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.credits ?? 0;
}

// Atomically deduct one credit. Returns false if insufficient balance.
async function deductCredit(userId) {
  const result = await pool.query(
    `UPDATE users SET credits = credits - 1
     WHERE id = $1 AND credits > 0
     RETURNING credits`,
    [userId]
  );
  if (result.rows.length === 0) return false;
  await pool.query(
    `INSERT INTO credit_transactions (user_id, amount, type, description)
     VALUES ($1, -1, 'assessment', 'Property assessment')`,
    [userId]
  );
  return true;
}

// Add credits to a user (purchase or admin grant)
async function addCredits(userId, amount, type = 'admin_grant', description = '', stripeSessionId = null) {
  await pool.query(
    `UPDATE users SET credits = credits + $2 WHERE id = $1`,
    [userId, amount]
  );
  await pool.query(
    `INSERT INTO credit_transactions (user_id, amount, type, description, stripe_session_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, amount, type, description, stripeSessionId]
  );
}

// Log API usage
function logAPIUsage(service, cost) {
  const logFile = path.join(__dirname, 'api-usage.json');
  let usage = [];
  
  if (fs.existsSync(logFile)) {
    usage = JSON.parse(fs.readFileSync(logFile, 'utf8'));
  }
  
  usage.push({
    service: service,
    timestamp: new Date().toISOString(),
    cost: cost
  });
  
  fs.writeFileSync(logFile, JSON.stringify(usage, null, 2));
}

// Middleware to verify JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

// Normalize address for cache key
function normalizeAddress(address) {
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Get cached risk data (Redis first, then DB)
async function getCachedRiskData(address) {
  const key = `risk:${normalizeAddress(address)}`;

  // 1. Check Redis
  try {
    const redisVal = await redis.get(key);
    if (redisVal) {
      console.log('Cache hit (Redis):', address);
      return JSON.parse(redisVal);
    }
  } catch (err) {
    console.error('Redis get error:', err.message);
  }

  // 2. Check DB cache
  const result = await pool.query(
    'SELECT * FROM address_cache WHERE address = $1',
    [normalizeAddress(address)]
  );
  if (result.rows.length > 0) {
    const row = result.rows[0];
    // Treat as stale if data was fetched more than 90 days ago
    const cachedAt = row.cached_at ? new Date(row.cached_at) : new Date(0);
    const ageMs = Date.now() - cachedAt.getTime();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    if (ageMs > ninetyDaysMs) {
      console.log('Cache stale (>90 days), re-fetching:', address);
      return null;
    }
    console.log('Cache hit (DB):', address);
    // Backfill Redis
    try {
      await redis.setEx(key, CACHE_TTL_SECONDS, JSON.stringify(row));
    } catch (err) {
      console.error('Redis set error:', err.message);
    }
    // Update access metadata
    await pool.query(
      'UPDATE address_cache SET last_assessed_at = NOW(), assessment_count = assessment_count + 1 WHERE address = $1',
      [normalizeAddress(address)]
    );
    return row;
  }

  return null;
}

// Store PropertyLens risk data in Redis + DB cache
async function cacheRiskData(address, geocoded, plData) {
  const key = `risk:${normalizeAddress(address)}`;
  const nat = plData?.insights?.exposures?.natural || {};
  const hum = plData?.insights?.exposures?.human || {};
  const nbr = plData?.insights?.neighborhood || {};

  // Helpers: most natural hazards nest grade under .risk; some are flat
  const n = (h) => h?.risk?.grade ?? null;
  const nr = (h) => h?.risk?.rating ?? null;
  const f = (h) => h?.grade ?? null;
  const fr = (h) => h?.rating ?? null;

  const row = {
    address: normalizeAddress(address),
    latitude: geocoded.latitude,
    longitude: geocoded.longitude,
    elevation: plData?.location?.elevation?.value ?? null,
    pl_raw: plData,
    wildfire_grade:    n(nat.wildfire),
    wildfire_rating:   nr(nat.wildfire),
    flood_grade:       f(nat.fema_flood),
    flood_rating:      fr(nat.fema_flood),
    earthquake_grade:  n(nat.earthquake),
    earthquake_rating: nr(nat.earthquake),
    hurricane_grade:   n(nat.hurricane),
    hurricane_rating:  nr(nat.hurricane),
    tornado_grade:     n(nat.tornado),
    tornado_rating:    nr(nat.tornado),
    hail_grade:        n(nat.hail),
    hail_rating:       nr(nat.hail),
    wind_grade:        n(nat.strong_wind),
    wind_rating:       nr(nat.strong_wind),
    lightning_grade:   n(nat.lightning),
    lightning_rating:  nr(nat.lightning),
    crime_grade:       hum.crime?.overall?.grade ?? null,
    crime_rating:      hum.crime?.overall?.rating ?? null,
    water_quality_pfas: hum.water_quality?.pfas?.rating ?? null,
    noise_road_rating:  hum.noise?.road?.rating ?? null,
    fire_response_rating: nbr.fire_protection_response?.rating ?? null,
    walkability_rating:   nbr.walkability?.rating ?? null,
    overall_risk_level: deriveOverallRisk(nat)
  };

  await pool.query(
    `INSERT INTO address_cache (
      address, latitude, longitude, elevation, pl_raw,
      wildfire_grade, wildfire_rating, flood_grade, flood_rating,
      earthquake_grade, earthquake_rating, hurricane_grade, hurricane_rating,
      tornado_grade, tornado_rating, hail_grade, hail_rating,
      wind_grade, wind_rating, lightning_grade, lightning_rating,
      crime_grade, crime_rating, water_quality_pfas, noise_road_rating,
      fire_response_rating, walkability_rating, overall_risk_level
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
      $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28
    )
    ON CONFLICT (address) DO UPDATE SET
      latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
      elevation = EXCLUDED.elevation, pl_raw = EXCLUDED.pl_raw,
      wildfire_grade = EXCLUDED.wildfire_grade, wildfire_rating = EXCLUDED.wildfire_rating,
      flood_grade = EXCLUDED.flood_grade, flood_rating = EXCLUDED.flood_rating,
      earthquake_grade = EXCLUDED.earthquake_grade, earthquake_rating = EXCLUDED.earthquake_rating,
      hurricane_grade = EXCLUDED.hurricane_grade, hurricane_rating = EXCLUDED.hurricane_rating,
      tornado_grade = EXCLUDED.tornado_grade, tornado_rating = EXCLUDED.tornado_rating,
      hail_grade = EXCLUDED.hail_grade, hail_rating = EXCLUDED.hail_rating,
      wind_grade = EXCLUDED.wind_grade, wind_rating = EXCLUDED.wind_rating,
      lightning_grade = EXCLUDED.lightning_grade, lightning_rating = EXCLUDED.lightning_rating,
      crime_grade = EXCLUDED.crime_grade, crime_rating = EXCLUDED.crime_rating,
      water_quality_pfas = EXCLUDED.water_quality_pfas, noise_road_rating = EXCLUDED.noise_road_rating,
      fire_response_rating = EXCLUDED.fire_response_rating, walkability_rating = EXCLUDED.walkability_rating,
      overall_risk_level = EXCLUDED.overall_risk_level,
      cached_at = NOW(), last_assessed_at = NOW(),
      assessment_count = address_cache.assessment_count + 1`,
    [
      row.address, row.latitude, row.longitude, row.elevation, JSON.stringify(row.pl_raw),
      row.wildfire_grade, row.wildfire_rating, row.flood_grade, row.flood_rating,
      row.earthquake_grade, row.earthquake_rating, row.hurricane_grade, row.hurricane_rating,
      row.tornado_grade, row.tornado_rating, row.hail_grade, row.hail_rating,
      row.wind_grade, row.wind_rating, row.lightning_grade, row.lightning_rating,
      row.crime_grade, row.crime_rating, row.water_quality_pfas, row.noise_road_rating,
      row.fire_response_rating, row.walkability_rating, row.overall_risk_level
    ]
  );

  try {
    await redis.setEx(key, CACHE_TTL_SECONDS, JSON.stringify(row));
  } catch (err) {
    console.error('Redis set error:', err.message);
  }

  return row;
}

// Derive overall risk from key natural hazard grades.
// Most hazards nest grade under .risk; fema_flood is flat.
function deriveOverallRisk(nat) {
  const gradeScore = { 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'F': 5 };
  const nestedHazards = ['wildfire', 'earthquake', 'hurricane', 'tornado'];
  const grades = [
    ...nestedHazards.map(h => nat[h]?.risk?.grade),
    nat.fema_flood?.grade  // flat
  ].filter(Boolean);
  const scores = grades.map(g => gradeScore[g] || 0).filter(s => s > 0);
  if (!scores.length) return 'Unknown';
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg >= 4) return 'High';
  if (avg >= 3) return 'Moderate';
  return 'Low';
}

// PropertyLens OAuth2 token cache — tokens are valid 1 hour
let _plToken = null;
let _plTokenExpiry = 0;

async function getPropertyLensToken() {
  const clientId = process.env.PROPERTY_LENS_CLIENT_ID;
  const clientSecret = process.env.PROPERTY_LENS_CLIENT_SECRET;
  const baseUrl = process.env.PROPERTY_LENS_API_URL || 'https://data.propertylens.com';

  if (!clientId || !clientSecret) {
    throw new Error('PropertyLens credentials not configured. Add PROPERTY_LENS_CLIENT_ID and PROPERTY_LENS_CLIENT_SECRET to .env.');
  }

  // Return cached token if still valid (with 60s buffer)
  if (_plToken && Date.now() < _plTokenExpiry - 60000) {
    return _plToken;
  }

  const res = await axios.post(`${baseUrl}/authenticate/`, { client_id: clientId, client_secret: clientSecret }, { timeout: 10000, httpsAgent });
  _plToken = res.data.access_token;
  _plTokenExpiry = Date.now() + (res.data.expires_in * 1000);
  return _plToken;
}

// PropertyLens API — OAuth2 M2M, endpoint: /property-insights/address
async function getPropertyLensData(address) {
  const baseUrl = process.env.PROPERTY_LENS_API_URL || 'https://data.propertylens.com';

  try {
    const token = await getPropertyLensToken();
    const response = await axios.get(`${baseUrl}/property-insights/address`, {
      params: { address },
      headers: { 'Authorization': `Bearer ${token}` },
      timeout: 20000,
      httpsAgent
    });
    logAPIUsage('PropertyLens', 2.70);
    return response.data;
  } catch (err) {
    if (err.response) {
      const msg = err.response.data?.detail || err.response.data?.message || err.response.statusText;
      throw new Error(`PropertyLens API error (${err.response.status}): ${msg}`);
    }
    throw new Error(`PropertyLens API unreachable: ${err.message}`);
  }
}

// Geocode address — Redis-cached for 90 days to avoid redundant Google Maps calls
async function geocodeAddress(address) {
  if (!address || !address.trim()) {
    throw new Error('Address is required');
  }

  const cacheKey = `geo:${normalizeAddress(address)}`;

  // Check Redis geocode cache first
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log('Geocode cache hit:', address);
      return JSON.parse(cached);
    }
  } catch (err) {
    console.error('Redis geocode get error:', err.message);
  }

  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json`,
      {
        params: {
          address: address,
          key: GOOGLE_MAPS_API_KEY,
          components: 'country:US'
        },
        httpsAgent
      }
    );

    if (!response.data.results || response.data.results.length === 0) {
      throw new Error('Address not found. Please enter a valid US street address.');
    }

    const result = response.data.results[0];

    // Reject results that are too broad (country, state, city — not a specific address)
    const tooVague = ['country', 'administrative_area_level_1', 'administrative_area_level_2', 'locality', 'colloquial_area', 'political'];
    const hasSpecific = result.types.some(t => ['street_address','premise','subpremise','route','intersection','plus_code'].includes(t));
    if (!hasSpecific && result.types.every(t => tooVague.includes(t))) {
      throw new Error('Please enter a specific street address, not just a city, state, or country.');
    }

    let state = '';
    let county = '';

    result.address_components.forEach(component => {
      if (component.types.includes('administrative_area_level_1')) {
        state = component.short_name;
      }
      if (component.types.includes('administrative_area_level_2')) {
        county = component.long_name;
      }
    });

    logAPIUsage('Google Maps Geocoding', 0.005);

    const geocoded = {
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      formattedAddress: result.formatted_address,
      state,
      county
    };

    // Cache geocode result for 90 days
    try {
      await redis.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(geocoded));
    } catch (err) {
      console.error('Redis geocode set error:', err.message);
    }

    return geocoded;
  } catch (error) {
    if (error.response) {
      throw new Error('Geocoding service error: ' + error.response.data.error_message);
    }
    throw error;
  }
}

// Routes

// Address autocomplete proxy
app.get('/api/autocomplete', async (req, res) => {
  const { input } = req.query;
  if (!input) return res.json({ predictions: [] });

  try {
    const response = await axios.post(
      'https://places.googleapis.com/v1/places:autocomplete',
      {
        input,
        includedRegionCodes: ['us'],
        includedPrimaryTypes: ['street_address', 'premise']
      },
      {
        headers: {
          'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
          'Content-Type': 'application/json'
        },
        httpsAgent
      }
    );

    const predictions = (response.data.suggestions || []).map(s => ({
      description: s.placePrediction?.text?.text || ''
    }));

    res.json({ predictions });
  } catch (err) {
    res.status(500).json({ predictions: [] });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Sign up
app.post('/api/auth/signup', authLimiter, async (req, res) => {
  const { email, password, companyName, firstName, lastName } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  // Password validation
  const pwErrors = [];
  if (password.length < 8) pwErrors.push('at least 8 characters');
  if (!/[A-Z]/.test(password)) pwErrors.push('one uppercase letter');
  if (!/[0-9]/.test(password)) pwErrors.push('one number');
  if (pwErrors.length > 0) {
    return res.status(400).json({ error: `Password must contain: ${pwErrors.join(', ')}` });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, company_name, first_name, last_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, company_name, first_name, last_name, subscription_tier`,
      [email, hashedPassword, companyName || '', firstName || '', lastName || '']
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Account with that email already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name, company_name FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, companyName: user.company_name } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Core assessment logic — shared by single-address endpoint and bulk worker
async function assessSingleAddress(userId, address) {
  const inputAddress = address?.trim();
  if (!inputAddress) throw new Error('Address is required');

  // Run credit check and geocoding in parallel — they're independent
  const [credits, geocoded] = await Promise.all([
    getCredits(userId),
    geocodeAddress(inputAddress)
  ]);

  if (credits <= 0) {
    const err = new Error('No credits remaining. Purchase more credits to continue.');
    err.noCredits = true;
    throw err;
  }
  let cached = await getCachedRiskData(geocoded.formattedAddress);
  let plData;

  if (cached) {
    // Reconstruct plData from cached pl_raw (full PropertyLens response stored as JSONB)
    plData = cached.pl_raw || null;
  } else {
    // Live PropertyLens call — requires PROPERTY_LENS_API_KEY in .env
    plData = await getPropertyLensData(geocoded.formattedAddress);
    cached = await cacheRiskData(geocoded.formattedAddress, geocoded, plData);
  }

  // PropertyLens returned no data — don't charge a credit, return a clear error
  if (!plData || !plData.insights) {
    const err = new Error('No data available for this address. PropertyLens does not have coverage for this property. No credit was charged.');
    err.noData = true;
    throw err;
  }

  const nat = plData?.insights?.exposures?.natural || {};
  const hum = plData?.insights?.exposures?.human || {};
  const nbr = plData?.insights?.neighborhood || {};
  const overallRiskLevel = deriveOverallRisk(nat);

  const credited = await deductCredit(userId);
  if (!credited) {
    const err = new Error('No credits remaining. Purchase more credits to continue.');
    err.noCredits = true;
    throw err;
  }

  const dbResult = await pool.query(
    `INSERT INTO assessments
     (user_id, address, input_address, latitude, longitude, overall_risk_score, overall_risk_level,
      pl_raw, elevation,
      wildfire_grade, wildfire_rating, flood_grade, flood_rating,
      earthquake_grade, earthquake_rating, hurricane_grade, hurricane_rating,
      tornado_grade, tornado_rating, hail_grade, hail_rating,
      wind_grade, wind_rating, lightning_grade, lightning_rating,
      crime_grade, crime_rating, water_quality_pfas, noise_road_rating,
      fire_response_rating, walkability_rating)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
     RETURNING id, created_at`,
    [
      userId, geocoded.formattedAddress, inputAddress, geocoded.latitude, geocoded.longitude,
      null, overallRiskLevel,
      JSON.stringify(plData), plData?.location?.elevation?.value ?? null,
      nat.wildfire?.risk?.grade ?? null, nat.wildfire?.risk?.rating ?? null,
      nat.fema_flood?.grade ?? null, nat.fema_flood?.rating ?? null,
      nat.earthquake?.risk?.grade ?? null, nat.earthquake?.risk?.rating ?? null,
      nat.hurricane?.risk?.grade ?? null, nat.hurricane?.risk?.rating ?? null,
      nat.tornado?.risk?.grade ?? null, nat.tornado?.risk?.rating ?? null,
      nat.hail?.risk?.grade ?? null, nat.hail?.risk?.rating ?? null,
      nat.strong_wind?.risk?.grade ?? null, nat.strong_wind?.risk?.rating ?? null,
      nat.lightning?.risk?.grade ?? null, nat.lightning?.risk?.rating ?? null,
      hum.crime?.overall?.grade ?? null, hum.crime?.overall?.rating ?? null,
      hum.water_quality?.pfas?.rating ?? null,
      hum.noise?.road?.rating ?? null,
      nbr.fire_protection_response?.rating ?? null,
      nbr.walkability?.rating ?? null
    ]
  );

  return buildAssessmentResponse(
    dbResult.rows[0].id, geocoded, inputAddress, plData, overallRiskLevel,
    !!cached, dbResult.rows[0].created_at
  );
}

// Build the standard assessment response object from a PropertyLens payload.
// Real field paths confirmed against live API response.
function buildAssessmentResponse(id, geocoded, inputAddress, plData, overallRiskLevel, fromCache, createdAt) {
  const nat = plData?.insights?.exposures?.natural || {};
  const hum = plData?.insights?.exposures?.human || {};
  const nbr = plData?.insights?.neighborhood || {};
  const events = plData?.insights?.damaging_events || [];
  const zones = plData?.insights?.zones || {};
  const poi = plData?.insights?.nearest_points_of_interest || {};

  // Most natural hazards nest grade under .risk; exceptions (fema_flood, radon, mold, sinkhole, snow_load, ice_dam, frozen_pipes, termite_infestation) are flat
  const nested = (h) => h ? {
    grade: h.risk?.grade,
    rating: h.risk?.rating,
    description: h.risk?.description,
    percentile: h.risk?.national_percentile ?? null,
    annualLossGrade: h.expected_annual_loss?.grade ?? null,
    annualLossRating: h.expected_annual_loss?.rating ?? null,
    annualLossPercentile: h.expected_annual_loss?.national_percentile ?? null,
    historicLossGrade: h.expected_annual_loss?.historic_loss_ratio?.grade ?? null,
    historicLossRating: h.expected_annual_loss?.historic_loss_ratio?.rating ?? null,
    annualizedFrequency: h.annualized_frequency ?? null,
  } : {};

  const flat = (h) => h ? {
    grade: h.grade,
    rating: h.rating,
    description: h.description,
  } : {};

  return {
    id,
    address: geocoded.formattedAddress,
    inputAddress,
    latitude: geocoded.latitude,
    longitude: geocoded.longitude,
    elevation: plData?.location?.elevation?.value ?? null,
    cached: fromCache,
    natural: {
      wildfire: {
        ...nested(nat.wildfire),
        katbaticWindRegion: nat.wildfire?.katabatic_wind_region?.name ?? null,
        fuelLoading: nat.wildfire?.fuel_loading?.description ?? null,
        historicPerimeters: nat.wildfire?.historic_wildfire_perimeters_in?.length ?? 0,
        communityProtectionPlan: nat.wildfire?.community_wildfire_protection_plan?.community ?? null,
      },
      flood: {
        ...flat(nat.fema_flood),
        floodZone: nat.fema_flood?.flood_zone ?? null,
        specialFloodHazardArea: nat.fema_flood?.special_flood_hazard_area ?? null,
        in100YearFloodplain: nat.fema_flood?.in_100_year_floodplain ?? null,
        in500YearFloodplain: nat.fema_flood?.in_500_year_floodplain ?? null,
        baseFloodElevation: nat.fema_flood?.static_base_flood_elevation?.value ?? null,
        claimsFrequencyGrade: nat.fema_flood?.fema_flood_claims?.frequency_exposure?.grade ?? null,
        claimsFrequencyRating: nat.fema_flood?.fema_flood_claims?.frequency_exposure?.rating ?? null,
        claimsCostGrade: nat.fema_flood?.fema_flood_claims?.cost_exposure?.grade ?? null,
        claimsCostRating: nat.fema_flood?.fema_flood_claims?.cost_exposure?.rating ?? null,
      },
      earthquake:      nested(nat.earthquake),
      hurricane:       nested(nat.hurricane),
      tornado:         nested(nat.tornado),
      hail:            nested(nat.hail),
      wind:            nested(nat.strong_wind),
      lightning:       nested(nat.lightning),
      mold:            flat(nat.mold),
      heatwave:        nested(nat.heatwave),
      winterWeather:   nested(nat.winter_weather),
      landslide:       nested(nat.landslide),
      tsunami:         nested(nat.tsunami),
      sinkhole:        flat(nat.sinkhole),
      radon:           flat(nat.radon),
      coldWave:        nested(nat.cold_wave),
      riverineFlood:   nested(nat.riverine_flooding),
      snowLoad:        flat(nat.snow_load),
      volcanicActivity: nested(nat.volcanic_activity),
      termite:         flat(nat.termite_infestation),
      coastalFlooding: nested(nat.coastal_flooding),
      avalanche:       nested(nat.avalanche),
      iceStorm:        nested(nat.ice_storm),
      iceDam: {
        ...flat(nat.ice_dam),
        iceLoad: nat.ice_dam?.ice_load?.value ?? null,
        avgGustSpeed: nat.ice_dam?.average_gust_speed?.value ?? null,
        avgMinTemp: nat.ice_dam?.average_minimum_temperature?.value ?? null,
      },
      frozenPipes:     flat(nat.frozen_pipes),
    },
    human: {
      crime: {
        grade: hum.crime?.overall?.grade,
        rating: hum.crime?.overall?.rating,
        description: hum.crime?.overall?.description,
        score: hum.crime?.overall?.score ?? null,
        subcategories: {
          aggravatedAssault: { grade: hum.crime?.aggravated_assault?.grade, rating: hum.crime?.aggravated_assault?.rating, score: hum.crime?.aggravated_assault?.score ?? null },
          burglary:          { grade: hum.crime?.burglary?.grade,           rating: hum.crime?.burglary?.rating,           score: hum.crime?.burglary?.score ?? null },
          larceny:           { grade: hum.crime?.larceny?.grade,            rating: hum.crime?.larceny?.rating,            score: hum.crime?.larceny?.score ?? null },
          motorVehicleTheft: { grade: hum.crime?.motor_vehicle_theft?.grade, rating: hum.crime?.motor_vehicle_theft?.rating, score: hum.crime?.motor_vehicle_theft?.score ?? null },
          murder:            { grade: hum.crime?.murder?.grade,             rating: hum.crime?.murder?.rating,             score: hum.crime?.murder?.score ?? null },
          rape:              { grade: hum.crime?.rape?.grade,               rating: hum.crime?.rape?.rating,               score: hum.crime?.rape?.score ?? null },
          robbery:           { grade: hum.crime?.robbery?.grade,            rating: hum.crime?.robbery?.rating,            score: hum.crime?.robbery?.score ?? null },
        }
      },
      waterQuality: {
        pfas:    { grade: hum.water_quality?.pfas?.grade,                rating: hum.water_quality?.pfas?.rating,                description: hum.water_quality?.pfas?.description },
        hardness:{ grade: hum.water_quality?.hardness?.grade,            rating: hum.water_quality?.hardness?.rating,            description: hum.water_quality?.hardness?.description },
        arsenic: { grade: hum.water_quality?.groundwater_arsenic?.grade, rating: hum.water_quality?.groundwater_arsenic?.rating, description: hum.water_quality?.groundwater_arsenic?.description }
      },
      noise: {
        road:     { grade: hum.noise?.road?.grade,     rating: hum.noise?.road?.rating,     decibels: hum.noise?.road?.daily_equivalent_sound_level?.value ?? null },
        rail:     { grade: hum.noise?.rail?.grade,     rating: hum.noise?.rail?.rating,     decibels: hum.noise?.rail?.daily_equivalent_sound_level?.value ?? null },
        aviation: { grade: hum.noise?.aviation?.grade, rating: hum.noise?.aviation?.rating, decibels: hum.noise?.aviation?.daily_equivalent_sound_level?.value ?? null }
      },
      fracking:       { grade: hum.fracking_earthquake?.grade, rating: hum.fracking_earthquake?.rating, description: hum.fracking_earthquake?.description, zone: hum.fracking_earthquake?.zone ?? null },
      mineSubsidence: { grade: hum.mine_subsidence?.grade,     rating: hum.mine_subsidence?.rating,     description: hum.mine_subsidence?.description }
    },
    neighborhood: {
      fireResponse: {
        grade: nbr.fire_protection_response?.grade,
        rating: nbr.fire_protection_response?.rating,
        description: nbr.fire_protection_response?.description,
        aaisRating: nbr.fire_protection_response?.aais_rating ?? null,
        hydrants: (nbr.fire_protection_response?.hydrants || []).map(h => ({ count: h.count, radiusMiles: h.radius?.value }))
      },
      lawEnforcement:     { grade: nbr.law_enforcement_response?.grade,     rating: nbr.law_enforcement_response?.rating,     description: nbr.law_enforcement_response?.description },
      medicalResponse:    { grade: nbr.medical_response?.grade,             rating: nbr.medical_response?.rating,             description: nbr.medical_response?.description },
      walkability:        { grade: nbr.walkability?.grade,                  rating: nbr.walkability?.rating,                  description: nbr.walkability?.description },
      publicTransit:      { grade: nbr.public_transit?.grade,               rating: nbr.public_transit?.rating,               description: nbr.public_transit?.description },
      disasterResilience: { grade: nbr.natural_disaster_resilience?.grade,  rating: nbr.natural_disaster_resilience?.rating,  description: nbr.natural_disaster_resilience?.description, percentile: nbr.natural_disaster_resilience?.national_percentile ?? null },
      buildingCodes: {
        nfipParticipation: nbr.municipality_code_adoption?.nfip_participation ?? null,
        ibc: nbr.municipality_code_adoption?.adopted_international_building_code ?? null,
        irc: nbr.municipality_code_adoption?.adopted_international_residential_code ?? null,
        floodCode:    { grade: nbr.municipality_code_adoption?.code_adopted_by_exposure?.flood?.grade,     rating: nbr.municipality_code_adoption?.code_adopted_by_exposure?.flood?.rating },
        hurricaneCode:{ grade: nbr.municipality_code_adoption?.code_adopted_by_exposure?.hurricane?.grade, rating: nbr.municipality_code_adoption?.code_adopted_by_exposure?.hurricane?.rating },
      }
    },
    zones: {
      urbanArea:          zones.urban_area?.name ?? null,
      incorporatedArea:   zones.incorporated_area?.name ?? null,
      plantHardinessZone: zones.plant_hardiness?.zone ?? null,
      schoolDistrict:     zones.public_school_district?.name ?? null,
      opportunityZone:    zones.opportunity_zone ?? null,
      censusBlockFips:    zones.census_block_group?.fips ?? null,
    },
    nearestPoi: {
      airports:          (poi.airports          || []).slice(0,3).map(a => ({ name: a.name, distanceMiles: a.distance?.value ?? null })),
      ambulanceServices: (poi.ambulance_services || []).slice(0,2).map(a => ({ name: a.name, distanceMiles: a.distance?.value ?? null })),
      fireStations:      (poi.fire_stations      || []).slice(0,3).map(a => ({ name: a.name, distanceMiles: a.distance?.value ?? null })),
      policeStations:    (poi.police_stations    || []).slice(0,2).map(a => ({ name: a.name, distanceMiles: a.distance?.value ?? null })),
      hospitals:         (poi.hospitals          || []).slice(0,2).map(a => ({ name: a.name, distanceMiles: a.distance?.value ?? null })),
    },
    damagingEvents: events.map(e => ({ name: e.name, date: e.date, type: e.type, damageAssessment: e.damage_assessment, distanceMiles: e.distance?.value ?? null })),
    overall: { riskLevel: overallRiskLevel },
    createdAt
  };
}

// Assess risk (requires authentication)
app.post('/api/assess', assessLimiter, authenticateToken, async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'Address is required' });
  try {
    const result = await assessSingleAddress(req.user.id, address);
    res.json(result);
  } catch (error) {
    if (error.noCredits) {
      return res.status(402).json({ error: error.message, no_credits: true });
    }
    res.status(400).json({ error: error.message });
  }
});

// Bulk upload — queue a batch job
app.post('/api/bulk/upload', authenticateToken, async (req, res) => {
  const { addresses } = req.body;
  const userId = req.user.id;

  if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
    return res.status(400).json({ error: 'addresses array is required' });
  }

  // Pre-filter obviously invalid addresses before queuing
  const isValidAddress = (a) => typeof a === 'string' && a.trim().length >= 6 && /\d/.test(a);
  const validAddresses = addresses.filter(isValidAddress);
  const invalidAddresses = addresses.filter(a => !isValidAddress(a));

  if (validAddresses.length === 0) {
    return res.status(400).json({ error: 'No valid addresses found. Each address must include a street number.' });
  }

  // Check available credits — cap batch at what the user can afford
  const available = await getCredits(userId);
  if (available <= 0) {
    return res.status(402).json({ error: 'No credits remaining. Purchase more credits to continue.', no_credits: true });
  }

  const batch = validAddresses.slice(0, available);

  const job = await bulkQueue.add('assess', { userId, addresses: batch }, { priority: 1 });

  res.json({
    jobId: job.id,
    total: batch.length,
    cappedCount: batch.length < validAddresses.length ? validAddresses.length - batch.length : 0,
    skipped: invalidAddresses.length > 0 ? { count: invalidAddresses.length, addresses: invalidAddresses, reason: 'Invalid address format — must include a street number' } : null
  });
});

// Bulk status — lightweight poll (no results payload, just progress metadata)
app.get('/api/bulk/status/:jobId', authenticateToken, async (req, res) => {
  try {
    const job = await bulkQueue.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const state = await job.getState();
    const total = job.data.addresses.length;
    const raw = await redis.get(`bulk:results:${job.id}`);
    const results = raw ? JSON.parse(raw) : [];
    const completed = results.length;
    const failed = results.filter(r => !r.success).length;

    res.json({ state, total, completed, failed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk results — fetch full results once job is done
app.get('/api/bulk/results/:jobId', authenticateToken, async (req, res) => {
  try {
    const raw = await redis.get(`bulk:results:${req.params.jobId}`);
    if (!raw) return res.status(404).json({ error: 'Results not found' });
    res.json({ results: JSON.parse(raw) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get full detail for a single assessment (uses pl_raw to build complete response)
app.get('/api/assessments/:id', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, address, input_address, latitude, longitude, overall_risk_level, pl_raw, created_at
       FROM assessments WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Assessment not found' });
    const row = result.rows[0];
    const response = buildAssessmentResponse(
      row.id,
      { formattedAddress: row.address, latitude: row.latitude, longitude: row.longitude },
      row.input_address,
      row.pl_raw,
      row.overall_risk_level,
      true,
      row.created_at
    );
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user's assessment history
app.get('/api/assessments', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT id, address, input_address, latitude, longitude, overall_risk_level,
              wildfire_grade, wildfire_rating, flood_grade, flood_rating,
              earthquake_grade, hurricane_grade, tornado_grade, hail_grade,
              crime_grade, crime_rating, created_at
       FROM assessments
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    const assessments = result.rows.map(row => ({
      id: row.id,
      address: row.address,
      inputAddress: row.input_address || null,
      latitude: row.latitude,
      longitude: row.longitude,
      overall: { riskLevel: row.overall_risk_level },
      natural: {
        wildfire:   { grade: row.wildfire_grade, rating: row.wildfire_rating },
        flood:      { grade: row.flood_grade, rating: row.flood_rating },
        earthquake: { grade: row.earthquake_grade },
        hurricane:  { grade: row.hurricane_grade },
        tornado:    { grade: row.tornado_grade },
        hail:       { grade: row.hail_grade }
      },
      human: {
        crime: { grade: row.crime_grade, rating: row.crime_rating }
      },
      createdAt: row.created_at
    }));

    res.json({ assessments, historyLimited: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download assessment history as CSV or Excel
app.get('/api/assessments/download', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
  const { from_date, to_date } = req.query;

  try {
    const conditions = ['user_id = $1'];
    const values = [userId];
    if (from_date) { values.push(from_date); conditions.push(`created_at >= $${values.length}`); }
    if (to_date) { values.push(to_date); conditions.push(`created_at <= $${values.length}`); }

    const result = await pool.query(
      `SELECT address, input_address, latitude, longitude, elevation, overall_risk_level,
              wildfire_grade, wildfire_rating, flood_grade, flood_rating,
              earthquake_grade, earthquake_rating, hurricane_grade, hurricane_rating,
              tornado_grade, tornado_rating, hail_grade, hail_rating,
              wind_grade, wind_rating, lightning_grade, lightning_rating,
              crime_grade, crime_rating, water_quality_pfas, noise_road_rating,
              fire_response_rating, walkability_rating,
              created_at
       FROM assessments
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC`,
      values
    );

    const rows = result.rows.map(row => ({
      'Submitted Address': row.input_address || row.address,
      'Geocoded Address': row.address,
      'Latitude': row.latitude || '',
      'Longitude': row.longitude || '',
      'Elevation (ft)': row.elevation != null ? row.elevation : '',
      'Overall Risk': row.overall_risk_level || '',
      'Wildfire Grade': row.wildfire_grade || '',
      'Wildfire Rating': row.wildfire_rating || '',
      'Flood Grade': row.flood_grade || '',
      'Flood Rating': row.flood_rating || '',
      'Earthquake Grade': row.earthquake_grade || '',
      'Earthquake Rating': row.earthquake_rating || '',
      'Hurricane Grade': row.hurricane_grade || '',
      'Hurricane Rating': row.hurricane_rating || '',
      'Tornado Grade': row.tornado_grade || '',
      'Tornado Rating': row.tornado_rating || '',
      'Hail Grade': row.hail_grade || '',
      'Hail Rating': row.hail_rating || '',
      'Wind Grade': row.wind_grade || '',
      'Wind Rating': row.wind_rating || '',
      'Lightning Grade': row.lightning_grade || '',
      'Lightning Rating': row.lightning_rating || '',
      'Crime Grade': row.crime_grade || '',
      'Crime Rating': row.crime_rating || '',
      'Water Quality (PFAS)': row.water_quality_pfas || '',
      'Road Noise': row.noise_road_rating || '',
      'Fire Response': row.fire_response_rating || '',
      'Walkability': row.walkability_rating || '',
      'Date Assessed': new Date(row.created_at).toLocaleString()
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Assessments');

    if (format === 'xlsx') {
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', 'attachment; filename="risk-assessments.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buf);
    } else {
      const csv = XLSX.utils.sheet_to_csv(ws);
      res.setHeader('Content-Disposition', 'attachment; filename="risk-assessments.csv"');
      res.setHeader('Content-Type', 'text/csv');
      res.send(csv);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user profile
app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, company_name, credits FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const u = result.rows[0];
    res.json({ id: u.id, email: u.email, firstName: u.first_name, lastName: u.last_name, companyName: u.company_name, credits: u.credits });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current credit balance
app.get('/api/credits', authenticateToken, async (req, res) => {
  try {
    const credits = await getCredits(req.user.id);
    res.json({ credits });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List available credit packs
app.get('/api/credit-packs', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM credit_packs WHERE active = TRUE ORDER BY credits ASC');
    res.json({ packs: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Purchase credits — Stripe Checkout placeholder.
// Replace this body with Stripe session creation once keys are configured.
app.post('/api/credits/purchase', authenticateToken, async (req, res) => {
  const { pack_id } = req.body;
  if (!pack_id) return res.status(400).json({ error: 'pack_id required' });

  try {
    const packResult = await pool.query('SELECT * FROM credit_packs WHERE id = $1 AND active = TRUE', [pack_id]);
    if (packResult.rows.length === 0) return res.status(404).json({ error: 'Credit pack not found' });
    const pack = packResult.rows[0];

    res.json({
      message: 'Stripe integration coming soon.',
      pack: { credits: pack.credits, price_cents: pack.price_cents, label: pack.label },
      checkout_url: null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stripe webhook — called by Stripe after successful payment.
// Verifies signature, grants credits, logs transaction.
app.post('/api/credits/webhook', express.raw({ type: 'application/json' }), async (_req, res) => {
  res.json({ received: true });
});

// Admin: manually grant credits to a user (internal use)
app.post('/api/admin/grant-credits', authenticateToken, async (req, res) => {
  const { user_email, amount, description } = req.body;
  if (!user_email || !amount) return res.status(400).json({ error: 'user_email and amount required' });

  try {
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [user_email]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const targetId = userResult.rows[0].id;
    await addCredits(targetId, amount, 'admin_grant', description || `Admin grant of ${amount} credits`);
    const newBalance = await getCredits(targetId);
    res.json({ granted: amount, new_balance: newBalance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: load demo results from a list of addresses (calls PropertyLens for each)
// POST { addresses: ["123 Main St...", ...] }  — triggers live API calls, use carefully
app.post('/api/admin/load-demo', authenticateToken, async (req, res) => {
  const { addresses } = req.body;
  if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
    return res.status(400).json({ error: 'addresses array required' });
  }

  const results = [];
  for (const address of addresses) {
    try {
      const geocoded = await geocodeAddress(address);
      const plData = await getPropertyLensData(geocoded.formattedAddress);
      const nat = plData?.insights?.exposures?.natural || {};

      await pool.query(
        `INSERT INTO demo_assessments (address, pl_raw, latitude, longitude, elevation, overall_risk_level)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [
          geocoded.formattedAddress,
          JSON.stringify(plData),
          geocoded.latitude,
          geocoded.longitude,
          plData?.location?.elevation?.value ?? null,
          deriveOverallRisk(nat)
        ]
      );
      results.push({ address: geocoded.formattedAddress, success: true });
    } catch (err) {
      results.push({ address, success: false, error: err.message });
    }
  }

  res.json({ loaded: results.filter(r => r.success).length, results });
});

// Public: get all demo assessment results (no auth required)
app.get('/api/demo', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, address, pl_raw, latitude, longitude, elevation, overall_risk_level, loaded_at FROM demo_assessments ORDER BY id ASC'
    );
    const demos = result.rows.map(row => {
      const plData = row.pl_raw;
      return buildAssessmentResponse(
        row.id,
        { formattedAddress: row.address, latitude: row.latitude, longitude: row.longitude },
        null,
        plData,
        row.overall_risk_level,
        true,
        row.loaded_at
      );
    });
    res.json({ demos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});