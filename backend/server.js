const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ====== MobiData BW Live Parking Cache ======
let parkingCache = { data: null, lastUpdated: null };
const MOBIDATA_PARK_API = 'https://api.mobidata-bw.de/park-api/api/public/v3/parking-sites';
const CACHE_DURATION = 5 * 60 * 1000; // 5 Minuten
const CACHE_FILE = path.join(__dirname, 'parking_cache.json');

function isGenericParkingName(name) {
    return !name || /^(parkplatz|parken|garage|tiefgarage|parkhaus|parkdeck|p\+r|park\s*\+?\s*ride)$/i.test(name.trim());
}

function isCityOnlyAddress(address) {
    return address && /^[A-ZÄÖÜ][a-zäöüß]+(\s+[A-ZÄÖÜ][a-zäöüß]+)?$/.test(address.trim());
}

function formatParkingType(type) {
    const typeMap = {
        'UNDERGROUND': 'Tiefgarage',
        'COVERED': 'Parkdeck',
        'OPEN': 'Parkplatz',
        'MULTI_STOREY': 'Parkhaus',
        'CAR_PARK': 'Parkhaus',
        'OFF_STREET_PARKING_GROUND': 'Parkplatz',
        'OFF_STREET_BUILDING': 'Parkhaus',
        'ON_STREET': 'Straßenparken'
    };
    return typeMap[(type || '').toUpperCase()] || null;
}

function enhanceParkingName(rawName, address, siteType, description, capacity) {
    const name = (rawName || '').trim();
    const addr = (address || '').trim();

    if (!isGenericParkingName(name)) {
        // Name is already specific (e.g., "Parkgarage Neckartor", "Milaneo")
        return name;
    }

    // For generic names, build a descriptive label from available data
    const parts = [];
    const typeName = formatParkingType(siteType);
    parts.push(typeName || name || 'Parkplatz');

    if (addr && !isCityOnlyAddress(addr)) {
        // Has a real street address
        parts.push(addr);
    } else if (capacity) {
        // No real address, add capacity hint
        parts.push(`${capacity} spots`);
    }

    return parts.join(' - ');
}

function transformSite(site) {
    const capacity = site.capacity || 0;
    const lat = parseFloat(site.lat);
    const lon = parseFloat(site.lon);
    const address = site.address || '';
    return {
        id: site.id,
        name: enhanceParkingName(site.name, address, site.type, site.description, capacity),
        rawName: site.name,
        coordinates: [lat, lon],
        address,
        parkingType: site.type || null,
        totalCapacity: capacity,
        freeSpaces: capacity,
        occupancyRate: 0,
        hasRealtime: !!site.has_realtime_data,
        hasFee: site.has_fee,
        feeDescription: site.fee_description || null,
        description: site.description || null,
        amenities: {
            evCharging: (site.capacity_charging || 0) > 0,
            maxHeight: site.max_height || null
        },
        status: 'available'
    };
}

// Cache for reverse geocoding results (coords -> street name)
const geocodeCache = new Map();
const GEOCODE_CACHE_MAX = 200;

// Cache for forward geocoding search results
const searchCache = new Map();
const SEARCH_CACHE_MAX = 200;

// Rate limiter for Nominatim API (max 1 req/sec per their policy)
let lastNominatimRequest = 0;
const NOMINATIM_INTERVAL = 1100;
const pendingQueue = [];
let processingQueue = false;

async function processQueue() {
    if (processingQueue) return;
    processingQueue = true;
    while (pendingQueue.length > 0) {
        const elapsed = Date.now() - lastNominatimRequest;
        if (elapsed < NOMINATIM_INTERVAL) {
            await new Promise(r => setTimeout(r, NOMINATIM_INTERVAL - elapsed));
        }
        const { url, resolve, reject } = pendingQueue.shift();
        lastNominatimRequest = Date.now();
        try {
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'ParkIQ/1.0 (contact@parkiq.example.com)' },
                timeout: 5000
            });
            resolve(response);
        } catch (err) {
            reject(err);
        }
    }
    processingQueue = false;
}

function rateLimitedNominatim(url) {
    return new Promise((resolve, reject) => {
        pendingQueue.push({ url, resolve, reject });
        processQueue();
    });
}

