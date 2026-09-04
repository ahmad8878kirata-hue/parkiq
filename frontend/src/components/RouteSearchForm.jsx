import { useRef, useState } from 'react';
import { X, MapPin } from '@phosphor-icons/react';
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
}) => {
    const startAutocompleteRef = useRef(false);
    const destAutocompleteRef = useRef(false);

    const [startLocation, setStartLocation] = useState(initialStartLocation);
    const [startCoords, setStartCoords] = useState(initialStartCoords);
    const [destination, setDestination] = useState(initialDestination);
    const [destCoords, setDestCoords] = useState(initialDestCoords);
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
    const [transportMode] = useState('train');

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
                    onChange={(e) => { setDestination(e.target.value); setDestError(''); }}
                    onSelect={(data) => {
                        setDestCoords(data.coordinates);
                        setDestination(data.name);
                        destAutocompleteRef.current = true;
                        setDestError('');
                    }}
                    autoFocus
                    className="search-input search-input-dest"
                />
                {destError && <div className="dest-error">{destError}</div>}
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
