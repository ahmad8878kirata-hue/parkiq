import { useRef, useState } from 'react';
import { X, MapPin, Car, Train } from '@phosphor-icons/react';
import AutocompleteInput from './AutocompleteInput';
import DateTimePicker from './DateTimePicker';
import { buildDepartureISO } from '../services/geocodingService';

const TIME_ERROR_MESSAGE =
    'Ungültiges Datum oder ungültige Uhrzeit. Bitte wählen Sie ein Datum und eine Uhrzeit, die nicht in der Vergangenheit liegen.';

const RouteSearchForm = ({
    initialStartLocation = '',
    initialStartCoords = [48.6616, 9.0654],
    initialDestination = '',
    initialDestCoords = null,
    selectedParking,
    onRemoveParking,
    onSubmit,
    loading = false,
    onFieldFocus,
    startLocation: controlledStartLocation,
    onStartLocationChange,
    startCoords: controlledStartCoords,
    onStartCoordsChange,
    destination: controlledDestination,
    onDestinationChange,
    destCoords: controlledDestCoords,
    onDestCoordsChange,
}) => {
    const startAutocompleteRef = useRef(false);
    const destAutocompleteRef = useRef(false);

    const isControlledStart = controlledStartLocation !== undefined;
    const isControlledDest = controlledDestination !== undefined;

    const [internalStartLocation, setInternalStartLocation] = useState(initialStartLocation);
    const [internalStartCoords, setInternalStartCoords] = useState(initialStartCoords);
    const [internalDestination, setInternalDestination] = useState(initialDestination);
    const [internalDestCoords, setInternalDestCoords] = useState(initialDestCoords);

    const startLocation = isControlledStart ? controlledStartLocation : internalStartLocation;
    const startCoords = isControlledStart ? (controlledStartCoords ?? internalStartCoords) : internalStartCoords;
    const destination = isControlledDest ? controlledDestination : internalDestination;
    const destCoords = isControlledDest ? (controlledDestCoords ?? internalDestCoords) : internalDestCoords;

    const setStartLocation = isControlledStart ? (onStartLocationChange ?? setInternalStartLocation) : setInternalStartLocation;
    const setStartCoords = isControlledStart ? (onStartCoordsChange ?? setInternalStartCoords) : setInternalStartCoords;
    const setDestination = isControlledDest ? (onDestinationChange ?? setInternalDestination) : setInternalDestination;
    const setDestCoords = isControlledDest ? (onDestCoordsChange ?? setInternalDestCoords) : setInternalDestCoords;

    const [destError, setDestError] = useState('');

    const today = new Date();
    const [activeDay, setActiveDay] = useState(today.getDate());
    const [month, setMonth] = useState(today.getMonth());
    const [year, setYear] = useState(today.getFullYear());
    const [time, setTime] = useState(
        `${today.getHours().toString().padStart(2, '0')}:${today.getMinutes().toString().padStart(2, '0')}`
    );
    const [showCalendar, setShowCalendar] = useState(false);
    const [timeConfirmed, setTimeConfirmed] = useState(false);
    const [timeError, setTimeError] = useState('');
    const [transportMode, setTransportMode] = useState('train');

    const TRAVEL_OPTIONS = [
        {
            id: 'car',
            label: 'Auto',
            hint: 'Direkt mit dem Auto',
            icon: <Car weight="fill" size={18} color="#64748b" />
        },
        {
            id: 'transit',
            label: 'ÖPNV',
            hint: 'Nur mit der Bahn',
            icon: <Train weight="fill" size={18} color="#0ea5e9" />
        },
        {
            id: 'train',
            label: 'Auto + Bahn',
            hint: 'Empfohlen',
            recommended: true,
            icon: (
                <span className="travel-option-icon-stack">
                    <Car weight="fill" size={16} color="#f43f5e" />
                    <Train weight="fill" size={16} color="#f43f5e" />
                </span>
            )
        }
    ];

    const handleSubmit = () => {
        const iso = buildDepartureISO(year, month, activeDay, time);
        const selected = new Date(iso);
        if (!/^\d{2}:\d{2}$/.test(time || '') || isNaN(selected.getTime()) || selected.getTime() < Date.now()) {
            setTimeError(TIME_ERROR_MESSAGE);
            return;
        }
        setTimeError('');
        onSubmit({
            startLocation,
            startCoords,
            startFromAutocomplete: startAutocompleteRef.current,
            destination,
            destCoords,
            destFromAutocomplete: destAutocompleteRef.current,
            transportMode,
            activeDay, month, year, time,
            setDestError,
        });
    };

    return (
        <>
            <div style={{ marginBottom: '1rem' }}>
                <div className="start-field-instruction">Tippen Sie auf eine Stelle auf der Karte oder geben Sie Ihre Startadresse ein.</div>
                <AutocompleteInput
                    placeholder="Startpunkt (z. B. Stuttgart Hbf)"
                    value={startLocation}
                    onChange={(e) => setStartLocation(e.target.value)}
                    onSelect={(data) => {
                        setStartCoords(data.coordinates);
                        setStartLocation(data.name);
                        startAutocompleteRef.current = true;
                    }}
                    onFocus={() => onFieldFocus?.('start')}
                    className="search-input"
                />
                <AutocompleteInput
                    placeholder="Wohin möchten Sie? (PLZ eingeben)"
                    value={destination}
                    onChange={(e) => { setDestination(e.target.value); setDestError(''); }}
                    onSelect={(data) => {
                        setDestCoords(data.coordinates);
                        setDestination(data.name);
                        destAutocompleteRef.current = true;
                        setDestError('');
                    }}
                    autoFocus
                    onFocus={() => onFieldFocus?.('dest')}
                    className="search-input search-input-dest"
                />
                {destError && <div className="dest-error">{destError}</div>}
            </div>

            <div className="travel-options">
                <div className="travel-options-title">Reiseoption</div>
                <div className="travel-options-row">
                    {TRAVEL_OPTIONS.map(opt => (
                        <button
                            key={opt.id}
                            type="button"
                            className={`travel-option ${transportMode === opt.id ? 'active' : ''}`}
                            onClick={() => setTransportMode(opt.id)}
                        >
                            <span className={`travel-option-icon ${opt.recommended ? 'recommended' : ''}`}>{opt.icon}</span>
                            <span className="travel-option-label">{opt.label}</span>
                            {opt.recommended && <span className="travel-option-recommended">Empfohlen</span>}
                        </button>
                    ))}
                </div>
            </div>

            <DateTimePicker
                activeDay={activeDay} setActiveDay={(d) => { setTimeError(''); setActiveDay(d); }}
                month={month} setMonth={(m) => { setTimeError(''); setMonth(m); }}
                year={year} setYear={(y) => { setTimeError(''); setYear(y); }}
                time={time} setTime={(t) => { setTimeError(''); setTime(t); }}
                showCalendar={showCalendar} setShowCalendar={setShowCalendar}
                showTimeConfirmBadge={timeConfirmed}
                onTimeConfirmBadgeShow={() => setTimeConfirmed(false)}
                onSave={() => { setShowCalendar(false); setTimeConfirmed(true); }}
            />
            {timeError && <div className="time-error">{timeError}</div>}

            {selectedParking && (
                <div className="selected-parking-chip">
                    <MapPin weight="fill" className="text-primary" />
                    <span>{selectedParking.name}</span>
                    <button className="chip-remove" onClick={onRemoveParking}><X weight="bold" /></button>
                </div>
            )}

            {!showCalendar && (
                <button
                    className="btn btn-primary btn-large w-100"
                    onClick={handleSubmit}
                    disabled={loading}
                >
                    {loading ? 'Bestes Ergebnis wird ermittelt...' : 'Beste PBW-Route finden'}
                </button>
            )}
        </>
    );
};

export default RouteSearchForm;