// Reverse geocode coordinates to get street name for generic parking entries
async function resolveGenericParkingNames(parkings) {
    const needsResolve = parkings.filter(p => isGenericParkingName(p.rawName || p.name));
    if (needsResolve.length === 0) return;

    for (let i = 0; i < needsResolve.length; i++) {
        const parking = needsResolve[i];
        const [lat, lon] = parking.coordinates;
        const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
        if (geocodeCache.has(cacheKey)) {
            const cached = geocodeCache.get(cacheKey);
            applyResolvedName(parking, cached);
            continue;
        }
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=18`;
            const res = await rateLimitedNominatim(url);
            const addr = res.data?.address || {};
            const road = addr.road || addr.pedestrian || addr.path || addr.square || '';
            const suburb = addr.suburb || addr.neighbourhood || addr.city_district || '';
            const city = addr.city || addr.town || addr.village || '';
            const resolved = { road, suburb, city };
            if (geocodeCache.size < GEOCODE_CACHE_MAX) geocodeCache.set(cacheKey, resolved);
            applyResolvedName(parking, resolved);
        } catch {
            // Geocoding failed, keep the name from enhanceParkingName
        }
    }
}

function applyResolvedName(parking, resolved) {
    const { road, suburb, city } = resolved;
    const typeName = formatParkingType(parking.parkingType) || (parking.rawName || parking.name || 'Parkplatz').trim();
    const locationParts = [];
    if (road) locationParts.push(road);
    if (suburb && suburb !== city) locationParts.push(suburb);
    else if (city) locationParts.push(city);
    const location = locationParts.join(', ');
    if (location) {
        parking.name = `${typeName} - ${location}`;
    } else {
        parking.name = typeName;
    }
}

function loadDiskCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed.data && Array.isArray(parsed.data) && parsed.data.length > 0) {
                parkingCache.data = parsed.data;
                parkingCache.lastUpdated = parsed.lastUpdated || Date.now();
                console.log(`Loaded ${parsed.data.length} parking sites from disk cache`);
                return true;
            }
        }
    } catch (err) {
        console.error('Failed to load disk cache:', err.message);
    }
    return false;
}

function saveDiskCache() {
    try {
        const payload = { data: parkingCache.data, lastUpdated: parkingCache.lastUpdated };
        fs.writeFileSync(CACHE_FILE, JSON.stringify(payload), 'utf-8');
    } catch (err) {
        console.error('Failed to save disk cache:', err.message);
    }
}

// Try to load cache from disk on startup, then attempt a background refresh
loadDiskCache();
if (!parkingCache.data) {
    parkingCache.data = [];
    parkingCache.lastUpdated = Date.now();
}
// Attempt initial API fetch immediately (after setup) so cache is warm for first visitor
setTimeout(() => fetchAndCacheParking().catch(() => {}), 0);
setTimeout(() => fetchAndCacheParking().catch(() => {}), 30000);

const STUTTGART_CENTER = { lat: 48.7758, lon: 9.1829 };
const RADIUS_METERS = 5000;
const PAGINATION_LIMIT = 200;

const BW_CITIES = [
    { name: 'Stuttgart', lat: 48.7758, lon: 9.1829, radius: 40000 },
    { name: 'Karlsruhe', lat: 49.0069, lon: 8.4037, radius: 30000 },
    { name: 'Mannheim', lat: 49.4875, lon: 8.4660, radius: 30000 },
    { name: 'Freiburg', lat: 47.9990, lon: 7.8421, radius: 30000 },
    { name: 'Heidelberg', lat: 49.3988, lon: 8.6724, radius: 20000 },
    { name: 'Ulm', lat: 48.4011, lon: 9.9876, radius: 20000 },
    { name: 'Heilbronn', lat: 49.1427, lon: 9.2109, radius: 20000 },
    { name: 'Pforzheim', lat: 48.8910, lon: 8.6946, radius: 15000 }
];

async function fetchAndCacheParking() {
    let allSites = [];
    const seenIds = new Set();

    try {
        for (const city of BW_CITIES) {
            try {
                const url = `${MOBIDATA_PARK_API}?lat=${city.lat}&lon=${city.lon}&radius=${city.radius}&limit=${PAGINATION_LIMIT}`;
                const response = await axios.get(url, {
                    headers: { 'Accept': 'application/json' },
                    timeout: 15000
                });
                const items = response.data?.items || [];
                const filtered = items.filter(s => s.purpose === 'CAR').map(transformSite);
                
                for (const s of filtered) {
                    if (!seenIds.has(s.id)) {
                        seenIds.add(s.id);
                        allSites.push(s);
                    }
                }
            } catch (e) {
                console.error(`Error fetching for ${city.name}:`, e.message);
            }
        }

        if (allSites.length > 0) {
            console.log(`Fetched ${allSites.length} parking sites across Baden-Württemberg`);
            
            parkingCache.data = allSites;
            parkingCache.lastUpdated = Date.now();
            saveDiskCache();
            
            // Resolve generic names in the background to not block the request
            resolveGenericParkingNames(allSites).then(() => {
                parkingCache.lastUpdated = Date.now();
                saveDiskCache();
            }).catch(e => console.error("Error resolving names in bg:", e.message));
            
        } else {
            console.log('Empty statewide response, falling back to Stuttgart-area fetch');
            return await fetchAndCacheParkingStuttgart();
        }
        return parkingCache.data;
    } catch (err) {
        console.error('MobiData BW API Error:', err.message);
        if (!parkingCache.data?.length) {
            return await fetchAndCacheParkingStuttgart();
        }
        return parkingCache.data || [];
    }
}

async function fetchAndCacheParkingStuttgart() {
    const allSites = [];
    let start = 0;
    let hasMore = true;

    try {
        while (hasMore) {
            const url = `${MOBIDATA_PARK_API}?lat=${STUTTGART_CENTER.lat}&lon=${STUTTGART_CENTER.lon}&radius=50000&limit=${PAGINATION_LIMIT}&start=${start}`;
            const response = await axios.get(url, {
                headers: { 'Accept': 'application/json' },
                timeout: 8000
            });
            const items = response.data?.items || [];
            if (items.length === 0) break;

            const filtered = items
                .filter(s => s.purpose === 'CAR')
                .map(transformSite);

            allSites.push(...filtered);

            if (items.length < PAGINATION_LIMIT) {
                hasMore = false;
            } else {
                start = response.data.next_id || start + PAGINATION_LIMIT;
            }
        }

        if (allSites.length > 0) {
            await resolveGenericParkingNames(allSites);
            parkingCache.data = allSites;
            parkingCache.lastUpdated = Date.now();
            saveDiskCache();
            console.log(`Fetched ${allSites.length} parking sites from Stuttgart-area fallback`);
        }
        return parkingCache.data;
    } catch (err) {
        console.error('MobiData BW API Error (Stuttgart fallback):', err.message);
        return parkingCache.data || [];
    }
}

async function fetchParkingNear(lat, lon, radius = 10000, { skipNameResolve = false } = {}) {
    const allSites = [];
    let start = 0;
    let hasMore = true;

    try {
        while (hasMore) {
            const url = `${MOBIDATA_PARK_API}?lat=${lat}&lon=${lon}&radius=${radius}&limit=${PAGINATION_LIMIT}&start=${start}`;
            const response = await axios.get(url, {
                headers: { 'Accept': 'application/json' },
                timeout: 8000
            });
            const items = response.data?.items || [];
            if (items.length === 0) break;

            const filtered = items
                .filter(s => s.purpose === 'CAR')
                .map(transformSite);

            allSites.push(...filtered);

            if (items.length < PAGINATION_LIMIT) {
                hasMore = false;
            } else {
                start = response.data.next_id || start + PAGINATION_LIMIT;
            }
        }
        // Skip slow Nominatim geocoding during route requests (1 req/sec rate limit)
        if (!skipNameResolve) {
            await resolveGenericParkingNames(allSites);
        }
        return allSites;
    } catch (err) {
        console.error('MobiData BW API Error (fetchParkingNear):', err.message);
        // Fall back to cached data when the API is unavailable
        return parkingCache.data || [];
    }
}

app.get('/api/parking/bw', async (req, res) => {
    const now = Date.now();
    if (parkingCache.data && parkingCache.data.length > 0 && (now - parkingCache.lastUpdated < CACHE_DURATION)) {
        return res.json({ source: 'cache', sites: parkingCache.data });
    }
    try {
        const sites = await fetchAndCacheParking();
        if (sites && sites.length > 0) {
            res.json({ source: 'live', sites });
        } else {
            // API returned empty — try disk cache
            const loaded = loadDiskCache();
            if (loaded && parkingCache.data.length > 0) {
                res.json({ source: 'disk_cache', sites: parkingCache.data, error: 'Live data unavailable' });
            } else {
                res.json({ source: 'empty', sites: [] });
            }
        }
    } catch (error) {
        console.error('MobiData BW API Error:', error.message);
        if (parkingCache.data && parkingCache.data.length > 0) {
            return res.json({ source: 'fallback_cache', sites: parkingCache.data, error: 'Live data unavailable' });
        }
        // Last resort — try disk cache
        const loaded = loadDiskCache();
        if (loaded) {
            return res.json({ source: 'disk_cache', sites: parkingCache.data, error: 'Live data unavailable' });
        }
        res.json({ source: 'empty', sites: [] });
    }
});
// ====== End MobiData BW ======

const DIRECT_CITY_PARKING_COST = 18.00;
const DEFAULT_PARKING_PRICE = 4.00;
const DEFAULT_HOURLY_RATE = '2 EUR/hr';
const MAX_WALK_PER_SEGMENT = 1000; // meters – max reasonable walk to/from a transit stop
const MAX_WALK_TOTAL = 1500; // meters – max total walking for park→stop + stop→dest

let hafasClient = null;
async function getClient() {
    if (!hafasClient) {
        const { createDbHafas } = await import('db-hafas');
        hafasClient = createDbHafas('parkiq-smart-planner');
    }
    return hafasClient;
}

async function getParkingSites() {
    const now = Date.now();
    if (parkingCache.data && parkingCache.data.length > 0 && (now - parkingCache.lastUpdated < CACHE_DURATION)) {
        return parkingCache.data;
    }
    try {
        return await fetchAndCacheParking();
    } catch (err) {
        console.error('Failed to fetch MobiData BW parking:', err.message);
        return parkingCache.data || [];
    }
}

// Run a promise with a timeout (rejects after ms)
function withTimeout(promise, ms = 5000) {
    let id;
    const timeout = new Promise((_, rej) => { id = setTimeout(() => rej(new Error('Timeout')), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(id));
}

// Approx distance in metres between two lat/lon points (Haversine)
function distanceMeters([lat1, lon1], [lat2, lon2]) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pathLengthMeters(path) {
    let total = 0;
    for (let i = 1; i < path.length; i++) total += distanceMeters(path[i - 1], path[i]);
    return total;
}

function extractPriceText(site) {
    if (!site) return null;
    const desc = site.feeDescription || site.description || '';
    if (!desc) return null;
    const euroMatch = desc.match(/\d+[.,]\d{2}\s*€/);
    if (euroMatch) return euroMatch[0].trim();
    const ctMatch = desc.match(/\d+\s*ct\/\w+/i);
    if (ctMatch) return ctMatch[0].trim();
    return null;
}

function getParkingPricing(site) {
    const isFree = site.hasFee === false;
    const extractedPrice = extractPriceText(site);
    const hasPriceData = site.hasFee === true && extractedPrice !== null;

    if (isFree) {
        return { isFree: true, displayPrice: 'Free', numericPrice: 0 };
    }
    if (hasPriceData) {
        return { isFree: false, displayPrice: extractedPrice, numericPrice: parseFloat(extractedPrice.replace(',', '.').replace(/[^0-9.]/g, '')) || DEFAULT_PARKING_PRICE };
    }
    if (site.hasFee === true) {
        return { isFree: false, displayPrice: DEFAULT_HOURLY_RATE, numericPrice: DEFAULT_PARKING_PRICE };
    }
    return { isFree: false, displayPrice: DEFAULT_HOURLY_RATE, numericPrice: DEFAULT_PARKING_PRICE };
}

function estimateParkingPrice(name) {
    const n = name.toLowerCase();
    if (n.includes('parkhaus') || n.includes('garage') || n.includes('tiefgarage')) return 4.50;
    if (n.includes('p+r') || n.includes('pr') || n.includes('p-r')) return 3.00;
    return 3.50;
}

// Estimate station coords relative to parking (toward Stuttgart center)
function estimateStationCoords(parkCoords, walkDistance) {
    const center = [48.7758, 9.1829];
    const dx = center[0] - parkCoords[0];
    const dy = center[1] - parkCoords[1];
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const offsetDeg = Math.min(walkDistance / 111000, dist * 0.5);
    return [
        +(parkCoords[0] + (dx / dist) * offsetDeg).toFixed(6),
        +(parkCoords[1] + (dy / dist) * offsetDeg).toFixed(6)
    ];
}

// Estimate destination coordinates from name
function estimateDestCoords(destName) {
    const name = (destName || '').toLowerCase();
    if (name.includes('hbf') || name.includes('hauptbahnhof')) return [48.7833, 9.1833];
    if (name.includes('flughafen') || name.includes('airport')) return [48.6899, 9.2219];
    if (name.includes('messe') || name.includes('fair')) return [48.6783, 9.2094];
    return [48.7758, 9.1829];
}

// Simplify a polyline path by removing points with Ramer-Douglas-Peucker
function simplifyPath(path, tolerance = 0.00008) {
    if (path.length <= 2) return path;
    let maxDist = 0, maxIdx = 0;
    const [first, last] = [path[0], path[path.length - 1]];
    for (let i = 1; i < path.length - 1; i++) {
        const d = crossTrackDist(path[i], first, last);
        if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxDist > tolerance) {
        const left = simplifyPath(path.slice(0, maxIdx + 1), tolerance);
        const right = simplifyPath(path.slice(maxIdx), tolerance);
        return left.slice(0, -1).concat(right);
    }
    return [first, last];
}
function crossTrackDist(p, a, b) {
    const [px, py] = p, [ax, ay] = a, [bx, by] = b;
    const dx = bx - ax, dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-10) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
    return Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
}

// Generate intermediate points along a straight line (fallback when OSRM fails)
function interpolatePoints(from, to, count = 6) {
    const pts = [];
    for (let i = 0; i <= count; i++) {
        const t = i / count;
        pts.push([
            +(from[0] + (to[0] - from[0]) * t).toFixed(6),
            +(from[1] + (to[1] - from[1]) * t).toFixed(6)
        ]);
    }
    return pts;
}

// OSRM route cache (in-memory)
const osrmCache = new Map();
const OSRM_CACHE_MAX = 100;
function setOsrmCache(key, value) {
    if (osrmCache.size >= OSRM_CACHE_MAX) {
        const first = osrmCache.keys().next().value;
        if (first) osrmCache.delete(first);
    }
    osrmCache.set(key, value);
}

async function fetchOSRMRoute(from, to, profile = 'driving') {
    const key = `${from[0].toFixed(5)},${from[1].toFixed(5)}-${to[0].toFixed(5)},${to[1].toFixed(5)}-${profile}`;
    if (osrmCache.has(key)) return osrmCache.get(key);

    const profileMap = { driving: 'driving', walking: 'foot', cycling: 'cycling' };
    const url = `https://router.project-osrm.org/route/v1/${profileMap[profile] || 'driving'}/${from[1]},${from[0]};${to[1]},${to[0]}?geometries=geojson&overview=full&steps=false&alternatives=true`;

    try {
        const res = await axios.get(url, { timeout: 5000 });
        if (res.data?.code === 'Ok' && res.data?.routes?.length > 0) {
            let bestRoute = res.data.routes[0];
            let bestPathLength = Infinity;
            let bestRawPath = null;

            for (const route of res.data.routes) {
                const coords = route.geometry.coordinates;
                if (coords.length < 3) continue;
                const rawPath = coords.map(c => [+c[1], +c[0]]);
                const length = pathLengthMeters(rawPath);
                if (length < bestPathLength) {
                    bestPathLength = length;
                    bestRoute = route;
                    bestRawPath = rawPath;
                }
            }

            if (!bestRawPath) return null;
            const fixedPath = bestRawPath.map(c => [+c[0].toFixed(6), +c[1].toFixed(6)]);
            const path = simplifyPath(fixedPath);
            const durationMin = Math.max(1, Math.round(bestRoute.duration / 60));
            const result = { path, durationMin, pathLength: Math.round(bestPathLength) };
            setOsrmCache(key, result);
            return result;
        }
    } catch { }
    return null;
}

// ====== Transit Stops Fetcher ======
const FALLBACK_STOPS = require('./transit_stops_fallback');

// In-memory cache for Overpass transit stop queries
const transitStopsCache = new Map();
const TRANSIT_STOPS_CACHE_MAX = 30;
const TRANSIT_STOPS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function fetchTransitStopsBBox(destCoords, parkings = [], startCoords = null) {
    // Build bbox around destination + nearby parkings (NOT startCoords)
    let minLat = destCoords[0], maxLat = destCoords[0];
    let minLon = destCoords[1], maxLon = destCoords[1];

    for (const p of parkings) {
        minLat = Math.min(minLat, p.coordinates[0]);
        maxLat = Math.max(maxLat, p.coordinates[0]);
        minLon = Math.min(minLon, p.coordinates[1]);
        maxLon = Math.max(maxLon, p.coordinates[1]);
    }

    // Clamp the bbox to a maximum of ~0.18 degrees (~20km) from the destination
    // to avoid pulling in transit stops from irrelevant areas when a parking is far.
    // The destination is the primary anchor — parkings beyond this radius won't
    // extend the search area (they are too far to be walkable to a stop anyway).
    const MAX_BBOX_RADIUS = 0.18;
    minLat = Math.max(minLat, destCoords[0] - MAX_BBOX_RADIUS);
    maxLat = Math.min(maxLat, destCoords[0] + MAX_BBOX_RADIUS);
    minLon = Math.max(minLon, destCoords[1] - MAX_BBOX_RADIUS);
    maxLon = Math.min(maxLon, destCoords[1] + MAX_BBOX_RADIUS);

    // Add padding (~4km)
    minLat -= 0.035; maxLat += 0.035;
    minLon -= 0.045; maxLon += 0.045;

    // Round bbox to 2 decimals for cache key stability
    const cacheKey = `${minLat.toFixed(2)},${minLon.toFixed(2)},${maxLat.toFixed(2)},${maxLon.toFixed(2)}`;
    const cached = transitStopsCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts < TRANSIT_STOPS_CACHE_TTL)) {
        return cached.stops;
    }

    const query = `[out:json][timeout:15];
(
  node(${minLat},${minLon},${maxLat},${maxLon})["highway"="bus_stop"];
  node(${minLat},${minLon},${maxLat},${maxLon})["railway"="station"];
  node(${minLat},${minLon},${maxLat},${maxLon})["railway"="tram_stop"];
  node(${minLat},${minLon},${maxLat},${maxLon})["railway"="halt"];
);
out body;`;

    const endpoints = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter'
    ];

    for (const url of endpoints) {
        try {
            const response = await axios.get(url, {
                params: { data: query },
                headers: { 
                    'User-Agent': 'ParkIQ/1.0 (contact@parkiq.example.com)',
                    'Accept': 'application/json'
                },
                timeout: 10000
            });
            const elements = response.data.elements || [];
            if (elements.length > 0) {
                const stops = elements.map(e => {
                    const highway = e.tags?.highway || '';
                    const railway = e.tags?.railway || '';
                    const amenity = e.tags?.amenity || '';
                    const type = railway || highway || amenity || 'transit';
                    return {
                        name: e.tags?.name || 'Transit Stop',
                        coordinates: [e.lat, e.lon],
                        type: type.toLowerCase()
                    };
                });
                // Only append fallback stops if we got actual results from Overpass
                // (fallback stops are Stuttgart-area only and should not pollute other regions)
                const result = stops.length > 0 ? stops : FALLBACK_STOPS;
                // Cache the result
                if (transitStopsCache.size >= TRANSIT_STOPS_CACHE_MAX) {
                    const firstKey = transitStopsCache.keys().next().value;
                    if (firstKey) transitStopsCache.delete(firstKey);
                }
                transitStopsCache.set(cacheKey, { stops: result, ts: Date.now() });
                return result;
            }
        } catch (err) {
            if (err.response?.status === 429) {
                await new Promise(r => setTimeout(r, 500));
                continue;
            }
        }
    }
    return FALLBACK_STOPS;
}

