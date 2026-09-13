import { useNavigate } from 'react-router-dom';
import { useParking } from '../context/ParkingContext';
import { Clock, Ticket, WarningCircle, MapPin } from '@phosphor-icons/react';
import DauerparkticketSettings from '../components/DauerparkticketSettings';
import './Selection.css';

const Selection = () => {
    const navigate = useNavigate();
    const { setParkingType, hasDauerparkticket, setHasDauerparkticket, hasJobTicket, setHasJobTicket } = useParking();

    const handleSelect = () => {
        setParkingType('kurz');
        navigate('/home');
    };

    return (
        <div className="view selection-view">
            <div className="selection-header">
                <h1 className="logo-text">Park<span>IQ</span></h1>
                <p className="selection-subtitle">Wählen Sie Ihre individuellen Einstellungen.</p>
            </div>

            <div className="selection-container">
                <div className="selection-card kurz" onClick={handleSelect}>
                    <div className="selection-icon">
                        <Clock weight="fill" />
                    </div>
                    <div className="selection-content">
                        <h3>Kurzzeitparker</h3>
                        <p>Ideal für Einkauf, Termine oder kurze Besuche.</p>
                        <span className="selection-tag">KURZZEIT</span>
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
                        <div className="ticket-badge dauerparkticket-badge dauerparkticket-settings-wrap">
                            <DauerparkticketSettings />
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
