import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParking } from '../context/ParkingContext';
import { Clock, Ticket, WarningCircle, MapPin } from '@phosphor-icons/react';
import './Selection.css';

const Selection = () => {
    const navigate = useNavigate();
    const { setParkingType, hasDauerparkticket, setHasDauerparkticket, hasJobTicket, setHasJobTicket, dauerparkticketStation, setDauerparkticketStation, setDauerparkticketStationCoords } = useParking();
    const [stationInput, setStationInput] = useState('');

    const handleSelect = () => {
        setParkingType('kurz');
        navigate('/home');
    };

    const handleDauerparkticketConfirm = async () => {
        if (stationInput.trim()) {
            setDauerparkticketStation(stationInput.trim());
            try {
                const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(stationInput.trim())}&limit=1`);
                const data = await res.json();
                if (data.features && data.features.length > 0) {
                    const coords = [data.features[0].geometry.coordinates[1], data.features[0].geometry.coordinates[0]];
                    setDauerparkticketStationCoords(coords);
                }
            } catch (e) {
                console.error('Failed to geocode station:', e);
            }
        }
    };

    return (
        <div className="view selection-view">
            <div className="selection-header">
                <h1 className="logo-text">Park<span>IQ</span></h1>
                <p className="selection-subtitle">Wählen Sie Ihren Parkart-Typ</p>
            </div>

            <div className="selection-container">
                <div className="selection-card kurz" onClick={handleSelect}>
                    <div className="selection-icon">
                        <Clock weight="fill" />
                    </div>
                    <div className="selection-content">
                        <h3>Kurzzeitparker</h3>
                        <p>Ideal für Einkäufe, Termine oder kurze Besuche. Es gelten Stundensätze.</p>
                        <div className="selection-tag">KURZZEIT</div>
                    </div>
                </div>
            </div>

            <div className="ticket-options-container">
                <div className="ticket-options-header">
                    <h3>Haben Sie eine der folgenden Optionen?</h3>
                    <p className="text-xs text-muted">Aktivieren Sie die für Sie zutreffende Option</p>
                </div>

                <div className="ticket-option glass-panel">
                    <div className="flex-between w-100">
                        <div className="flex-align-center gap-3">
                            <div className={`ticket-dot ${hasJobTicket ? 'active' : ''}`}>
                                <Ticket weight="bold" />
                            </div>
                            <div>
                                <div className="font-semibold text-sm">Job-Ticket / Deutschlandticket</div>
                                <div className="text-xs text-muted">Kostenlose Nutzung von Bus & Bahn</div>
                            </div>
                        </div>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={hasJobTicket}
                                onChange={(e) => setHasJobTicket(e.target.checked)}
                            />
                            <span className="slider round"></span>
                        </label>
                    </div>
                    {hasJobTicket && (
                        <div className="ticket-badge job-ticket-badge">
                            <WarningCircle weight="fill" /> Bus- & Bahnfahrten inklusive
                        </div>
                    )}
                </div>

                <div className="ticket-option glass-panel">
                    <div className="flex-between w-100">
                        <div className="flex-align-center gap-3">
                            <div className={`ticket-dot ${hasDauerparkticket ? 'active' : ''}`}>
                                <MapPin weight="bold" />
                            </div>
                            <div>
                                <div className="font-semibold text-sm">Dauerparkticket</div>
                                <div className="text-xs text-muted">Dauerparkkarte</div>
                            </div>
                        </div>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={hasDauerparkticket}
                                onChange={(e) => setHasDauerparkticket(e.target.checked)}
                            />
                            <span className="slider round"></span>
                        </label>
                    </div>
                    {hasDauerparkticket && (
                        <div className="ticket-badge dauerparkticket-badge">
                            {!dauerparkticketStation ? (
                                <div className="station-input-row">
                                    <input
                                        type="text"
                                        placeholder="Geben Sie Ihren Stationsnamen oder Ihre Adresse ein"
                                        value={stationInput}
                                        onChange={(e) => setStationInput(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleDauerparkticketConfirm(); }}
                                        className="station-input"
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); handleDauerparkticketConfirm(); }}>Festlegen</button>
                                </div>
                            ) : (
                                <div className="station-confirmed">
                                    <MapPin weight="fill" /> Station: {dauerparkticketStation}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="ticket-info-note">
                    <u>! BahnCard-Rabatte werden derzeit nicht unterstützt.</u>
                </div>
            </div>

            <div className="selection-footer">
                <p>Preise inkl. MwSt. und abhängig von der Verfügbarkeit.</p>
            </div>
        </div>
    );
};

export default Selection;