function findNearestTransitStop(coords, stops, modeKeywords) {
    let best = null;
    let bestDist = Infinity;
    for (const stop of stops) {
        const t = stop.type || '';
        const matches = modeKeywords.some(kw => t.includes(kw));
        if (!matches) continue;
        const d = distanceMeters(coords, stop.coordinates);
        if (d < bestDist) {
            bestDist = d;
            best = stop;
        }
    }
    return best ? { name: best.name, coordinates: best.coordinates, distance: Math.round(bestDist) } : null;
}

// Find top N nearest transit stops by Haversine distance within a walkable radius
function findTopTransitStops(coords, stops, modeKeywords, count = 3, maxDistance = MAX_WALK_PER_SEGMENT * 3) {
    const scored = [];
    for (const stop of stops) {
        const t = stop.type || '';
        const matches = modeKeywords.some(kw => t.includes(kw));
        if (!matches) continue;
        const dist = distanceMeters(coords, stop.coordinates);
        if (dist > maxDistance) continue;
        scored.push({ stop, dist });
    }
    scored.sort((a, b) => a.dist - b.dist);
    return scored.slice(0, count).map(s => ({
        name: s.stop.name,
        coordinates: s.stop.coordinates,
        distance: Math.round(s.dist)
    }));
}

// Find the transit stop with the shortest actual walking path (via OSRM).
// Considers top N candidates by Haversine, fetches OSRM walking routes for each,
// and picks the one with the shortest actual walking distance.
// Returns null if no candidate is within maxWalkMeters (no unlimited fallback).
async function findNearestTransitStopByWalking(coords, stops, modeKeywords, maxWalkMeters = MAX_WALK_PER_SEGMENT) {
    const candidates = [];
    for (const stop of stops) {
        const t = stop.type || '';
        if (!modeKeywords.some(kw => t.includes(kw))) continue;
        const d = distanceMeters(coords, stop.coordinates);
        candidates.push({ stop, d });
    }
    
    // Sort by Haversine distance and take top 5
    candidates.sort((a, b) => a.d - b.d);
    const topCandidates = candidates.slice(0, 5);
    
    if (topCandidates.length === 0) return null;
    
    let best = null;
    let bestWalkDist = Infinity;
    
    // Fetch OSRM walking routes for each candidate in parallel for speed
    const osrmResults = await Promise.all(topCandidates.map(c => 
        fetchOSRMRoute(coords, c.stop.coordinates, 'walking')
    ));
    
    for (let i = 0; i < topCandidates.length; i++) {
        const cand = topCandidates[i];
        const osrmResult = osrmResults[i];
        const walkDist = osrmResult?.pathLength || cand.d;
        
        if (walkDist < bestWalkDist && walkDist <= maxWalkMeters) {
            bestWalkDist = walkDist;
            best = cand.stop;
        }
    }
    
    return best ? { name: best.name, coordinates: best.coordinates, distance: Math.round(bestWalkDist) } : null;
}

