import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X } from '@phosphor-icons/react';
import './Search.css';
import RouteSearchForm from '../components/RouteSearchForm';
import { resolveCoords, buildArrivalISO } from '../services/geocodingService';

const Search = () => {
    const navigate = useNavigate();
    const locationState = useLocation();
    const selectedParking = locationState.state?.selectedParking || null;
    const initialLocation = locationState.state?.currentLocation || 'Baden-Württemberg';
    const initialCoords = locationState.state?.startCoords || [48.6616, 9.0654];
    const initialDest = locationState.state?.destination || '';
    const initialDestCoords = locationState.state?.destCoords || null;

    const [loadingLocation, setLoadingLocation] = useState(false);

    const handleSearchSubmit = async (form) => {
        setLoadingLocation(true);
        form.setDestError('');
        try {
            const result = await resolveCoords({
                startLocation: form.startLocation,
                startCoords: form.startCoords,
                startFromAutocomplete: form.startFromAutocomplete,
                destination: form.destination,
                destCoords: form.destCoords,
                destFromAutocomplete: form.destFromAutocomplete,
                currentLocationStatus: initialLocation,
            });

            if (!result.destCoords) {
                setLoadingLocation(false);
                form.setDestError('Ungültiger Ort. Bitte geben Sie einen gültigen Ort ein.');
                return;
            }

            const arrivalTime = buildArrivalISO(form.year, form.month, form.activeDay, form.time);
            navigate('/results', {
                state: {
                    destination: result.destName,
                    startLocation: result.startName,
                    startCoords: result.startCoords,
                    destCoords: result.destCoords,
                    arrivalTime,
                    parkingId: selectedParking?.id
                }
            });
        } catch (e) {
            console.error("Geocoding failed:", e);
            setLoadingLocation(false);
        }
    };

    return (
        <div className="view">
            <div className="sheet-backdrop" onClick={() => navigate('/home')} />
            <div className="sheet-content">
                <div className="sheet-header">
                    <h3>Route</h3>
                    <button className="icon-btn close-btn" onClick={() => navigate('/home')}>
                        <X weight="bold" />
                    </button>
                </div>

                <RouteSearchForm
                    initialStartLocation={initialLocation}
                    initialStartCoords={initialCoords}
                    initialDestination={initialDest}
                    initialDestCoords={initialDestCoords}
                    selectedParking={selectedParking}
                    onRemoveParking={() => navigate('/search', { state: {}, replace: true })}
                    onSubmit={handleSearchSubmit}
                    loading={loadingLocation}
                />
            </div>
        </div>
    );
};

export default Search;
