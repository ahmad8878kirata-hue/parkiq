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