// Find a HAFAS station ID for a stop name/coords
async function findHafasStation(client, coords, nameHint) {
    try {
        const locs = await withTimeout(client.locations(nameHint || 'stop', { results: 5, fuzzy: true }), 3000);
        if (!locs || locs.length === 0) return null;
        // Find closest to our coordinates
        let best = null, bestDist = Infinity;
        for (const loc of locs) {
            if (loc.location?.latitude && loc.location?.longitude) {
                const d = distanceMeters(coords, [+loc.location.latitude, +loc.location.longitude]);
                if (d < bestDist) {
                    bestDist = d;
                    best = loc;
                }
            }
        }
        return best;
    } catch { return null; }
}

// Use DB HAFAS journeys API to get actual public transport data
async function fetchHafasJourney(client, fromCoords, toCoords, fromName, toName, mode) {
    try {
        const [fromStation, toStation] = await Promise.all([
            findHafasStation(client, fromCoords, fromName),
            findHafasStation(client, toCoords, toName)
        ]);
        if (!fromStation || !toStation) return null;

        const [fromId, toId] = [fromStation.id, toStation.id];
        return await doHafasJourney(client, fromId, toId, mode);
    } catch (err) {
        console.error('HAFAS journey fetch failed:', err.message);
        return null;
    }
}

async function fetchHafasJourneyById(client, fromId, toId, mode) {
    try {
        return await doHafasJourney(client, fromId, toId, mode);
    } catch (err) {
        console.error('HAFAS journey by ID fetch failed:', err.message);
        return null;
    }
}

async function doHafasJourney(client, fromId, toId, mode) {
    const results = await withTimeout(
        client.journeys(fromId, toId, {
            results: 3,
            products: mode === 'bus' ? { bus: true, express: false, regional: false, suburban: false, tram: false, ferry: false } : {},
            walkingSpeed: 'normal',
            start: new Date()
        }),
        10000
    );
    if (!results || !results.journeys || results.journeys.length === 0) return null;
    const journey = results.journeys[0];
    const legs = journey.legs || [];
    let fullPath = [];
    let totalDuration = 0;
    let legInfos = [];
    for (const leg of legs) {
        if (leg.mode === 'walking' && leg.walking) continue;
        const coords = leg.polyline?.features?.flatMap(f => f.geometry?.coordinates || []) || [];
        const pathPoints = coords.map(c => [+c[1], +c[0]]).filter(p => isFinite(p[0]) && isFinite(p[1]));
        if (pathPoints.length > 0) {
            fullPath = fullPath.concat(pathPoints);
        }
        totalDuration += leg.departure && leg.arrival
            ? (new Date(leg.arrival) - new Date(leg.departure)) / 60000
            : (leg.duration || 0) / 60;
        legInfos.push({
            line: leg.line?.name || (leg.mode === 'walking' ? 'walk' : 'transit'),
            mode: leg.mode,
            origin: leg.origin?.name || '',
            destination: leg.destination?.name || '',
            departure: leg.departure,
            arrival: leg.arrival
        });
    }
    if (fullPath.length <= 1) return null;
    const path = simplifyPath(fullPath);
    return {
        path,
        durationMin: Math.max(1, Math.round(totalDuration)),
        legs: legInfos,
        departure: journey.legs?.[0]?.departure,
        arrival: journey.legs?.[journey.legs.length - 1]?.arrival
    };
}

