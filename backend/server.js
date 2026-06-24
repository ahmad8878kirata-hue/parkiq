const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ====== MobiData BW Live Parking Cache ======
let parkingCache = { data: null, lastUpdated: null };
const MOBIDATA_PARK_API = 'https://api.mobidata-bw.de/park-api/api/public/v3/parking-sites';
const CACHE_DURATION = 5 * 60 * 1000; // 5 Minuten

// Smaller Stuttgart Zentrum bounding box filter
const STUTTGART_BBOX = { minLat: 48.76, maxLat: 48.79, minLon: 9.16, maxLon: 9.20 };

function transformSite(site) {
  const capacity = site.capacity || 0;
  const lat = parseFloat(site.lat);
  const lon = parseFloat(site.lon);
  return {
    id: site.id,
    name: site.name,
    coordinates: [lat, lon],
    address: site.address || '',
    totalCapacity: capacity,
    freeSpaces: capacity,
    occupancyRate: 0,
    hasRealtime: !!site.has_realtime_data,
    amenities: {
      evCharging: (site.capacity_charging || 0) > 0,
      maxHeight: site.max_height || null
    },
    status: 'available'
  };
}

const FALLBACK_PARKING = [
  { id: 1, name: 'Parkhaus Rathausgarage', coordinates: [48.7741, 9.17787], address: 'Nadlerstraße 19, 70173 Stuttgart', totalCapacity: 133, freeSpaces: 133, occupancyRate: 0, hasRealtime: false, amenities: { evCharging: true, maxHeight: 200 }, status: 'available' },
  { id: 2, name: 'Tiefgarage Gerber Viertel', coordinates: [48.7723, 9.17245], address: 'Sophienstraße 21, 70178 Stuttgart', totalCapacity: 560, freeSpaces: 560, occupancyRate: 0, hasRealtime: false, amenities: { evCharging: true, maxHeight: null }, status: 'available' },
  { id: 3, name: 'Parkhaus Hauptbahnhof', coordinates: [48.78535, 9.17748], address: 'Jägerstraße 19, 70174 Stuttgart', totalCapacity: 147, freeSpaces: 147, occupancyRate: 0, hasRealtime: false, amenities: { evCharging: false, maxHeight: null }, status: 'available' },
  { id: 4, name: 'Parkhaus Stadtmitte', coordinates: [48.7783, 9.17591], address: 'Kronprinzstraße 6, 70173 Stuttgart', totalCapacity: 266, freeSpaces: 266, occupancyRate: 0, hasRealtime: false, amenities: { evCharging: true, maxHeight: 200 }, status: 'available' },
  { id: 5, name: 'Parkhaus Bohnenviertel', coordinates: [48.77464, 9.18314], address: 'Rosenstraße, 70173 Stuttgart', totalCapacity: 331, freeSpaces: 331, occupancyRate: 0, hasRealtime: true, amenities: { evCharging: false, maxHeight: null }, status: 'available' },
  { id: 6, name: 'Parkhaus Dorotheen-Quartier', coordinates: [48.77526, 9.18166], address: 'Holzstraße 21, 70173 Stuttgart', totalCapacity: 250, freeSpaces: 250, occupancyRate: 0, hasRealtime: true, amenities: { evCharging: true, maxHeight: 200 }, status: 'available' },
  { id: 7, name: 'Parkhaus Schloßplatz', coordinates: [48.77994, 9.18095], address: 'Stauffenbergstrasse 5-1, 70173 Stuttgart', totalCapacity: 90, freeSpaces: 90, occupancyRate: 0, hasRealtime: false, amenities: { evCharging: false, maxHeight: 210 }, status: 'available' },
  { id: 8, name: 'Parkhaus Stephangarage', coordinates: [48.78199, 9.17985], address: 'Kronenstraße 7, 70173 Stuttgart', totalCapacity: 265, freeSpaces: 265, occupancyRate: 0, hasRealtime: false, amenities: { evCharging: false, maxHeight: 200 }, status: 'available' },
  { id: 9, name: 'Parkhaus Börsenplatz', coordinates: [48.7801, 9.17567], address: 'Huberstraße 2, 70173 Stuttgart', totalCapacity: 176, freeSpaces: 176, occupancyRate: 0, hasRealtime: true, amenities: { evCharging: false, maxHeight: 210 }, status: 'available' },
  { id: 10, name: 'Parkhaus Kriegsberg', coordinates: [48.78448, 9.17651], address: 'Kriegsbergstr. 32, 70174 Stuttgart', totalCapacity: 255, freeSpaces: 255, occupancyRate: 0, hasRealtime: true, amenities: { evCharging: false, maxHeight: 204 }, status: 'available' },
  { id: 11, name: 'Parkgalerie Kernerplatz', coordinates: [48.78465, 9.18927], address: 'Kernerplatz 9+10, 70182 Stuttgart', totalCapacity: 141, freeSpaces: 141, occupancyRate: 0, hasRealtime: false, amenities: { evCharging: false, maxHeight: 200 }, status: 'available' },
  { id: 12, name: 'Parkhaus Königbau Passagen', coordinates: [48.77972, 9.17811], address: 'Bolzstraße 5, 70173 Stuttgart', totalCapacity: 412, freeSpaces: 412, occupancyRate: 0, hasRealtime: true, amenities: { evCharging: true, maxHeight: 200 }, status: 'available' },
];
parkingCache.data = FALLBACK_PARKING;
parkingCache.lastUpdated = Date.now();

