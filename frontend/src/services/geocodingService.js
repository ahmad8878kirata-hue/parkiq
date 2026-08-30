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