// Find nearest station via HAFAS nearby() API
async function findNearestStationHafas(client, coords) {
    if (!client) return null;
    try {
        const locs = await withTimeout(client.nearby({
            type: 'location',
            latitude: coords[0],
            longitude: coords[1]
        }, { results: 10, distance: 5000, poi: false, stops: true }), 3000);
        if (locs && locs.length > 0) {
            let best = null, bestDist = Infinity;
            for (const loc of locs) {
                if (!loc.location?.latitude || !loc.location?.longitude) continue;
                const d = distanceMeters(coords, [+loc.location.latitude, +loc.location.longitude]);
                if (d < bestDist) {
                    bestDist = d;
                    best = loc;
                }
            }
            if (best) {
                return { name: best.name || best.id, coordinates: [+best.location.latitude, +best.location.longitude], distance: Math.round(bestDist), stationId: best.id };
            }
        }
    } catch {}
    return null;
}

// Build 4-segment route: drive → walk to stop → transit/cycle → walk to dest
async function generateRouteWithMode(parkCoords, startCoords, destCoords, destName, transportMode, hafasClient) {
    const center = startCoords || [48.7758, 9.1829];

    const drivingResult = await fetchOSRMRoute(center, parkCoords, 'driving');
    const drivingPath = drivingResult?.path || interpolatePoints(center, parkCoords);
    const driveMinutes = Math.min(240, drivingResult?.durationMin || Math.max(1, Math.round(distanceMeters(center, parkCoords) / 1000)));

    const segments = [
        { mode: 'driving', path: drivingPath, label: 'Drive', durationMin: driveMinutes }
    ];

    let modeKeywords = ['station', 'halt', 'train', 'rail', 'metro', 'bahn', 's-bahn', 'u-bahn'];
    let modeLabel = 'transit';

    if (transportMode === 'bus') {
        modeKeywords = ['bus'];
        modeLabel = 'bus';
    } else if (transportMode === 'cycling' || transportMode === 'bicycle') {
        modeKeywords = ['bike', 'bicycle', 'cycling'];
        modeLabel = 'cycling';
    } else {
        modeKeywords = ['station', 'halt', 'train', 'rail', 'metro', 'bahn', 's-bahn', 'u-bahn'];
        modeLabel = 'train';
    }

    // Find nearest stations using Overpass (HAFAS unavailable in this environment)
    const allStops = await fetchTransitStopsBBox(destCoords, [{coordinates: parkCoords}], center);

    // Tiered walk limits:
    //   Parking-side stop → CLOSE    (≤800m walk)
    //   Destination-side stop → VERY CLOSE (≤400m walk)
    //   Fall back to MAX_WALK_PER_SEGMENT if nothing found within the tighter limit.
    const PARK_WALK_MAX = 800;
    const DEST_WALK_TIGHT = 400;

    let [nearStop, nearDestStop] = await Promise.all([
        findNearestTransitStopByWalking(parkCoords, allStops, modeKeywords, PARK_WALK_MAX)
            .then(r => r ?? findNearestTransitStopByWalking(parkCoords, allStops, modeKeywords, MAX_WALK_PER_SEGMENT)),
        findNearestTransitStopByWalking(destCoords, allStops, modeKeywords, DEST_WALK_TIGHT)
            .then(r => r ?? findNearestTransitStopByWalking(destCoords, allStops, modeKeywords, PARK_WALK_MAX))
            .then(r => r ?? findNearestTransitStopByWalking(destCoords, allStops, modeKeywords, MAX_WALK_PER_SEGMENT))
    ]);

    // Ensure the transit stop near parking is in the direction of the destination.
    // If the nearest stop is farther from the destination than the parking itself,
    // it lies behind the parking — that would force a backward walk, then transit
    // forward again. Find a better stop that makes progress toward the destination.
    if (nearStop) {
        const parkToDestDist = distanceMeters(parkCoords, destCoords);
        const stopToDestDist = distanceMeters(nearStop.coordinates, destCoords);
        if (stopToDestDist >= parkToDestDist) {
            const stopsTowardDest = allStops
                .filter(s => modeKeywords.some(kw => (s.type || '').includes(kw)))
                .filter(s => distanceMeters(s.coordinates, destCoords) < parkToDestDist)
                .sort((a, b) => distanceMeters(a.coordinates, parkCoords) - distanceMeters(b.coordinates, parkCoords));
            if (stopsTowardDest.length > 0) {
                const osrmResults = await Promise.all(
                    stopsTowardDest.slice(0, 5).map(s => fetchOSRMRoute(parkCoords, s.coordinates, 'walking'))
                );
                let bestWalkDist = Infinity;
                for (let i = 0; i < Math.min(5, stopsTowardDest.length); i++) {
                    const walkDist = osrmResults[i]?.pathLength || distanceMeters(parkCoords, stopsTowardDest[i].coordinates);
                    if (walkDist < bestWalkDist && walkDist <= PARK_WALK_MAX) {
                        bestWalkDist = walkDist;
                        nearStop = {
                            name: stopsTowardDest[i].name,
                            coordinates: stopsTowardDest[i].coordinates,
                            distance: Math.round(walkDist)
                        };
                    }
                }
                // If no walkable stop toward destination, keep the original (will use fallback)
            }
        }
    }

    // If the nearest stop to parking is the same as the nearest stop to destination
    // (within 200m), the transit segment would be zero-length and invisible.
    // Try to find a different stop near the destination so the transit route is meaningful.
    if (nearStop && nearDestStop) {
        const stopDist = distanceMeters(nearStop.coordinates, nearDestStop.coordinates);
        if (stopDist < 200) {
            const otherDestStops = allStops
                .filter(s => modeKeywords.some(kw => (s.type || '').includes(kw)))
                .filter(s => distanceMeters(s.coordinates, nearStop.coordinates) >= 200)
                .sort((a, b) => distanceMeters(a.coordinates, destCoords) - distanceMeters(b.coordinates, destCoords));
            if (otherDestStops.length > 0) {
                const osrmResults = await Promise.all(
                    otherDestStops.slice(0, 3).map(s => fetchOSRMRoute(destCoords, s.coordinates, 'walking'))
                );
                let bestWalkDist = Infinity;
                for (let i = 0; i < Math.min(3, otherDestStops.length); i++) {
                    const walkDist = osrmResults[i]?.pathLength || distanceMeters(destCoords, otherDestStops[i].coordinates);
                    if (walkDist < bestWalkDist && walkDist <= DEST_WALK_TIGHT) {
                        bestWalkDist = walkDist;
                        nearDestStop = {
                            name: otherDestStops[i].name,
                            coordinates: otherDestStops[i].coordinates,
                            distance: Math.round(walkDist)
                        };
                    }
                }
            }
        }
    }

    const transitFrom = nearStop?.coordinates || parkCoords;
    const transitTo = nearDestStop?.coordinates || destCoords;
    const stopName = nearStop?.name || 'Transit stop';
    const destStopName = nearDestStop?.name || 'Destination stop';

    // Segments 2 and 4: walking
    const wResult = await fetchOSRMRoute(parkCoords, transitFrom, 'walking');
    const wdResult = await fetchOSRMRoute(transitTo, destCoords, 'walking');

    // Segment 2: Walk from parking to transit stop
    const walkPath = wResult?.path || interpolatePoints(parkCoords, transitFrom, 4);
    const walkDistMeters = wResult?.pathLength || pathLengthMeters(walkPath) || distanceMeters(parkCoords, transitFrom);
    const walkMinutes = wResult?.durationMin || Math.max(1, Math.round(walkDistMeters / 80));
    segments.push({
        mode: 'walking',
        path: walkPath,
        label: 'Walk',
        durationMin: walkMinutes,
        stopName,
        distanceMeters: Math.round(walkDistMeters)
    });

    // Segment 3: Transit/Cycle from stop to destination area
    if (modeLabel === 'cycling') {
        const cycleResult = await fetchOSRMRoute(transitFrom, transitTo, 'cycling');
        segments.push({
            mode: 'cycling',
            path: cycleResult?.path || interpolatePoints(transitFrom, transitTo, 8),
            label: 'Cycle',
            durationMin: cycleResult?.durationMin || Math.max(1, Math.round(distanceMeters(transitFrom, transitTo) / 80)),
            fromStop: stopName,
            toStop: destStopName
        });
    } else if (hafasClient && (modeLabel === 'train' || modeLabel === 'bus')) {
        // Try proper HAFAS station lookup by proximity first
        let fromHafas = await findNearestStationHafas(hafasClient, transitFrom);
        let toHafas = await findNearestStationHafas(hafasClient, transitTo);

        let hafasJourney = null;
        if (fromHafas?.stationId && toHafas?.stationId) {
            hafasJourney = await fetchHafasJourneyById(hafasClient, fromHafas.stationId, toHafas.stationId, modeLabel);
        }

        // Fallback to name-based HAFAS search
        if (!hafasJourney) {
            hafasJourney = await fetchHafasJourney(hafasClient, transitFrom, transitTo, stopName, destStopName, modeLabel);
        }

        if (hafasJourney && hafasJourney.path && hafasJourney.path.length > 1) {
            segments.push({
                mode: modeLabel === 'bus' ? 'bus' : 'train',
                path: hafasJourney.path,
                label: modeLabel === 'bus' ? 'Bus' : 'Train',
                durationMin: hafasJourney.durationMin,
                fromStop: stopName,
                toStop: destStopName,
                legs: hafasJourney.legs,
                departure: hafasJourney.departure,
                arrival: hafasJourney.arrival
            });
        } else {
            // Distance-based transit time estimate (not OSRM driving!)
            const transitDistKm = distanceMeters(transitFrom, transitTo) / 1000;
            const avgSpeedKmh = modeLabel === 'bus' ? 30 : 60;
            const estimatedMin = Math.max(3, Math.round(transitDistKm / avgSpeedKmh * 60));
            const cappedMin = Math.min(estimatedMin, 90);
            
            // Fallback to OSRM driving path to snap to roads instead of straight lines
            const fallbackRoute = await fetchOSRMRoute(transitFrom, transitTo, 'driving');
            const fallbackPath = fallbackRoute?.path || interpolatePoints(transitFrom, transitTo, 8);

            segments.push({
                mode: modeLabel === 'bus' ? 'bus' : 'train',
                path: fallbackPath,
                label: modeLabel === 'bus' ? 'Bus' : 'Train',
                durationMin: cappedMin,
                fromStop: stopName,
                toStop: destStopName
            });
        }
    } else {
        // No HAFAS available - use distance-based estimate for transit
        const transitDistKm = distanceMeters(transitFrom, transitTo) / 1000;
        const avgSpeedKmh = modeLabel === 'bus' ? 30 : 60;
        const estimatedMin = Math.max(3, Math.round(transitDistKm / avgSpeedKmh * 60));
        const cappedMin = Math.min(estimatedMin, 90);
        
        // Fallback to OSRM driving path to snap to roads instead of straight lines
        const fallbackRoute = await fetchOSRMRoute(transitFrom, transitTo, 'driving');
        const fallbackPath = fallbackRoute?.path || interpolatePoints(transitFrom, transitTo, 8);

        segments.push({
            mode: modeLabel === 'bus' ? 'bus' : 'train',
            path: fallbackPath,
            label: modeLabel === 'bus' ? 'Bus' : 'Train',
            durationMin: cappedMin,
            fromStop: stopName,
            toStop: destStopName
        });
    }

    // Segment 4: Walk from dest stop to final destination
    const walkDestPath = wdResult?.path || interpolatePoints(transitTo, destCoords, 4);
    const walkDestDistMeters = wdResult?.pathLength || pathLengthMeters(walkDestPath) || distanceMeters(transitTo, destCoords);
    const walkDestMinutes = wdResult?.durationMin || Math.max(1, Math.round(walkDestDistMeters / 80));
    segments.push({
        mode: 'walking',
        path: walkDestPath,
        label: 'Walk',
        durationMin: walkDestMinutes,
        stopName: destStopName,
        distanceMeters: Math.round(walkDestDistMeters)
    });

    return { segments, transitFrom, transitTo, stopName, destStopName, nearStop, nearDestStop };
}

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'ParkIQ Backend is running with Real-time capabilities' });
});