async function fetchAndCacheParking() {
  try {
    const response = await axios.get(MOBIDATA_PARK_API, {
      headers: { 'Accept': 'application/json' },
      timeout: 10000
    });
    const items = response.data?.items || [];
    const processed = items
      .filter(s => s.purpose === 'CAR')
      .map(transformSite)
      .filter(s => 
        s.coordinates[0] >= STUTTGART_BBOX.minLat && 
        s.coordinates[0] <= STUTTGART_BBOX.maxLat && 
        s.coordinates[1] >= STUTTGART_BBOX.minLon && 
        s.coordinates[1] <= STUTTGART_BBOX.maxLon
      );
    if (processed.length > 0) {
      parkingCache.data = processed;
      parkingCache.lastUpdated = Date.now();
    }
    return parkingCache.data;
  } catch (err) {
    console.error('MobiData BW API Error:', err.message);
    return parkingCache.data || FALLBACK_PARKING;
  }
}

app.get('/api/parking/stuttgart', async (req, res) => {
  const now = Date.now();
  if (parkingCache.data && (now - parkingCache.lastUpdated < CACHE_DURATION)) {
    return res.json({ source: 'cache', sites: parkingCache.data });
  }
  try {
    const sites = await fetchAndCacheParking();
    res.json({ source: 'live', sites });
  } catch (error) {
    console.error('MobiData BW API Error:', error.message);
    if (parkingCache.data) {
      return res.json({ source: 'fallback_cache', sites: parkingCache.data, error: 'Live data unavailable' });
    }
    res.status(500).json({ error: 'Fehler beim Abruf der MobiData BW Schnittstelle.' });
  }
});
// ====== End MobiData BW ======

