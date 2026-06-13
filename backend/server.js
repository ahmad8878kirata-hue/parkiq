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

// Stuttgart bounding box filter
const STUTTGART_BBOX = { minLat: 48.7, maxLat: 48.85, minLon: 9.05, maxLon: 9.3 };

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

async function fetchAndCacheParking() {
  const response = await axios.get(MOBIDATA_PARK_API, {
    params: { source_uid: 'pbw' },
    headers: { 'Accept': 'application/json' }
  });
  const items = response.data?.items || [];
  const processed = items
    .filter(s => s.purpose === 'CAR')
    .map(transformSite)
    .filter(s => {
      const [lat, lon] = s.coordinates;
      return lat >= STUTTGART_BBOX.minLat && lat <= STUTTGART_BBOX.maxLat &&
             lon >= STUTTGART_BBOX.minLon && lon <= STUTTGART_BBOX.maxLon;
    });
  parkingCache.data = processed;
  parkingCache.lastUpdated = Date.now();
  return processed;
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

    const profileMap = { driving: 'driving', walking: 'foot' };
    const url = `https://router.project-osrm.org/route/v1/${profileMap[profile] || 'driving'}/${from[1]},${from[0]};${to[1]},${to[0]}?geometries=geojson&overview=full&steps=false`;

    try {
        const res = await axios.get(url, { timeout: 8000 });
        if (res.data?.code === 'Ok' && res.data?.routes?.length > 0) {
            const route = res.data.routes[0];
            const coords = route.geometry.coordinates;
            if (coords.length < 3) { osrmCache.set(key, null); return null; }
            const rawPath = coords.map(c => [+c[1].toFixed(6), +c[0].toFixed(6)]);
            const path = simplifyPath(rawPath);
            const durationMin = Math.max(1, Math.round(route.duration / 60));
            const result = { path, durationMin };
            osrmCache.set(key, result);
            return result;
        }
    } catch {}
    osrmCache.set(key, null);
    return null;
}

// Build route segments for map display using OSRM real roads
async function generateRealSegments(parkCoords, stationCoords, destCoords, startCoords) {
    const center = startCoords || [48.7758, 9.1829];

    const [drivingResult, walkResult] = await Promise.all([
        fetchOSRMRoute(center, parkCoords, 'driving'),
        fetchOSRMRoute(parkCoords, stationCoords, 'walking')
    ]);

    const drivingPath = drivingResult?.path || interpolatePoints(center, parkCoords);
    const driveMinutes = drivingResult?.durationMin || Math.max(1, Math.round(distanceMeters(center, parkCoords) / 200));

    return [
        { mode: 'driving', path: drivingPath, label: 'Drive', driveMinutes },
        { mode: 'walking', path: walkResult?.path || interpolatePoints(parkCoords, stationCoords, 4), label: 'Walk to station' },
        { mode: 'transit', path: [stationCoords, destCoords], label: 'Transit' }
    ];
}

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'ParkIQ Backend is running with Real-time capabilities' });
});

