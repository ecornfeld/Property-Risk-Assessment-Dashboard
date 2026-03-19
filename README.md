# FlashRisk — Property Risk Assessment Dashboard

Scores any US address across 25+ hazard categories using PropertyLens. Returns letter grades (A–F), risk ratings, and national percentiles for wildfire, flood, earthquake, hurricane, tornado, hail, ice storm, avalanche, crime, water quality, noise, and more. Supports single address lookup and bulk CSV upload with a credit-based usage model.

## Tech Stack

- **Frontend:** React
- **Backend:** Node.js / Express
- **Database:** PostgreSQL
- **Cache / Queue:** Redis, BullMQ
- **APIs:** PropertyLens, Google Maps Geocoding

## Features

- Single address risk assessment with 25+ graded hazard categories
- Bulk CSV upload with per-address results and progress tracking
- Credit-based usage model with admin grant and Stripe integration (coming soon)
- Assessment history with tabular view and CSV/Excel export
- Address validation before API calls to avoid wasted credits
- Cached results (Redis + PostgreSQL) to avoid redundant API hits

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL
- Redis

### Backend
```bash
cd backend
npm install
cp .env.example .env   # fill in credentials
node server.js
```

### Frontend
```bash
cd frontend
npm install
npm start
```

### Environment Variables
```
DATABASE_URL=
REDIS_URL=
GOOGLE_MAPS_API_KEY=
PROPERTY_LENS_CLIENT_ID=
PROPERTY_LENS_CLIENT_SECRET=
JWT_SECRET=
```
