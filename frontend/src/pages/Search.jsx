import { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, CaretLeft, CaretRight, MapPin, CalendarBlank } from '@phosphor-icons/react';
import './Search.css';
import '../components/AutocompleteInput.css';
import AutocompleteInput from '../components/AutocompleteInput';

const Search = () => {
    const navigate = useNavigate();
    const locationState = useLocation();
    const selectedParking = locationState.state?.selectedParking || null;
    const initialLocation = locationState.state?.currentLocation || 'Baden-Württemberg';
    const initialCoords = locationState.state?.startCoords || [48.6616, 9.0654];
    const initialDest = locationState.state?.destination || '';
    const initialDestCoords = locationState.state?.destCoords || null;
    const [destCoords, setDestCoords] = useState(initialDestCoords);
    const [destination, setDestination] = useState(initialDest || '');
    const [startLocation, setStartLocation] = useState(initialLocation);
    const [startCoords, setStartCoords] = useState(initialCoords);
    const startAutocompleteRef = useRef(false);
    const destAutocompleteRef = useRef(false);
    const today = new Date();
    const [activeDay, setActiveDay] = useState(today.getDate());
    const [month, setMonth] = useState(today.getMonth());
    const [year, setYear] = useState(today.getFullYear());
    const [time, setTime] = useState(`${today.getHours().toString().padStart(2, '0')}:${today.getMinutes().toString().padStart(2, '0')}`);
    const [showDate, setShowDate] = useState(false);
    const [isDeparture, setIsDeparture] = useState(true);

    const [loadingLocation, setLoadingLocation] = useState(false);

    const handleAccept = async () => {
        setLoadingLocation(true);
        let finalStartCoords = startCoords;
        let finalDestName = destination;
        let finalStartName = startLocation;
        let finalDestCoords = destCoords;

        // Use autocomplete-selected coordinates if available
        if (startAutocompleteRef.current) {
            finalStartCoords = startCoords;
            finalStartName = startLocation;
        }
        if (destAutocompleteRef.current) {
            finalDestCoords = destCoords;
            finalDestName = destination;
        }

        try {
            if (!finalDestCoords) {
                const destRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(destination)}&limit=1`);
                const destData = await destRes.json();
                if (destData.features && destData.features.length > 0) {
                    finalDestName = destData.features[0].properties.name || destination;
                    finalDestCoords = [destData.features[0].geometry.coordinates[1], destData.features[0].geometry.coordinates[0]];
                }
            }

            if (!startAutocompleteRef.current && startLocation && startLocation !== 'Baden-Württemberg' && startLocation !== 'Your Location') {
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

        const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${activeDay.toString().padStart(2, '0')}T${time}:00`;
        const arrivalTime = new Date(dateStr).toISOString();
        navigate('/results', {
            state: {
                destination: finalDestName,
                startLocation: finalStartName,
                startCoords: finalStartCoords,
                destCoords: finalDestCoords,
                arrivalTime,
                parkingId: selectedParking?.id
            }
        });
    };

    const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    const fullMonthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

    const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
    const firstDayOfMonth = (y, m) => new Date(y, m, 1).getDay();

    const prevMonth = () => {
        if (month === 0) { setMonth(11); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (month === 11) { setMonth(0); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    };

    const isPastDay = (day) => {
        const d = new Date(year, month, day);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return d < now;
    };

    const renderDays = () => {
        const days = [];
        const dim = daysInMonth(year, month);
        const fdow = firstDayOfMonth(year, month);
        const prevDim = daysInMonth(year, month - 1 < 0 ? 11 : month - 1);

        for (let i = fdow === 0 ? 6 : fdow - 1; i > 0; i--) {
            days.push(<div key={`prev-${i}`} className="day disabled">{prevDim - i + 1}</div>);
        }
        for (let i = 1; i <= dim; i++) {
            const past = isPastDay(i);
            days.push(
                <div 
                    key={`curr-${i}`} 
                    className={`day ${past ? 'disabled' : ''} ${activeDay === i ? 'active' : ''}`}
                    onClick={() => { if (!past) setActiveDay(i); }}
                >
                    {i.toString().padStart(2, '0')}
                </div>
            );
        }
        return days;
    };

    return (
        <div className="view">
            <div className="sheet-backdrop" onClick={() => navigate('/home')} />
            <div className="sheet-content">
                {!showDate && (
                <>
                <div className="sheet-header">
                    <h3>Hinfahrt</h3>
                    <button className="icon-btn close-btn" onClick={() => navigate('/home')}>
                        <X weight="bold" />
                    </button>
                </div>
                
                <div className="mb-4">
                    <AutocompleteInput
                        placeholder="Startpunkt (z. B. Stuttgart Hbf)"
                        value={startLocation}
                        onChange={(e) => setStartLocation(e.target.value)}
                        onSelect={(data) => {
                            setStartCoords(data.coordinates);
                            setStartLocation(data.name);
                            startAutocompleteRef.current = true;
                        }}
                        className="search-input"
                    />
                    <AutocompleteInput
                        placeholder="Wohin möchten Sie? (PLZ eingeben)"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        onSelect={(data) => {
                            setDestCoords(data.coordinates);
                            setDestination(data.name);
                            destAutocompleteRef.current = true;
                        }}
                        autoFocus
                        className="search-input search-input-dest"
                    />
                </div>
                </>
                )}
                
                {!showDate ? (
                    <button 
                        className="btn btn-outline date-btn" 
                        onClick={() => setShowDate(true)}
                    >
                        <CalendarBlank weight="bold" size={18} />
                        <span>Datum & Uhrzeit festlegen</span>
                        <span className="date-btn-value">{fullMonthNames[month].slice(0, 3)} {activeDay}, {time}</span>
                    </button>
                ) : null}
                
                {showDate && (
                    <>
                        <div className="dt-close-row">
                            <button className="icon-btn close-btn" onClick={() => setShowDate(false)}>
                                <X weight="bold" />
                            </button>
                        </div>
                        <div className="datetime-content">
                            <div className="calendar-header">
                                <button className="icon-btn text-muted" onClick={prevMonth}>
                                    <CaretLeft weight="bold" /> {month === 0 ? monthNames[11] : monthNames[month - 1]}
                                </button>
                                <span className="current-month">{fullMonthNames[month]} {year}</span>
                                <button className="icon-btn text-muted" onClick={nextMonth}>
                                    {month === 11 ? monthNames[0] : monthNames[month + 1]} <CaretRight weight="bold" />
                                </button>
                            </div>
                            
                            <div className="calendar-grid">
                                <div className="day-name">Mo</div><div className="day-name">Tu</div><div className="day-name">We</div><div className="day-name">Th</div><div className="day-name">Fr</div><div className="day-name">Sa</div><div className="day-name">Su</div>
                                {renderDays()}
                            </div>
                            
                            <div className="time-picker mb-4">
                                <input
                                    type="time"
                                    value={time}
                                    onChange={(e) => setTime(e.target.value)}
                                    className="time-input"
                                />
                                <span className="time-display">{time}</span>
                                <button className="btn btn-outline ml-auto now-btn" onClick={() => {
                                    const now = new Date();
                                    setTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
                                    setActiveDay(now.getDate());
                                }}>Jetzt</button>
                            </div>
                            <button className="btn btn-primary w-100 set-date-btn" onClick={() => setShowDate(false)}>Speichern</button>
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
                {!showDate && (
                <button 
                    className="btn btn-primary btn-large w-100" 
                    onClick={handleAccept}
                    disabled={loadingLocation}
                >
                    {loadingLocation ? 'Bestes Ergebnis wird ermittelt...' : 'Beste PBW-Route finden'}
                </button>
                )}
            </div>
        </div>
    );
};

export default Search;
