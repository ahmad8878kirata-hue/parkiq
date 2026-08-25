# ParkIQ

Park-and-ride trip planner for Stuttgart — finds parking near transit and routes you to your destination with cost estimates, real road driving paths, and transit options.

## Features

- **Live parking data** from MobiData BW API — real-time availability for park-and-ride sites across Baden-Württemberg
- **Multiple route options** — different transit modes (bus, train, bicycle) with cost breakdowns and duration estimates
- **Real road routing** via OSRM — driving paths follow actual streets
- **Direct transit routes** — when the destination is close enough, shows transit-only options without parking
- **Interactive map** (Leaflet) — clickable parking markers, route visualization, dark mode support
- **Mobile-first** responsive layout with bottom sheet UI
- **Geocoding** — address search and reverse geocoding via Nominatim (rate-limited, cached)

## Project Structure

```
parkiq/
├── backend/                  Express API (port 5000)
│   ├── server.js             Main server — all API endpoints, routing, caching
│   ├── parking_cache.json    Disk cache for parking data (auto-generated)
│   ├── package.json
│   └── .env                  Backend environment variables
├── frontend/                 React + Vite (port 5173)
│   ├── .env                  Frontend environment variables
│   ├── src/
│   │   ├── config.js         Centralized API base URL
│   │   ├── main.jsx          Entry point
│   │   ├── App.jsx           Route definitions
│   │   ├── pages/
│   │   │   ├── Home.jsx          Main map view with parking list
│   │   │   ├── Search.jsx        Alternative search entry point
│   │   │   ├── Results.jsx       Route results with map and transit details
│   │   │   ├── Selection.jsx     Parking lot detail sheet
│   │   │   └── Onboarding.jsx    First-time user onboarding flow
│   │   ├── components/
│   │   │   ├── AutocompleteInput.jsx   Address autocomplete dropdown
│   │   │   ├── DateTimePicker.jsx      Calendar + time picker
│   │   │   └── RouteSearchForm.jsx     Shared start/destination form
│   │   ├── services/
│   │   │   └── geocodingService.js     Shared geocoding helpers
│   │   ├── context/
│   │   │   └── ParkingContext.jsx      Global state (location, registration)
│   │   └── index.css           Global styles
│   ├── index.html
│   └── package.json
└── README.md
```

## Setup

### Backend

```bash
cd backend
npm install
node server.js
```

The server starts on `http://localhost:5000` (configurable via `PORT` env var).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens on `http://localhost:5173`.

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Server listen port |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:5000` | Backend API base URL |

The frontend reads `VITE_API_BASE_URL` at build time via `src/config.js`. Set this to your deployed backend URL in production.

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Health check — returns `{ status: 'OK' }` |
| `/api/parking/bw` | GET | Baden-Württemberg parking sites (5 min in-memory cache + disk cache fallback) |
| `/api/parkbauten` | GET | Parking structure GeoJSON from MobiData BW CKAN |
| `/api/routes` | POST | Route calculation from parking to destination |
| `/api/radar` | GET | Live HAFAS vehicle movements in Stuttgart area |
| `/api/transit-stops` | GET | Fallback transit stop locations (GeoJSON) |
| `/api/geocode/search` | GET | Forward geocoding proxy (Nominatim, rate-limited, cached) |
| `/api/geocode/reverse` | GET | Reverse geocoding proxy (Nominatim, rate-limited, cached) |

### `POST /api/routes`

Calculates routes from the user's location to a destination via a parking site.

**Request body:**

```json
{
  "destination": "Stuttgart Hbf",
  "destCoords": [48.784, 9.182],
  "startCoords": [48.775, 9.183],
  "arrivalTime": "2026-08-25T15:00:00",
  "parkingId": 402,
  "transportMode": "train",
  "maxTimeMinutes": 120
}
```

| Field | Required | Description |
|---|---|---|
| `destination` | Yes (or `destCoords`) | Destination address/name for geocoding |
| `destCoords` | Yes (or `destination`) | `[lat, lon]` destination coordinates |
| `startCoords` | No | `[lat, lon]` user's current position |
| `arrivalTime` | No | ISO 8601 arrival time |
| `parkingId` | No | Specific parking site ID to route from |
| `transportMode` | No | `train`, `bus`, `cycling`, `bicycle`, or `transit` |
| `maxTimeMinutes` | No | Max transit time in minutes (1–1440, default 120) |

**Validation:** All fields are validated before processing. Invalid requests return `400` with a German error message.

**Response:** Returns route variants with segments (driving/walking/transit), OSRM road paths, timeline, and cost breakdown. May also return a `directTransit` route when no parking is needed.

### `GET /api/geocode/search`

Forward geocoding proxy. Query parameters: `q` (required), `limit`, `countrycodes`, `addressdetails`. Results are cached in-memory (max 200 entries) and rate-limited to respect Nominatim usage policy.

### `GET /api/geocode/reverse`

Reverse geocoding proxy. Query parameters: `lat`, `lon` (both required), `format`, `addressdetails`, `zoom`. Cached by coordinate (4 decimal places).

## Tech Stack

- **Frontend:** React 18, Vite 5, Leaflet 1.9.4, React Router 7, Phosphor Icons
- **Backend:** Express 5, `db-hafas` / `hafas-client` (DB transit API), Axios
- **Maps:** Leaflet + CartoDB tiles, OSRM routing
- **Geocoding:** Nominatim (OpenStreetMap) via backend proxy
- **Data sources:** MobiData BW (live parking), MobiData BW CKAN (parking structures), DB-HAFAS (transit schedules), Overpass API (transit stops)

## Caching and Fallback Behavior

- **Parking data:** 5-minute in-memory cache; disk cache (`parking_cache.json`) as fallback when live API is unavailable
- **Geocoding:** In-memory cache for search results (max 200) and reverse lookups, rate-limited to 1 request/second to Nominatim
- **HAFAS transit:** 2-second timeout per request; if unavailable, falls back to estimated transit data
- **Route calculation:** 60-second overall timeout; returns `504` if exceeded
- **Transit stops:** Hardcoded fallback list when Overpass API is unavailable

## Known Limitations

- **Prototype status** — not production-hardened; no authentication, no rate limiting on most endpoints
- **Stuttgart-focused** — default map center and transit data are Stuttgart-specific; other cities may have limited coverage
- **HAFAS dependency** — transit routing requires a working DB-HAFAS connection; without it, only estimated schedules are available
- **Single-user design** — no session management, no persistent user data
- **No PWA/offline support** — requires an active internet connection
- **Parking availability** — live data depends on MobiData BW API uptime; may show stale data during outages