app.post('/api/routes', async (req, res) => {
    const ROUTE_TIMEOUT_MS = 60000;
    let timedOut = false;
    const routeTimer = setTimeout(() => {
        timedOut = true;
        if (!res.headersSent) {
            res.status(504).json({ success: false, message: 'Request timed out. Please try again.' });
        }
    }, ROUTE_TIMEOUT_MS);

    const clearRouteTimer = () => { if (!timedOut) clearTimeout(routeTimer); };

    try {
        const { destination, startCoords, arrivalTime, parkingId, transportMode, maxTimeMinutes = 120, destCoords: reqDestCoords } = req.body;

        // Try HAFAS (with timeout) but fall back to estimated data if unavailable
        let hafasAvailable = false;
        let client = null;
        try {
            client = await withTimeout(getClient(), 2000);
            hafasAvailable = true;
        } catch { hafasAvailable = false; }

        let destCoords = reqDestCoords || null;
        let destName = destination || 'Stuttgart Zentrum';

        if (!destCoords) {
            let destStation = null;
            if (hafasAvailable) {
                try {
                    const destLocs = await withTimeout(client.locations(destName, { results: 1 }), 2000);
                    if (destLocs && destLocs.length > 0) destStation = destLocs[0];
                } catch { }
            }
            destName = destStation?.name || destName;
            destCoords = destStation?.location?.latitude
                ? [+destStation.location.latitude.toFixed(6), +destStation.location.longitude.toFixed(6)]
                : estimateDestCoords(destName);
        }

        // Use the comprehensive Baden-Württemberg cache for destination-side parking,
        // and fetch live parking near the user's destination location.
        // skipNameResolve=true avoids the slow Nominatim rate-limited geocoding
        let [originParkings, destParkings] = await Promise.all([
            destCoords ? fetchParkingNear(destCoords[0], destCoords[1], 10000, { skipNameResolve: true }) : Promise.resolve([]),
            getParkingSites()
        ]);

        if (timedOut) { clearRouteTimer(); return; }

        // If live fetch returned empty and the API is down, use cache data
        if (!originParkings.length && destCoords) {
            originParkings = destParkings;
        }
        // Merge both sets, deduplicate by id
        const seenIds = new Set();
        let liveParkings = [];
        for (const p of [...originParkings, ...destParkings]) {
            if (!seenIds.has(p.id)) {
                seenIds.add(p.id);
                liveParkings.push(p);
            }
        }

        if (!liveParkings.length) {
            loadDiskCache();
            if (parkingCache.data?.length) {
                liveParkings = parkingCache.data;
            } else {
                clearRouteTimer(); 
                if (!res.headersSent) return res.status(503).json({ success: false, message: 'No live parking data available near destination' });
                return;
            }
        }

        if (parkingId) {
            liveParkings = liveParkings.filter(p => p.id === parkingId || p.id == parkingId);
            if (!liveParkings.length) {
                const cacheSites = await getParkingSites();
                const cachedPark = cacheSites.find(p => p.id === parkingId || p.id == parkingId);
                if (cachedPark) {
                    liveParkings = [cachedPark];
                } else {
                    clearRouteTimer(); 
                    if (!res.headersSent) return res.status(404).json({ success: false, message: 'Selected parking not found' });
                    return;
                }
            }
        } else {
            // Pre-filter to the 15 closest parking sites to the destination
            // This dramatically reduces processing time for the listing path
            liveParkings.sort((a, b) => distanceMeters(destCoords, a.coordinates) - distanceMeters(destCoords, b.coordinates));
            liveParkings = liveParkings.slice(0, 15);
        }

        if (timedOut) { clearRouteTimer(); return; }

        const now = new Date();
        const date = arrivalTime ? new Date(arrivalTime) : now;
        const timeFormatter = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

        // ===== Single parking + mode = full 4-segment route =====
        if (parkingId && transportMode && transportMode !== 'transit') {
            const park = liveParkings[0];
            const parkingPrice = estimateParkingPrice(park.name);
            const parkingPriceNum = parseFloat(parkingPrice.toFixed(2));

            const routeData = await generateRouteWithMode(park.coordinates, startCoords, destCoords, destName, transportMode, client);
            const { segments, stopName, destStopName } = routeData;

            const driveMinutes = segments[0]?.durationMin || 15;
            const walkMin1 = segments[1]?.durationMin || 3;
            const transitMin = segments[2]?.durationMin || 20;
            const walkMin2 = segments[3]?.durationMin || 3;
            const totalTimeMinutes = Math.min(480, driveMinutes + walkMin1 + transitMin + walkMin2);

            let lineName = 'S-Bahn';
            let modeLabel = 'transit';
            if (transportMode === 'bus') { lineName = 'Bus'; modeLabel = 'bus'; }
            else if (transportMode === 'cycling' || transportMode === 'bicycle') { lineName = 'Bicycle'; modeLabel = 'cycling'; }

            const totalCost = parkingPriceNum;
            const savings = Math.max(0, DIRECT_CITY_PARKING_COST - totalCost);

            const depTime = new Date(date);
            depTime.setMinutes(depTime.getMinutes() - totalTimeMinutes);
            const parkArrive = new Date(depTime);
            parkArrive.setMinutes(parkArrive.getMinutes() + driveMinutes);
            const transitDep = new Date(parkArrive);
            transitDep.setMinutes(transitDep.getMinutes() + walkMin1);
            const transitArr = new Date(transitDep);
            transitArr.setMinutes(transitArr.getMinutes() + transitMin);
            const destArrive = new Date(transitArr);
            destArrive.setMinutes(destArrive.getMinutes() + walkMin2);

            const timeline = [
                { time: timeFormatter.format(depTime), mode: 'driving', name: 'Current Location', details: 'Drive to parking', durationMin: driveMinutes },
                { time: timeFormatter.format(parkArrive), mode: 'parking', name: park.name, details: 'Park car', durationMin: 0 },
                { time: timeFormatter.format(transitDep), mode: 'walking', name: stopName, details: `Walk ${walkMin1} min to ${stopName}`, durationMin: walkMin1 },
                { time: timeFormatter.format(transitArr), mode: modeLabel, name: stopName, details: `Board ${lineName} → ${destStopName} (${transitMin} min)`, durationMin: transitMin },
                { time: timeFormatter.format(destArrive), mode: 'walking', name: destName, details: `Walk to destination (${walkMin2} min)`, durationMin: walkMin2 },
                { time: timeFormatter.format(destArrive), mode: 'destination', name: destName, details: 'Arrive at destination', durationMin: 0 },
            ];

            const pricing = getParkingPricing(park);

            clearRouteTimer(); 
            if (!res.headersSent) {
                return res.json({
                    success: true,
                    data: [{
                        id: park.id, parkingName: park.name,
                        parkingPrice: parkingPriceNum.toFixed(2),
                        ticketPrice: '0.00',
                        totalCost: totalCost.toFixed(2),
                        savings: savings.toFixed(2),
                        totalTime: `${totalTimeMinutes} min`,
                        travelDuration: `${transitMin} min`,
                        walkTime: walkMin1 + walkMin2,
                        walkDistance: `${walkMin1 + walkMin2} min`,
                        transitRoute: lineName,
                        segments,
                        timeline,
                        transitType: modeLabel,
                        lat: park.coordinates[0],
                        lng: park.coordinates[1],
                        totalCapacity: park.totalCapacity,
                        amenities: park.amenities,
                        hasFee: park.hasFee,
                        feeDescription: park.feeDescription,
                        description: park.description,
                        isFree: pricing.isFree,
                        displayPrice: pricing.displayPrice,
                        hourlyRate: pricing.isFree ? 'Free' : pricing.displayPrice
                    }]
                });
            } else {
                return;
            }
        }

        // ===== Default: list parking options with basic info =====
        if (timedOut) { clearRouteTimer(); return; }

        const allOptions = [];
        // Only pass destination-area parkings (no startCoords) to keep Overpass bbox small
        const allStops = await fetchTransitStopsBBox(destCoords, liveParkings);

        if (timedOut) { clearRouteTimer(); return; }

        // Find top destination-area stops per mode
        const destTopTrain = findTopTransitStops(destCoords, allStops, ['station', 'halt', 'train', 'rail', 'metro', 'bahn', 's-bahn', 'u-bahn'], 3);
        const destTopBus = findTopTransitStops(destCoords, allStops, ['bus'], 3);
        const destTopBike = findTopTransitStops(destCoords, allStops, ['bike', 'bicycle', 'cycling'], 3);

        // Best pairing: find (parkStop, destStop) that minimises total walking
        function bestPairWalk(parkStops, destStops) {
            if (parkStops.length === 0 || destStops.length === 0) return 9999;
            let best = Infinity;
            for (const ps of parkStops) {
                for (const ds of destStops) {
                    const total = ps.distance + ds.distance;
                    if (total < best) best = total;
                }
            }
            // If the best walk is unreasonably far, treat as unavailable
            if (best > MAX_WALK_PER_SEGMENT * 3) return 9999;
            return best;
        }

        for (const park of liveParkings) {
            const parkingPrice = estimateParkingPrice(park.name);
            const totalCost = parseFloat(parkingPrice.toFixed(2));
            const savings = Math.max(0, DIRECT_CITY_PARKING_COST - totalCost);
            const pricing = getParkingPricing(park);
            const driveMinutes = Math.min(240, Math.max(1, Math.round(distanceMeters(startCoords || [48.7758, 9.1829], park.coordinates) / 1000)));

            // Find top N stops of each type near the parking
            const nearTrain = findTopTransitStops(park.coordinates, allStops, ['station', 'halt', 'train', 'rail', 'metro', 'bahn', 's-bahn', 'u-bahn'], 3);
            const nearBus = findTopTransitStops(park.coordinates, allStops, ['bus'], 3);
            const nearBike = findTopTransitStops(park.coordinates, allStops, ['bike', 'bicycle', 'cycling'], 3);

            const allNearby = [...nearTrain, ...nearBus, ...nearBike];
            const minWalkToTransit = allNearby.length > 0 ? Math.min(...allNearby.map(s => s.distance)) : Infinity;

            const trainTotalWalk = bestPairWalk(nearTrain, destTopTrain);
            const busTotalWalk = bestPairWalk(nearBus, destTopBus);
            const bikeTotalWalk = bestPairWalk(nearBike, destTopBike);
            const bestTotalWalk = Math.min(trainTotalWalk, busTotalWalk, bikeTotalWalk);

            // Determine which mode gives the shortest walk
            let bestMode = 'train';
            if (busTotalWalk <= trainTotalWalk && busTotalWalk <= bikeTotalWalk) bestMode = 'bus';
            if (bikeTotalWalk <= trainTotalWalk && bikeTotalWalk <= busTotalWalk) bestMode = 'bicycle';

            const hasTrain = nearTrain.length > 0 && nearTrain[0].distance < MAX_WALK_PER_SEGMENT;
            const hasBus = nearBus.length > 0 && nearBus[0].distance < MAX_WALK_PER_SEGMENT;
            const hasBike = nearBike.length > 0 && nearBike[0].distance < MAX_WALK_PER_SEGMENT;

            // Accurate walking time estimates
            const oneWayWalkMeters = Math.round(minWalkToTransit === Infinity ? 200 : minWalkToTransit);
            const totalWalkMeters = Math.round(bestTotalWalk === 9999 ? 500 : bestTotalWalk);
            const walkTimeMin = Math.max(1, Math.round(oneWayWalkMeters / 80));
            const totalWalkTimeMin = Math.min(30, Math.max(1, Math.round(totalWalkMeters / 80)));

            // Calculate actual transit time based on best mode's stop-to-stop distance
            let transitTimeEst = 20;
            if (bestMode === 'bus' && nearBus.length > 0 && destTopBus.length > 0) {
                const distKm = distanceMeters(nearBus[0].coordinates, destTopBus[0].coordinates) / 1000;
                transitTimeEst = Math.max(2, Math.round(distKm / 30 * 60));
            } else if (bestMode === 'train' && nearTrain.length > 0 && destTopTrain.length > 0) {
                const distKm = distanceMeters(nearTrain[0].coordinates, destTopTrain[0].coordinates) / 1000;
                transitTimeEst = Math.max(2, Math.round(distKm / 60 * 60));
            }

            const distToDest = distanceMeters(destCoords, park.coordinates);
            allOptions.push({
                distanceToDest: distToDest,
                id: park.id, parkingName: park.name,
                parkingPrice: parkingPrice.toFixed(2),
                totalCost: totalCost.toFixed(2),
                savings: savings.toFixed(2),
                totalTime: `${driveMinutes + totalWalkTimeMin + transitTimeEst} min`,
                travelDuration: `${transitTimeEst} min`,
                walkTime: totalWalkTimeMin,
                walkDistance: `${oneWayWalkMeters}m`,
                totalWalkEstimate: totalWalkMeters,
                bestTransitMode: bestMode,
                lat: park.coordinates[0],
                lng: park.coordinates[1],
                totalCapacity: park.totalCapacity,
                amenities: park.amenities,
                hasTrainStop: hasTrain,
                hasBusStop: hasBus,
                hasBikeStop: hasBike,
                nearTrain: nearTrain.length > 0 ? nearTrain[0] : null,
                nearBus: nearBus.length > 0 ? nearBus[0] : null,
                nearBike: nearBike.length > 0 ? nearBike[0] : null,
                destStop: destTopTrain.length > 0 ? destTopTrain[0] : null,
                hasFee: park.hasFee,
                feeDescription: park.feeDescription,
                description: park.description,
                isFree: pricing.isFree,
                displayPrice: pricing.displayPrice,
                hourlyRate: pricing.isFree ? 'Free' : pricing.displayPrice
            });
        }

        // Sort by distance to destination (primary), then cost (secondary)
        allOptions.sort((a, b) => a.distanceToDest - b.distanceToDest || parseFloat(a.totalCost) - parseFloat(b.totalCost));
        if (!res.headersSent) {
            res.json({ success: true, data: allOptions });
        }

    } catch (error) {
        clearRouteTimer();
        console.error("Error fetching route:", error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Failed to calculate route' });
        }
    } finally {
        clearRouteTimer();
    }
});