app.post('/api/routes', async (req, res) => {
    try {
        const { destination, startCoords, arrivalTime, parkingId } = req.body;

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

        let destStation = null;
        if (hafasAvailable) {
            try {
                const destLocs = await withTimeout(client.locations(destination || 'Stuttgart Zentrum', { results: 1 }), 4000);
                if (destLocs && destLocs.length > 0) destStation = destLocs[0];
            } catch {}
        }

        const destName = destStation?.name || destination || 'Stuttgart Zentrum';
        const now = new Date();
        const date = arrivalTime ? new Date(arrivalTime) : now;
        const timeFormatter = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

        const allOptions = [];

        for (const park of liveParkings) {
            // Find nearest station via HAFAS or estimate
            let walkDistance = 200;
            let walkTimeMin = 3;
            let nearbyStation = null;

            if (hafasAvailable) {
                try {
                    const stationQuery = park.name
                        .replace(/P(\+R)?\s*/i, '').replace(/Parkplatz\s*/i, '')
                        .replace(/Parkhaus\s*/i, '').replace(/Tiefgarage\s*/i, '')
                        .replace(/Parkgarage\s*/i, '').replace(/Parkbereich\s*/i, '')
                        .replace(/Garbe\s*/i, '').trim() || 'Stuttgart';

                    const locs = await withTimeout(client.locations(stationQuery, { results: 3 }), 4000);
                    if (locs && locs.length > 0) {
                        let minD = Infinity;
                        for (const loc of locs) {
                            if (loc.location?.latitude && loc.location?.longitude) {
                                const d = distanceMeters(park.coordinates, [loc.location.latitude, loc.location.longitude]);
                                if (d < minD) { minD = d; nearbyStation = loc; }
                            }
                        }
                        if (nearbyStation) {
                            walkDistance = Math.round(minD);
                            walkTimeMin = Math.max(1, Math.round(walkDistance / 80));
                        }
                    }
                } catch {}
            }

            // Try HAFAS journey (with timeout), or build estimated timeline
            let journey = null;
            if (hafasAvailable && nearbyStation && destStation) {
                try {
                    const journeyOpts = { results: 1 };
                    if (arrivalTime) {
                        journeyOpts.arrival = date;
                    } else {
                        journeyOpts.departure = date;
                    }
                    const jRes = await withTimeout(client.journeys(nearbyStation, destStation, journeyOpts), 5000);
                    if (jRes && jRes.journeys && jRes.journeys.length > 0) journey = jRes.journeys[0];
                } catch {}
            }

            const parkingPrice = estimateParkingPrice(park.name);
            const stationCoords = nearbyStation?.location?.latitude
                ? [+nearbyStation.location.latitude.toFixed(6), +nearbyStation.location.longitude.toFixed(6)]
                : estimateStationCoords(park.coordinates, walkDistance);
            const destCoords = destStation?.location?.latitude
                ? [+destStation.location.latitude.toFixed(6), +destStation.location.longitude.toFixed(6)]
                : estimateDestCoords(destName);

            const baseVariations = [
                { ticketPrice: 3.00, lineName: 'S-Bahn', travelMinutes: 25, timeOffset: 0, variantLabel: 'Standard' },
                { ticketPrice: 4.50, lineName: 'ICE', travelMinutes: 15, timeOffset: -5, variantLabel: 'Express' },
                { ticketPrice: 2.50, lineName: 'Bus 42', travelMinutes: 35, timeOffset: 10, variantLabel: 'Economy' },
            ];
            const variations = (parkingId && liveParkings.length === 1) ? baseVariations : [baseVariations[0]];

            // Compute real route segments once (shared across all variations)
            const segments = await generateRealSegments(park.coordinates, stationCoords, destCoords, startCoords);
            const driveMinutes = segments[0]?.driveMinutes || 15;

            for (const v of variations) {
                const totalCost = parseFloat(parkingPrice) + v.ticketPrice;
                const savings = Math.max(0, DIRECT_CITY_PARKING_COST - totalCost);

                let travelMinutes = v.travelMinutes;
                let lineName = v.lineName;
                const timeline = [];

                if (journey && journey.legs && journey.legs.length > 0) {
                    const dep = new Date(journey.legs[0].departure);
                    const arr = new Date(journey.legs[journey.legs.length - 1].arrival);
                    travelMinutes = Math.round((arr - dep) / 60000);
                    const totalTimeMinutes = travelMinutes + walkTimeMin + driveMinutes;
                    const drivingStart = new Date(dep.getTime() - ((walkTimeMin + driveMinutes) * 60000));

                    timeline.push({ time: timeFormatter.format(drivingStart), mode: 'driving', name: 'Current Location', details: 'Drive to parking' });
                    timeline.push({ time: timeFormatter.format(new Date(dep.getTime() - (walkTimeMin * 60000))), mode: 'parking', name: park.name, details: `${walkDistance}m to station` });

                    for (const leg of journey.legs) {
                        if (leg.line) {
                            lineName = leg.line.name;
                            timeline.push({
                                time: timeFormatter.format(leg.departureDelay
                                    ? new Date(new Date(leg.departure).getTime() + leg.departureDelay * 1000)
                                    : new Date(leg.departure)),
                                mode: 'transit',
                                name: leg.origin?.name || leg.origin,
                                details: `${leg.line.name} → ${leg.direction || 'Destination'}`
                            });
                        } else if (leg.walking) {
                            const wm = Math.round((new Date(leg.arrival) - new Date(leg.departure)) / 60000);
                            if (wm > 0) {
                                timeline.push({
                                    time: timeFormatter.format(new Date(leg.departure)),
                                    mode: 'walking', name: leg.origin?.name || 'Walk', details: `${wm} min walk`
                                });
                            }
                        }
                    }
                    timeline.push({ time: timeFormatter.format(arr), mode: 'destination', name: destStation?.name || destName, details: 'Arrive at destination' });
                } else {
                    const totalTimeMinutes = travelMinutes + walkTimeMin + driveMinutes;
                    const depTime = new Date(date);
                    depTime.setMinutes(depTime.getMinutes() - totalTimeMinutes + v.timeOffset);
                    const parkArrive = new Date(depTime);
                    parkArrive.setMinutes(parkArrive.getMinutes() + driveMinutes + walkTimeMin);
                    const transitDep = new Date(parkArrive);
                    transitDep.setMinutes(transitDep.getMinutes() + 2);
                    const transitArr = new Date(transitDep);
                    transitArr.setMinutes(transitArr.getMinutes() + travelMinutes);

                    timeline.push({ time: timeFormatter.format(depTime), mode: 'driving', name: 'Current Location', details: 'Drive to parking' });
                    timeline.push({ time: timeFormatter.format(parkArrive), mode: 'parking', name: park.name, details: `${walkDistance}m to station` });
                    timeline.push({ time: timeFormatter.format(transitDep), mode: 'transit', name: nearbyStation?.name || 'Station', details: `${lineName} → ${destName}` });
                    timeline.push({ time: timeFormatter.format(transitArr), mode: 'destination', name: destName, details: 'Arrive at destination' });
                }

                const totalTimeMinutes = travelMinutes + walkTimeMin + driveMinutes;

                allOptions.push({
                    id: park.id, parkingName: park.name,
                    parkingPrice: parkingPrice.toFixed(2),
                    ticketPrice: v.ticketPrice.toFixed(2),
                    totalCost: totalCost.toFixed(2),
                    savings: savings.toFixed(2),
                    totalTime: `${totalTimeMinutes} min`,
                    travelDuration: `${travelMinutes} min`,
                    walkTime: walkTimeMin,
                    walkDistance: `${walkDistance}m`,
                    transitRoute: lineName,
                    variantLabel: v.variantLabel,
                    timeline,
                    segments,
                    lat: park.coordinates[0],
                    lng: park.coordinates[1],
                    distanceToStation: `${walkDistance}m`,
                    walkTimeToStation: walkTimeMin,
                    totalCapacity: park.totalCapacity,
                    amenities: park.amenities
                });
            }
        }

        allOptions.sort((a, b) => parseFloat(a.totalCost) - parseFloat(b.totalCost));
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

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