const DIRECT_CITY_PARKING_COST = 18.00;
const DEFAULT_PARKING_PRICE = 4.00;

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
    if (parkingCache.data && (now - parkingCache.lastUpdated < CACHE_DURATION)) {
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
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pathLengthMeters(path) {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distanceMeters(path[i - 1], path[i]);
  return total;
}

// Estimate parking price based on type hints in the name
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
    const dist = Math.sqrt(dx*dx + dy*dy) || 0.001;
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

async function fetchOSRMRoute(from, to, profile = 'driving') {
    const key = `${from[0].toFixed(5)},${from[1].toFixed(5)}-${to[0].toFixed(5)},${to[1].toFixed(5)}-${profile}`;
    if (osrmCache.has(key)) return osrmCache.get(key);

    const profileMap = { driving: 'driving', walking: 'foot', cycling: 'cycling' };
    const url = `https://router.project-osrm.org/route/v1/${profileMap[profile] || 'driving'}/${from[1]},${from[0]};${to[1]},${to[0]}?geometries=geojson&overview=full&steps=false`;

    try {
        const res = await axios.get(url, { timeout: 8000 });
        if (res.data?.code === 'Ok' && res.data?.routes?.length > 0) {
            const route = res.data.routes[0];
            const coords = route.geometry.coordinates;
            if (coords.length < 3) return null;
            const rawPath = coords.map(c => [+c[1].toFixed(6), +c[0].toFixed(6)]);
            const path = simplifyPath(rawPath);
            const durationMin = Math.max(1, Math.round(route.duration / 60));
            const result = { path, durationMin };
            osrmCache.set(key, result);
            return result;
        }
    } catch {}
    return null;
}

// ====== Transit Stops Cache ======
const FALLBACK_STOPS = require('./transit_stops_fallback');
let transitStopsCache = { data: [...FALLBACK_STOPS], lastUpdated: Date.now() };
const TRANSIT_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

async function fetchAndCacheTransitStops() {
    const now = Date.now();
    if (transitStopsCache.data && (now - transitStopsCache.lastUpdated) < TRANSIT_CACHE_DURATION) {
        return transitStopsCache.data;
    }
    try {
        const searchResponse = await axios.get(`${MOBIDATA_BASE_URL}/package_search?q=haltestellen-baden-wuerttemberg`, { timeout: 8000 });
        const dataset = searchResponse.data.result.results[0];
        if (!dataset) return transitStopsCache.data || FALLBACK_STOPS;
        const resource = dataset.resources.find(r => r.format.toLowerCase() === 'geojson' || r.format.toLowerCase() === 'json' || r.format.toLowerCase() === 'csv');
        if (!resource) return transitStopsCache.data || FALLBACK_STOPS;
        const actualData = await axios.get(resource.url, { timeout: 30000 });
        const features = actualData.data.features || actualData.data;
        const allStops = (features || []).map(f => ({
            name: f.properties?.name || f.properties?.title || 'Unknown',
            coordinates: [f.geometry.coordinates[1], f.geometry.coordinates[0]],
            type: (f.properties?.type || f.properties?.transport_mode || '').toLowerCase()
        }));
        transitStopsCache.data = allStops;
        transitStopsCache.lastUpdated = Date.now();
        return allStops;
    } catch {
        return transitStopsCache.data || FALLBACK_STOPS;
    }
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

// Build 4-segment route: drive → walk to stop → transit/cycle → walk to dest
async function generateRouteWithMode(parkCoords, startCoords, destCoords, destName, transportMode) {
    const center = startCoords || [48.7758, 9.1829];

    const drivingResult = await fetchOSRMRoute(center, parkCoords, 'driving');
    const drivingPath = drivingResult?.path || interpolatePoints(center, parkCoords);
    const driveMinutes = drivingResult?.durationMin || Math.max(1, Math.round(distanceMeters(center, parkCoords) / 200));

    const segments = [
        { mode: 'driving', path: drivingPath, label: 'Drive', durationMin: driveMinutes }
    ];

    // Find nearest transit stop of the chosen type
    const allStops = await fetchAndCacheTransitStops();
    let modeKeywords = ['train', 'rail', 'metro', 'bahn', 's-bahn', 'u-bahn'];
    let transitProfile = 'driving';
    let modeLabel = 'transit';

    if (transportMode === 'bus') {
        modeKeywords = ['bus'];
        transitProfile = 'driving';
        modeLabel = 'bus';
    } else if (transportMode === 'cycling' || transportMode === 'bicycle') {
        modeKeywords = ['bike', 'bicycle', 'cycling'];
        transitProfile = 'cycling';
        modeLabel = 'cycling';
    } else {
        // default train
        modeKeywords = ['train', 'rail', 'metro', 'bahn', 's-bahn', 'u-bahn'];
        transitProfile = 'driving';
        modeLabel = 'train';
    }

    const nearStop = findNearestTransitStop(parkCoords, allStops, modeKeywords);
    const nearDestStop = findNearestTransitStop(destCoords, allStops, modeKeywords);

    const transitFrom = nearStop?.coordinates || parkCoords;
    const transitTo = nearDestStop?.coordinates || destCoords;
    const stopName = nearStop?.name || 'Transit stop';
    const destStopName = nearDestStop?.name || 'Destination stop';

    // Segment 2: Walk from parking to transit stop (OSRM foot, fallback interpolation on failure)
    const walkDistMeters = distanceMeters(parkCoords, transitFrom);
    const wResult = await fetchOSRMRoute(parkCoords, transitFrom, 'walking');
    const walkPath = wResult?.path || interpolatePoints(parkCoords, transitFrom, 4);
    const walkMinutes = wResult?.durationMin || Math.max(1, Math.round(walkDistMeters / 80));
    segments.push({
        mode: 'walking',
        path: walkPath,
        label: 'Walk',
        durationMin: walkMinutes,
        stopName
    });

    // Segment 3: Transit/Cycle from stop to destination area
    if (modeLabel === 'cycling') {
        const bikeResult = await fetchOSRMRoute(transitFrom, transitTo, 'cycling');
        segments.push({
            mode: 'cycling',
            path: bikeResult?.path || interpolatePoints(transitFrom, transitTo, 8),
            label: 'Cycle',
            durationMin: bikeResult?.durationMin || Math.max(1, Math.round(distanceMeters(transitFrom, transitTo) / 80)),
            fromStop: stopName,
            toStop: destStopName
        });
    } else {
        const transitResult = await fetchOSRMRoute(transitFrom, transitTo, 'driving');
        segments.push({
            mode: modeLabel === 'bus' ? 'bus' : 'train',
            path: transitResult?.path || interpolatePoints(transitFrom, transitTo, 6),
            label: modeLabel === 'bus' ? 'Bus' : 'Train',
            durationMin: transitResult?.durationMin || Math.max(1, Math.round(distanceMeters(transitFrom, transitTo) / 80)),
            fromStop: stopName,
            toStop: destStopName
        });
    }

    // Segment 4: Walk from dest stop to final destination (OSRM foot, fallback interpolation on failure)
    const walkDestDist = distanceMeters(transitTo, destCoords);
    const wdResult = await fetchOSRMRoute(transitTo, destCoords, 'walking');
    const walkDestPath = wdResult?.path || interpolatePoints(transitTo, destCoords, 4);
    const walkDestMinutes = wdResult?.durationMin || Math.max(1, Math.round(walkDestDist / 80));
    segments.push({
        mode: 'walking',
        path: walkDestPath,
        label: 'Walk',
        durationMin: walkDestMinutes,
        stopName: destStopName
    });

    return { segments, transitFrom, transitTo, stopName, destStopName, nearStop, nearDestStop };
}

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'ParkIQ Backend is running with Real-time capabilities' });
});