app.get('/api/radar', async (req, res) => {
    try {
        const client = await getClient();
        const radar = await client.radar({ north: 48.8, south: 48.7, east: 9.25, west: 9.1 }, { results: 50 });
        res.json({ success: true, vehicles: radar.movements });
    } catch (error) {
        console.error("Radar error:", error);
        res.status(500).json({ success: false });
    }
});

// CKAN API Base URL
const MOBIDATA_BASE_URL = 'https://mobidata-bw.de/api/3/action';

app.get('/api/parkbauten', async (req, res) => {
    try {
        const searchResponse = await axios.get(`${MOBIDATA_BASE_URL}/package_search?q=Parkbauten`, { timeout: 8000 });
        const dataset = searchResponse.data.result.results[0];
        if (!dataset) return res.json({ type: "FeatureCollection", features: [] });

        const geoJsonResource = dataset.resources.find(r => r.format.toLowerCase() === 'geojson' || r.format.toLowerCase() === 'json');
        if (!geoJsonResource) return res.json({ type: "FeatureCollection", features: [] });

        const actualData = await axios.get(geoJsonResource.url, { timeout: 10000 });
        res.json(actualData.data);
    } catch (error) {
        console.error('Error fetching parking data:', error.message);
        res.json({ type: "FeatureCollection", features: [] });
    }
});

