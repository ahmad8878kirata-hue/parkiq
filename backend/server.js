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

// Reverse geocode coordinates to get street name for generic parking entries
async function resolveGenericParkingNames(parkings) {
    const needsResolve = parkings.filter(p => isGenericParkingName(p.rawName || p.name));
    if (needsResolve.length === 0) return;

    // Process in batches of 3 to respect Nominatim rate limits
    for (let i = 0; i < needsResolve.length; i += 3) {
        const batch = needsResolve.slice(i, i + 3);
        const promises = batch.map(async (parking) => {
            const [lat, lon] = parking.coordinates;
            const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
            if (geocodeCache.has(cacheKey)) {
                const cached = geocodeCache.get(cacheKey);
                applyResolvedName(parking, cached);
                return;
            }
            try {
                const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=18`;
                const res = await axios.get(url, {
                    headers: { 'User-Agent': 'ParkIQ/1.0 (contact@parkiq.example.com)' },
                    timeout: 3000
                });
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
        });
        await Promise.all(promises);
        if (i + 3 < needsResolve.length) await new Promise(r => setTimeout(r, 350));
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
// Attempt initial API fetch in background so cache is warm for first visitor
setTimeout(() => fetchAndCacheParking().catch(() => {}), 1000);

const STUTTGART_CENTER = { lat: 48.7758, lon: 9.1829 };
const RADIUS_METERS = 5000;
const PAGINATION_LIMIT = 100;

async function fetchAndCacheParking() {
    const allSites = [];
    let start = 0;
    let hasMore = true;

    try {
        while (hasMore) {
            const url = `${MOBIDATA_PARK_API}?lat=${STUTTGART_CENTER.lat}&lon=${STUTTGART_CENTER.lon}&radius=${RADIUS_METERS}&limit=${PAGINATION_LIMIT}&start=${start}`;
            const response = await axios.get(url, {
                headers: { 'Accept': 'application/json' },
                timeout: 15000
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
            console.log(`Fetched ${allSites.length} parking sites from API`);
        }
        return parkingCache.data;
    } catch (err) {
        console.error('MobiData BW API Error:', err.message);
        return parkingCache.data || [];
    }
}

async function fetchParkingNear(lat, lon, radius = 5000) {
    const allSites = [];
    let start = 0;
    let hasMore = true;

    try {
        while (hasMore) {
            const url = `${MOBIDATA_PARK_API}?lat=${lat}&lon=${lon}&radius=${radius}&limit=${PAGINATION_LIMIT}&start=${start}`;
            const response = await axios.get(url, {
                headers: { 'Accept': 'application/json' },
                timeout: 15000
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
        await resolveGenericParkingNames(allSites);
        return allSites;
    } catch (err) {
        console.error('MobiData BW API Error (fetchParkingNear):', err.message);
        return [];
    }
}

app.get('/api/parking/stuttgart', async (req, res) => {
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

async function fetchTransitStopsBBox(destCoords, parkings = [], startCoords = null) {
    // Compute a single combined bounding box that covers origin, destination, and parkings
    let minLat = destCoords[0], maxLat = destCoords[0];
    let minLon = destCoords[1], maxLon = destCoords[1];

    if (startCoords) {
        minLat = Math.min(minLat, startCoords[0]);
        maxLat = Math.max(maxLat, startCoords[0]);
        minLon = Math.min(minLon, startCoords[1]);
        maxLon = Math.max(maxLon, startCoords[1]);
    }

    for (const p of parkings) {
        minLat = Math.min(minLat, p.coordinates[0]);
        maxLat = Math.max(maxLat, p.coordinates[0]);
        minLon = Math.min(minLon, p.coordinates[1]);
        maxLon = Math.max(maxLon, p.coordinates[1]);
    }

    // Add padding (~4km)
    minLat -= 0.035; maxLat += 0.035;
    minLon -= 0.045; maxLon += 0.045;

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
                    // Use the raw tag value as type (e.g., 'station', 'halt', 'tram_stop', 'bus_stop')
                    const type = railway || highway || amenity || 'transit';
                    return {
                        name: e.tags?.name || 'Transit Stop',
                        coordinates: [e.lat, e.lon],
                        type: type.toLowerCase()
                    };
                });
                return [...stops, ...FALLBACK_STOPS];
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

// Find top N nearest transit stops by Haversine distance
function findTopTransitStops(coords, stops, modeKeywords, count = 3) {
    const scored = [];
    for (const stop of stops) {
        const t = stop.type || '';
        const matches = modeKeywords.some(kw => t.includes(kw));
        if (!matches) continue;
        scored.push({ stop, dist: distanceMeters(coords, stop.coordinates) });
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
// Returns null if no candidate is within maxWalkMeters.
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
    
    if (!best && topCandidates.length > 0) {
        // If nothing within limit, take the best we found regardless
        for (let i = 0; i < topCandidates.length; i++) {
            const walkDist = osrmResults[i]?.pathLength || topCandidates[i].d;
            if (walkDist < bestWalkDist) {
                bestWalkDist = walkDist;
                best = topCandidates[i].stop;
            }
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
    const path = fullPath.length > 1 ? simplifyPath(fullPath) : interpolatePoints([0,0], [0,0], 2);
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
    const driveMinutes = drivingResult?.durationMin || Math.max(1, Math.round(distanceMeters(center, parkCoords) / 200));

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
    let [nearStop, nearDestStop] = await Promise.all([
        findNearestTransitStopByWalking(parkCoords, allStops, modeKeywords),
        findNearestTransitStopByWalking(destCoords, allStops, modeKeywords)
    ]);

    const transitFrom = nearStop?.coordinates || parkCoords;
    const transitTo = nearDestStop?.coordinates || destCoords;
    const stopName = nearStop?.name || 'Transit stop';
    const destStopName = nearDestStop?.name || 'Destination stop';

    // Segments 2 and 4: walking
    const [wResult, wdResult] = await Promise.all([
        fetchOSRMRoute(parkCoords, transitFrom, 'walking'),
        fetchOSRMRoute(transitTo, destCoords, 'walking')
    ]);

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
            segments.push({
                mode: modeLabel === 'bus' ? 'bus' : 'train',
                path: interpolatePoints(transitFrom, transitTo, 8),
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
        segments.push({
            mode: modeLabel === 'bus' ? 'bus' : 'train',
            path: interpolatePoints(transitFrom, transitTo, 8),
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
    const ROUTE_TIMEOUT_MS = 25000;
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

        // Search for parking near both origin and destination (in parallel)
        const nearDest = distanceMeters(destCoords, [STUTTGART_CENTER.lat, STUTTGART_CENTER.lon]) < 10000;
        let [originParkings, destParkings] = await Promise.all([
            startCoords ? fetchParkingNear(startCoords[0], startCoords[1], 5000) : Promise.resolve([]),
            nearDest ? getParkingSites() : fetchParkingNear(destCoords[0], destCoords[1], 5000)
        ]);
        if (!originParkings.length && startCoords) {
            originParkings = await fetchParkingNear(startCoords[0], startCoords[1], 10000);
        }
        if (!destParkings.length) {
            if (!nearDest) {
                destParkings = await fetchParkingNear(destCoords[0], destCoords[1], 10000);
            } else {
                loadDiskCache();
                if (parkingCache.data?.length) {
                    destParkings = parkingCache.data;
                }
            }
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
                clearRouteTimer(); return res.status(503).json({ success: false, message: 'No live parking data available near destination' });
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
                    clearRouteTimer(); return res.status(404).json({ success: false, message: 'Selected parking not found' });
                }
            }
        }
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
            const totalTimeMinutes = driveMinutes + walkMin1 + transitMin + walkMin2;

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
                { time: timeFormatter.format(transitDep), mode: 'walking', name: stopName, details: `Walk to ${stopName} (${walkMin1} min)`, durationMin: walkMin1 },
                { time: timeFormatter.format(transitArr), mode: modeLabel, name: destStopName, details: `${lineName} → ${destName}`, durationMin: transitMin },
                { time: timeFormatter.format(destArrive), mode: 'walking', name: destName, details: `Walk to destination (${walkMin2} min)`, durationMin: walkMin2 },
                { time: timeFormatter.format(destArrive), mode: 'destination', name: destName, details: 'Arrive at destination', durationMin: 0 },
            ];

            const pricing = getParkingPricing(park);

            clearRouteTimer(); return res.json({
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
        }

        // ===== Default: list parking options with basic info =====
        const allOptions = [];
        const allStops = await fetchTransitStopsBBox(destCoords, liveParkings, startCoords);

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
            return best;
        }

        for (const park of liveParkings) {
            const parkingPrice = estimateParkingPrice(park.name);
            const totalCost = parseFloat(parkingPrice.toFixed(2));
            const savings = Math.max(0, DIRECT_CITY_PARKING_COST - totalCost);
            const pricing = getParkingPricing(park);
            const driveMinutes = Math.max(1, Math.round(distanceMeters(startCoords || [48.7758, 9.1829], park.coordinates) / 200));

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
            const totalWalkTimeMin = Math.max(1, Math.round(totalWalkMeters / 80));

            // Calculate actual transit time based on best mode's stop-to-stop distance
            let transitTimeEst = 20;
            if (bestMode === 'bus' && nearBus.length > 0 && destTopBus.length > 0) {
                const distKm = distanceMeters(nearBus[0].coordinates, destTopBus[0].coordinates) / 1000;
                transitTimeEst = Math.max(2, Math.round(distKm / 30 * 60));
            } else if (bestMode === 'train' && nearTrain.length > 0 && destTopTrain.length > 0) {
                const distKm = distanceMeters(nearTrain[0].coordinates, destTopTrain[0].coordinates) / 1000;
                transitTimeEst = Math.max(2, Math.round(distKm / 60 * 60));
            }

            allOptions.push({
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

        // Sort by total walking estimate (primary), then cost (secondary)
        allOptions.sort((a, b) => a.totalWalkEstimate - b.totalWalkEstimate || parseFloat(a.totalCost) - parseFloat(b.totalCost));
        res.json({ success: true, data: allOptions });

    } catch (error) {
        clearRouteTimer();
        console.error("Error fetching route:", error);
        res.status(500).json({ success: false, error: 'Failed to calculate route' });
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

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
