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
    const [destination, setDestination] = useState('Stuttgart Zentrum');
    const [startLocation, setStartLocation] = useState(initialLocation);
    const [startCoords, setStartCoords] = useState(initialCoords);
    const [activeDay, setActiveDay] = useState(28);
    const [time, setTime] = useState('08:30');
    const [showDate, setShowDate] = useState(false);

    const handleAccept = () => {
        const dateStr = `2026-04-${activeDay.toString().padStart(2, '0')}T${time}:00`;
        const arrivalTime = new Date(dateStr).toISOString();
        navigate('/results', {
            state: {
                destination,
                startLocation,
                startCoords,
                arrivalTime,
                parkingId: selectedParking?.id
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
                        style={{width: '100%', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--primary-light)', outline: 'none', fontFamily: 'var(--font-body)', fontSize: '1rem', background: 'var(--surface)', color: 'var(--text-main)', boxShadow: '0 4px 12px rgba(244, 63, 94, 0.1)'}}
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
                >
                    Find Best PBW Route
                </button>
            </div>
        </div>
    );
};

export default Search;