app.get('/api/transit-stops', async (req, res) => {
    try {
        // Try to fetch fresh data in the background
        // Transit stops are now fetched dynamically via Overpass on demand
        const stops = FALLBACK_STOPS;
        const features = stops.map(s => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [s.coordinates[1], s.coordinates[0]] },
            properties: { name: s.name, type: s.type }
        }));
        res.json({ type: "FeatureCollection", features });
    } catch (error) {
        console.error('Error serving transit data:', error.message);
        const stops = FALLBACK_STOPS;
        const features = stops.map(s => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [s.coordinates[1], s.coordinates[0]] },
            properties: { name: s.name, type: s.type }
        }));
        res.json({ type: "FeatureCollection", features });
    }
});

// ====== Geocoding Proxy (Nominatim) ======

app.get('/api/geocode/search', async (req, res) => {
    try {
        const { q, limit, countrycodes, addressdetails } = req.query;
        if (!q) return res.status(400).json({ error: 'Missing query parameter q' });
        const cacheKey = `${q.trim().toLowerCase()}|${limit || 5}|${countrycodes || ''}`;
        if (searchCache.has(cacheKey)) {
            return res.json(searchCache.get(cacheKey));
        }
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=${limit || 5}&addressdetails=${addressdetails || 1}${countrycodes ? `&countrycodes=${countrycodes}` : ''}`;
        const response = await rateLimitedNominatim(url);
        if (searchCache.size < SEARCH_CACHE_MAX) searchCache.set(cacheKey, response.data);
        res.json(response.data);
    } catch (err) {
        console.error('Geocode search error:', err.message);
        res.status(502).json({ error: 'Geocoding service unavailable' });
    }
});

app.get('/api/geocode/reverse', async (req, res) => {
    try {
        const { lat, lon, format, addressdetails, zoom } = req.query;
        if (!lat || !lon) return res.status(400).json({ error: 'Missing lat/lon parameters' });
        const cacheKey = `${parseFloat(lat).toFixed(4)},${parseFloat(lon).toFixed(4)}`;
        if (geocodeCache.has(cacheKey)) {
            return res.json(geocodeCache.get(cacheKey));
        }
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=${format || 'json'}&addressdetails=${addressdetails || 1}&zoom=${zoom || 18}`;
        const response = await rateLimitedNominatim(url);
        if (geocodeCache.size < GEOCODE_CACHE_MAX) geocodeCache.set(cacheKey, response.data);
        res.json(response.data);
    } catch (err) {
        console.error('Geocode reverse error:', err.message);
        res.status(502).json({ error: 'Reverse geocoding service unavailable' });
    }
});

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
