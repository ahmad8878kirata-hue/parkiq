import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, CaretLeft, CaretRight, Minus, Plus, MapPin, CalendarBlank } from '@phosphor-icons/react';
import './Search.css';

const Search = () => {
    const navigate = useNavigate();
    const locationState = useLocation();
    const selectedParking = locationState.state?.selectedParking || null;
    const initialLocation = locationState.state?.currentLocation || 'Stuttgart';
    const initialCoords = locationState.state?.startCoords || [48.7758, 9.1829];
    const initialDest = locationState.state?.destination || '';
    const initialDestCoords = locationState.state?.destCoords || null;
    const [destination, setDestination] = useState(initialDest || 'Stuttgart Zentrum');
    const [startLocation, setStartLocation] = useState(initialLocation);
    const [startCoords, setStartCoords] = useState(initialCoords);
    const [activeDay, setActiveDay] = useState(28);
    const [time, setTime] = useState('08:30');
    const [showDate, setShowDate] = useState(false);
    const [transportMode, setTransportMode] = useState('transit');
    const [maxTimeMinutes, setMaxTimeMinutes] = useState(120);

    const [loadingLocation, setLoadingLocation] = useState(false);

    const handleAccept = async () => {
        setLoadingLocation(true);
        let finalStartCoords = startCoords;
        let finalDestName = destination;
        let finalStartName = startLocation;
        let finalDestCoords = initialDestCoords;

        try {
            // If no pre-set destination coords, geocode the destination name
            if (!finalDestCoords) {
                const destRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(destination)}&limit=1`);
                const destData = await destRes.json();
                if (destData.features && destData.features.length > 0) {
                    finalDestName = destData.features[0].properties.name || destination;
                    finalDestCoords = [destData.features[0].geometry.coordinates[1], destData.features[0].geometry.coordinates[0]];
                }
            }

            // Find closest match for start location
            if (startLocation && startLocation !== 'Stuttgart' && startLocation !== 'Your Location') {
                const startRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(startLocation)}&limit=1`);
                const startData = await startRes.json();
                if (startData.features && startData.features.length > 0) {
                    finalStartCoords = [startData.features[0].geometry.coordinates[1], startData.features[0].geometry.coordinates[0]];
                    finalStartName = startData.features[0].properties.name || startLocation;
                }
            }
        } catch (e) {
            console.error("Geocoding failed:", e);
        }

        const dateStr = `2026-04-${activeDay.toString().padStart(2, '0')}T${time}:00`;
        const arrivalTime = new Date(dateStr).toISOString();
        navigate('/results', {
            state: {
                destination: finalDestName,
                startLocation: finalStartName,
                startCoords: finalStartCoords,
                destCoords: finalDestCoords,
                arrivalTime,
                parkingId: selectedParking?.id,
                transportMode,
                maxTimeMinutes
            }
        });
    };

    const adjustTime = (minutes) => {
        let [h, m] = time.split(':').map(Number);
        m += minutes;
        if (m >= 60) { h = (h + 1) % 24; m -= 60; }
        if (m < 0) { h = (h - 1 + 24) % 24; m += 60; }
        setTime(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    };

    const renderDays = () => {
        const days = [];
        // Mock April 2026 days
        for (let i = 30; i <= 31; i++) days.push(<div key={`prev-${i}`} className="day disabled">{i}</div>);
        for (let i = 1; i <= 30; i++) {
            days.push(
                <div 
                    key={`curr-${i}`} 
                    className={`day ${activeDay === i ? 'active' : ''}`}
                    onClick={() => setActiveDay(i)}
                >
                    {i.toString().padStart(2, '0')}
                </div>
            );
        }
        for (let i = 1; i <= 3; i++) days.push(<div key={`next-${i}`} className="day disabled">{i.toString().padStart(2, '0')}</div>);
        return days;
    };

    return (
        <div className="view">
            <div className="sheet-backdrop" onClick={() => navigate('/home')} />
            <div className="sheet-content">
                <div className="sheet-header">
                    <h3>Outbound journey</h3>
                    <button className="icon-btn close-btn" onClick={() => navigate('/home')}>
                        <X weight="bold" />
                    </button>
                </div>
                
                <div className="mb-4">
                    <label style={{display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: '600'}}>Starting Point</label>
                    <input 
                        type="text" 
                        value={startLocation} 
                        onChange={(e) => setStartLocation(e.target.value)}
                        style={{width: '100%', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-color)', outline: 'none', fontFamily: 'var(--font-body)', fontSize: '1rem', background: 'var(--surface)', color: 'var(--text-main)', marginBottom: '1rem'}}
                    />
                    <label style={{display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: '600'}}>Destination</label>
                    <input 
                        type="text" 
                        placeholder="Where are you going?"
                        value={destination} 
                        onChange={(e) => setDestination(e.target.value)}
                        autoFocus
                        style={{width: '100%', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--primary-light)', outline: 'none', fontFamily: 'var(--font-body)', fontSize: '1rem', background: 'var(--surface)', color: 'var(--text-main)', boxShadow: '0 4px 12px rgba(244, 63, 94, 0.1)', marginBottom: '1rem'}}
                    />

                    <label style={{display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: '600'}}>Transport Mode</label>
                    <select 
                        value={transportMode} 
                        onChange={(e) => setTransportMode(e.target.value)}
                        style={{width: '100%', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-color)', outline: 'none', background: 'var(--surface)', color: 'var(--text-main)', marginBottom: '1rem'}}
                    >
                        <option value="transit">Public Transit</option>
                        <option value="bicycle">Bicycle</option>
                        <option value="walking">Walking</option>
                    </select>

                    <label style={{display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: '600'}}>Max Travel Time ({maxTimeMinutes} min)</label>
                    <input 
                        type="range" 
                        min="10" max="240" step="10"
                        value={maxTimeMinutes} 
                        onChange={(e) => setMaxTimeMinutes(parseInt(e.target.value))}
                        style={{width: '100%', marginBottom: '1rem'}}
                    />
                </div>
                
                {!showDate ? (
                    <button 
                        className="btn btn-outline w-100 mb-4" 
                        onClick={() => setShowDate(true)}
                        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <CalendarBlank weight="bold" size={20} />
                        <span>Set Date & Time</span>
                    </button>
                ) : (
                    <div className="toggle-group mb-4">
                        <button className="toggle-btn active">Departure</button>
                        <button className="toggle-btn">Arrival</button>
                    </div>
                )}
                
                {showDate && (
                    <>
                        <div className="calendar-header">
                            <button className="icon-btn text-muted">
                                <CaretLeft weight="bold" /> Mar
                            </button>
                            <span className="current-month">April 2026</span>
                            <button className="icon-btn text-muted">
                                May <CaretRight weight="bold" />
                            </button>
                        </div>
                        
                        <div className="calendar-grid">
                            <div className="day-name">Mo</div><div className="day-name">Tu</div><div className="day-name">We</div><div className="day-name">Th</div><div className="day-name">Fr</div><div className="day-name">Sa</div><div className="day-name">Su</div>
                            {renderDays()}
                        </div>
                        
                        <div className="time-picker mb-4">
                            <button className="icon-btn text-primary" onClick={() => adjustTime(-15)}>
                                <Minus weight="bold" />
                            </button>
                            <span className="time-display">{time}</span>
                            <button className="icon-btn text-primary" onClick={() => adjustTime(15)}>
                                <Plus weight="bold" />
                            </button>
                            <button className="btn btn-outline ml-auto" onClick={() => {
                                const now = new Date();
                                setTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
                                setActiveDay(now.getDate());
                            }}>Now</button>
                        </div>
                    </>
                )}
                
                {selectedParking && (
                    <div className="selected-parking-chip">
                        <MapPin weight="fill" className="text-primary" />
                        <span>{selectedParking.name}</span>
                        <button className="chip-remove" onClick={() => navigate('/search', { state: {}, replace: true })}><X weight="bold" /></button>
                    </div>
                )}
                <button 
                    className="btn btn-primary btn-large w-100" 
                    onClick={handleAccept}
                    disabled={loadingLocation}
                >
                    {loadingLocation ? 'Finding Best Match...' : 'Find Best PBW Route'}
                </button>
            </div>
        </div>
    );
};

export default Search;