app.post('/api/routes', async (req, res) => {
    try {
        const { destination, startCoords, arrivalTime, parkingId, transportMode, maxTimeMinutes = 120, destCoords: reqDestCoords } = req.body;

        let liveParkings = await getParkingSites();
        if (!liveParkings.length) {
            return res.status(503).json({ success: false, message: 'No live parking data available' });
        }

        if (parkingId) {
            liveParkings = liveParkings.filter(p => p.id === parkingId || p.id == parkingId);
            if (!liveParkings.length) {
                return res.status(404).json({ success: false, message: 'Selected parking not found' });
            }
        }

        // Try HAFAS (with timeout) but fall back to estimated data if unavailable
        let hafasAvailable = false;
        let client = null;
        try {
            client = await withTimeout(getClient(), 4000);
            hafasAvailable = true;
        } catch { hafasAvailable = false; }

        let destCoords = reqDestCoords || null;
        let destName = destination || 'Stuttgart Zentrum';

        if (!destCoords) {
            let destStation = null;
            if (hafasAvailable) {
                try {
                    const destLocs = await withTimeout(client.locations(destName, { results: 1 }), 4000);
                    if (destLocs && destLocs.length > 0) destStation = destLocs[0];
                } catch {}
            }
            destName = destStation?.name || destName;
            destCoords = destStation?.location?.latitude
                ? [+destStation.location.latitude.toFixed(6), +destStation.location.longitude.toFixed(6)]
                : estimateDestCoords(destName);
        }
        const now = new Date();
        const date = arrivalTime ? new Date(arrivalTime) : now;
        const timeFormatter = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

        // ===== Single parking + mode = full 4-segment route =====
        if (parkingId && transportMode && transportMode !== 'transit') {
            const park = liveParkings[0];
            const parkingPrice = estimateParkingPrice(park.name);
            const parkingPriceNum = parseFloat(parkingPrice.toFixed(2));

            const routeData = await generateRouteWithMode(park.coordinates, startCoords, destCoords, destName, transportMode);
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
                { time: timeFormatter.format(depTime), mode: 'driving', name: 'Current Location', details: 'Drive to parking' },
                { time: timeFormatter.format(parkArrive), mode: 'parking', name: park.name, details: 'Park car' },
                { time: timeFormatter.format(transitDep), mode: 'walking', name: stopName, details: `Walk to ${stopName} (${walkMin1} min)` },
                { time: timeFormatter.format(transitArr), mode: modeLabel, name: destStopName, details: `${lineName} → ${destName}` },
                { time: timeFormatter.format(destArrive), mode: 'walking', name: destName, details: `Walk to destination (${walkMin2} min)` },
                { time: timeFormatter.format(destArrive), mode: 'destination', name: destName, details: 'Arrive at destination' },
            ];

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
                    amenities: park.amenities
                }]
            });
        }

        // ===== Default: list parking options with basic info =====
        const allOptions = [];
        const allStops = await fetchAndCacheTransitStops();

        // Find nearest stops to destination for each transport mode
        const destNearTrain = findNearestTransitStop(destCoords, allStops, ['train', 'rail', 'metro', 'bahn', 's-bahn', 'u-bahn']);
        const destNearBus = findNearestTransitStop(destCoords, allStops, ['bus']);
        const destNearBike = findNearestTransitStop(destCoords, allStops, ['bike', 'bicycle', 'cycling']);

        for (const park of liveParkings) {
            const parkingPrice = estimateParkingPrice(park.name);
            const totalCost = parseFloat(parkingPrice.toFixed(2));
            const savings = Math.max(0, DIRECT_CITY_PARKING_COST - totalCost);
            const driveMinutes = Math.max(1, Math.round(distanceMeters(startCoords || [48.7758, 9.1829], park.coordinates) / 200));

            // Find nearest stops of each type to the parking
            const nearTrain = findNearestTransitStop(park.coordinates, allStops, ['train', 'rail', 'metro', 'bahn', 's-bahn', 'u-bahn']);
            const nearBus = findNearestTransitStop(park.coordinates, allStops, ['bus']);
            const nearBike = findNearestTransitStop(park.coordinates, allStops, ['bike', 'bicycle', 'cycling']);

            const minWalkToTransit = Math.min(
                nearTrain?.distance || Infinity,
                nearBus?.distance || Infinity,
                nearBike?.distance || Infinity
            );

            // Calculate total walking for each mode (park→stop + stop→dest)
            const trainTotalWalk = (nearTrain?.distance || 9999) + (destNearTrain?.distance || 9999);
            const busTotalWalk = (nearBus?.distance || 9999) + (destNearBus?.distance || 9999);
            const bikeTotalWalk = (nearBike?.distance || 9999) + (destNearBike?.distance || 9999);
            const bestTotalWalk = Math.min(trainTotalWalk, busTotalWalk, bikeTotalWalk);

            // Determine which mode gives the shortest walk
            let bestMode = 'train';
            if (bestTotalWalk === busTotalWalk) bestMode = 'bus';
            if (bestTotalWalk === bikeTotalWalk) bestMode = 'bicycle';

            const hasTrain = nearTrain && nearTrain.distance < 1000;
            const hasBus = nearBus && nearBus.distance < 1000;
            const hasBike = nearBike && nearBike.distance < 1000;

            allOptions.push({
                id: park.id, parkingName: park.name,
                parkingPrice: parkingPrice.toFixed(2),
                totalCost: totalCost.toFixed(2),
                savings: savings.toFixed(2),
                totalTime: `${driveMinutes + 30} min`,
                travelDuration: '30 min',
                walkTime: 5,
                walkDistance: `${Math.round(minWalkToTransit === Infinity ? 200 : minWalkToTransit)}m`,
                totalWalkEstimate: Math.round(bestTotalWalk === 9999 ? 500 : bestTotalWalk),
                bestTransitMode: bestMode,
                lat: park.coordinates[0],
                lng: park.coordinates[1],
                totalCapacity: park.totalCapacity,
                amenities: park.amenities,
                hasTrainStop: hasTrain,
                hasBusStop: hasBus,
                hasBikeStop: hasBike,
                nearTrain: nearTrain ? { name: nearTrain.name, distance: nearTrain.distance } : null,
                nearBus: nearBus ? { name: nearBus.name, distance: nearBus.distance } : null,
                nearBike: nearBike ? { name: nearBike.name, distance: nearBike.distance } : null,
                destStop: destNearTrain ? { name: destNearTrain.name, distance: destNearTrain.distance } : null
            });
        }

        // Sort by total walking estimate (primary), then cost (secondary)
        allOptions.sort((a, b) => a.totalWalkEstimate - b.totalWalkEstimate || parseFloat(a.totalCost) - parseFloat(b.totalCost));
        res.json({ success: true, data: allOptions });

    } catch (error) {
        console.error("Error fetching route:", error);
        res.status(500).json({ success: false, error: 'Failed to calculate route' });
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
        fetchAndCacheTransitStops().catch(() => {});
        const stops = transitStopsCache.data || FALLBACK_STOPS;
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
