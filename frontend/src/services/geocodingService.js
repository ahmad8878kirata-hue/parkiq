const PHOTON_API = 'https://photon.komoot.io/api/';

export async function geocodePhoton(query) {
    const res = await fetch(`${PHOTON_API}?q=${encodeURIComponent(query)}&limit=1`);
    const data = await res.json();
    if (data.features && data.features.length > 0) {
        const f = data.features[0];
        return {
            name: f.properties.name || query,
            coordinates: [f.geometry.coordinates[1], f.geometry.coordinates[0]],
            road: f.properties.street || null,
        };
    }
    return null;
}

const CITY_KEYS = ['city', 'town', 'village', 'municipality', 'county', 'state_district'];

// Shorten a raw display_name into "[Straße] [Hausnummer], [PLZ] [Stadt]".
// Falls back to a truncated display_name (max 2 comma-separated parts) when no
// structured address parts are available.
export function formatAddress(raw, addr = {}) {
    const a = addr || {};
    const road = a.road || a.pedestrian || a.path || a.square || a.footway || '';
    const house = a.house_number || '';
    const postcode = a.postcode || '';
    const city = CITY_KEYS.map(k => a[k]).find(v => v) || '';
    const streetPart = [road, house].filter(Boolean).join(' ');
    const cityPart = [postcode, city].filter(Boolean).join(' ');
    if (streetPart || cityPart) {
        return [streetPart, cityPart].filter(Boolean).join(', ');
    }
    if (raw) {
        return raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 2).join(', ');
    }
    return '';
}

// Resolve a location to a precise address line
// ("[Name], [Straße und Hausnummer], [Postleitzahl] [Stadt]") so the result is
// never reduced to a bare city name such as "Stuttgart".
export async function geocodeStationAddress(query) {
    const res = await fetch(`${PHOTON_API}?q=${encodeURIComponent(query)}&limit=1`);
    const data = await res.json();
    if (!data.features || data.features.length === 0) return null;
    const f = data.features[0];
    const p = f.properties || {};
    const coordinates = [f.geometry.coordinates[1], f.geometry.coordinates[0]];

    const city = (p.city || p.town || p.village || p.state || '').trim();
    const name = (p.name || '').trim();
    const street = (p.street || '').trim();
    const house = (p.housenumber || '').trim();
    const postcode = (p.postcode || '').trim();

    const streetWithHouse = [street || '', house].filter(Boolean).join(' ').trim()
        || (name && name !== city ? name : '');
    const placeName = name && name !== street ? name : '';
    const cityPart = [postcode, city].filter(Boolean).join(' ');

    const parts = [];
    if (placeName && placeName !== city) parts.push(placeName);
    if (streetWithHouse && streetWithHouse !== placeName) parts.push(streetWithHouse);
    const cityTail = cityPart && cityPart !== placeName && cityPart !== streetWithHouse ? cityPart : '';
    if (cityTail) parts.push(cityTail);

    let label = parts.join(', ');
    if (!label || label.trim() === city) {
        const raw = query.trim();
        label = [raw || placeName || streetWithHouse, cityPart].filter(Boolean).join(', ');
    }
    return { label, coordinates };
}

// Geocode a parking-facility address and validate it strictly:
// a complete address requires a street name AND house number plus a postcode
// OR city. The returned label is normalized to "Straße Hausnummer, PLZ Stadt".
export async function geocodeFacilityAddress(query) {
    const res = await fetch(`${PHOTON_API}?q=${encodeURIComponent(query)}&limit=1`);
    const data = await res.json();
    if (!data.features || data.features.length === 0) return null;
    const f = data.features[0];
    const p = f.properties || {};
    const coordinates = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
    const city = (p.city || p.town || p.village || '').trim();
    const street = (p.street || '').trim();
    const house = (p.housenumber || '').trim();
    const postcode = (p.postcode || '').trim();
    const isValidAddress = true;
    const streetWithHouse = [street, house].filter(Boolean).join(' ');
    const cityPart = [postcode, city].filter(Boolean).join(' ');
    const label = p.name 
        ? [p.name, cityPart].filter(Boolean).join(', ')
        : [query.trim(), cityPart].filter(Boolean).join(', ');
    return {
        label,
        coordinates,
        street,
        house,
        postcode,
        city,
        isValidAddress,
    };
}

export async function resolveCoords({
    startLocation,
    startCoords,
    startFromAutocomplete,
    destination,
    destCoords,
    destFromAutocomplete,
    currentLocationStatus,
}) {
    let finalStartCoords = startCoords;
    let finalStartName = startLocation;
    let finalDestCoords = destCoords;
    let finalDestName = destination;

    if (destFromAutocomplete) {
        finalDestCoords = destCoords;
        finalDestName = destination;
    } else if (!finalDestCoords && destination) {
        const destResult = await geocodePhoton(destination);
        if (destResult) {
            finalDestName = destResult.name;
            finalDestCoords = destResult.coordinates;
        }
    }

    if (startFromAutocomplete) {
        finalStartCoords = startCoords;
        finalStartName = startLocation;
    } else if (startLocation && startLocation !== 'Baden-Württemberg' && startLocation !== 'Your Location') {
        if (startLocation === currentLocationStatus || startLocation === 'My Location') {
            finalStartName = currentLocationStatus || startLocation;
        } else {
            const startResult = await geocodePhoton(startLocation);
            if (startResult) {
                finalStartCoords = startResult.coordinates;
                finalStartName = startResult.name;
            }
        }
    }

    return {
        startCoords: finalStartCoords,
        startName: finalStartName,
        destCoords: finalDestCoords,
        destName: finalDestName,
    };
}

export function buildDepartureISO(year, month, activeDay, time) {
    const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${activeDay.toString().padStart(2, '0')}T${time}:00`;
    return new Date(dateStr).toISOString();
}
