import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useParking } from '../context/ParkingContext';
import { ArrowLeft, MapPin, Car, PersonSimpleWalk, Train, Bus, Bicycle, CircleNotch, CaretLeft, Envelope, WarningCircle } from '@phosphor-icons/react';
import SpecialOfferToast from '../components/SpecialOfferToast';
import L from 'leaflet';
import './Results.css';

const API_BASE = 'http://localhost:5000';

const MODE_META = {
    train: { icon: '🚆', label: 'Train', color: '#f43f5e' },
    bus: { icon: '🚌', label: 'Bus', color: '#3b82f6' },
    bicycle: { icon: '🚲', label: 'Bicycle', color: '#22c55e' }
};

const Results = () => {
    const navigate = useNavigate();
    const locationState = useLocation();
    const { parkingType, isRegistered } = useParking();
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const parkingMarkersRef = useRef([]);
    const routeLayersRef = useRef([]);

    const iconSvgCache = useRef({});
    const iconRef = (name) => (el) => {
        if (el && !iconSvgCache.current[name]) {
            const svg = el.querySelector('svg');
            if (svg) iconSvgCache.current[name] = svg.outerHTML;
        }
    };

    const [isExpanded, setIsExpanded] = useState(true);
    const [showToast, setShowToast] = useState(false);

    const touchStartY = useRef(0);
    const handleTouchStart = (e) => { touchStartY.current = e.touches ? e.touches[0].clientY : e.clientY; };
    const handleTouchMove = (e) => {
        if (!isExpanded) return;
        const currentY = e.touches ? e.touches[0].clientY : e.clientY;
        if (currentY - touchStartY.current > 40) setIsExpanded(false);
    };

    const [routeOptions, setRouteOptions] = useState([]);
    const [selectedParking, setSelectedParking] = useState(null);
    const [selectingMode, setSelectingMode] = useState(false);
    const [routeData, setRouteData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingRoute, setLoadingRoute] = useState(false);
    const [error, setError] = useState(null);

    const destination = locationState.state?.destination || 'Stuttgart Zentrum';
    const startLocation = locationState.state?.startLocation || 'Your Location';
    const startCoords = locationState.state?.startCoords || [48.7758, 9.1829];
    const destCoords = locationState.state?.destCoords || null;
    const arrivalTime = locationState.state?.arrivalTime;
    const parkingId = locationState.state?.parkingId || null;
    const maxTimeMinutes = locationState.state?.maxTimeMinutes || 120;

    // Fetch parking options list
    useEffect(() => {
        const fetchOptions = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`${API_BASE}/api/routes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ destination, startCoords, destCoords, arrivalTime, parkingId, maxTimeMinutes })
                });
                if (!res.ok) throw new Error(`API error: ${res.status}`);
                const json = await res.json();
                if (!json.success) throw new Error(json.message || 'Unknown error');

                const enriched = (json.data || []).map((opt, index) => ({
                    ...opt,
                    category: 'Public',
                    hasSpecialRate: index === 0 && isRegistered
                }));
                setRouteOptions(enriched);
                if (isRegistered && enriched.some(o => o.hasSpecialRate)) {
                    setTimeout(() => setShowToast(true), 1000);
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchOptions();
    }, [destination, startCoords, arrivalTime, parkingId, isRegistered]);

    // Init map with markers
    useEffect(() => {
        if (mapInstance.current || !mapRef.current || loading) return;

        mapInstance.current = L.map(mapRef.current, { zoomControl: false }).setView(startCoords, 12);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(mapInstance.current);
        setTimeout(() => mapInstance.current?.invalidateSize(), 200);

        const startIcon = L.divIcon({
            className: 'map-node start-node',
            html: '📍',
            iconSize: [30, 30]
        });
        L.marker(startCoords, { icon: startIcon }).addTo(mapInstance.current);

    }, [loading, routeOptions]);

    const handleSelectParking = (opt) => {
        setSelectedParking(opt);
        setSelectingMode(true);
        setRouteData(null);
        setIsExpanded(true);
    };

    const handleModeSelect = useCallback(async (mode) => {
        if (!selectedParking) return;
        setLoadingRoute(true);
        setSelectingMode(false);
        try {
            const res = await fetch(`${API_BASE}/api/routes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        destination, startCoords, destCoords, arrivalTime,
                        parkingId: selectedParking.id,
                        transportMode: mode,
                        maxTimeMinutes
                    })
            });
            if (!res.ok) throw new Error(`API error: ${res.status}`);
            const json = await res.json();
            if (!json.success || !json.data?.length) throw new Error(json.message || 'No route found');
            setRouteData(json.data[0]);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoadingRoute(false);
        }
    }, [selectedParking, destination, startCoords, arrivalTime, maxTimeMinutes]);

    // Draw route on map
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !routeData) return;

        routeLayersRef.current.forEach(layer => layer.remove());
        routeLayersRef.current = [];

        const layers = [];
        const bounds = L.latLngBounds([]);
        bounds.extend(startCoords);

        if (routeData.segments && routeData.segments.length > 0) {
            routeData.segments.forEach((seg) => {
                const mode = seg.mode || 'driving';
                if (!seg.path || seg.path.length < 2) return;
                seg.path.forEach(pt => bounds.extend(pt));

                let modeColor, modeKey, glowColor, lineWeight;
                if (mode === 'driving') { modeColor = '#1e293b'; modeKey = 'driving'; glowColor = 'rgba(30,41,59,0.25)'; lineWeight = 6; }
                else if (mode === 'walking') { modeColor = '#16a34a'; modeKey = 'walking'; glowColor = 'rgba(22,163,74,0.2)'; lineWeight = 5; }
                else if (mode === 'transit' || mode === 'train') { modeColor = '#e11d48'; modeKey = 'train'; glowColor = 'rgba(225,29,72,0.2)'; lineWeight = 6; }
                else if (mode === 'bus') { modeColor = '#2563eb'; modeKey = 'bus'; glowColor = 'rgba(37,99,235,0.2)'; lineWeight = 6; }
                else if (mode === 'cycling') { modeColor = '#16a34a'; modeKey = 'cycling'; glowColor = 'rgba(22,163,74,0.2)'; lineWeight = 5; }

                // Glow/shadow layer behind the main line
                const glow = L.polyline(seg.path, {
                    color: glowColor || modeColor, weight: lineWeight + 8, opacity: 0.35,
                    lineCap: 'round', lineJoin: 'round'
                }).addTo(map);
                layers.push(glow);

                if (modeColor) {
                    const dashOpts = mode === 'walking' ? { dashArray: '6, 8' } : {};
                    const poly = L.polyline(seg.path, {
                        color: modeColor, weight: lineWeight, opacity: 0.9,
                        lineCap: 'round', lineJoin: 'round', ...dashOpts
                    }).addTo(map);
                    layers.push(poly);

                    // Phosphor icon at segment start
                    const svgContent = iconSvgCache.current[modeKey] || '';
                    const iconHtml = `<div class="route-icon-node ${modeKey}">${svgContent}</div>`;
                    L.marker(seg.path[0], {
                        icon: L.divIcon({ className: 'custom-route-icon', html: iconHtml, iconSize: [26, 26] })
                    }).addTo(map);
                }

                // Label at midpoint with icon + duration
                const midIdx = Math.floor(seg.path.length / 2);
                const svgIcon = iconSvgCache.current[modeKey] || '';
                const labelHtml = `<div class="label-inner"><span class="label-icon">${svgIcon}</span><span class="label-duration">${seg.durationMin || 15} min</span></div>`;

                L.marker(seg.path[midIdx], {
                    icon: L.divIcon({
                        className: 'route-label-node',
                        html: labelHtml,
                        iconSize: [80, 24]
                    })
                }).addTo(map);
            });
        }

        // Parking marker (clean "P")
        const parkMarker = L.marker([routeData.lat, routeData.lng], {
            icon: L.divIcon({
                className: 'map-node parking-node',
                html: '<div style="background:#f43f5e;color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">P</div>',
                iconSize: [28, 28]
            })
        }).addTo(map);
        layers.push(parkMarker);
        bounds.extend([routeData.lat, routeData.lng]);

        // Destination marker
        const finalDestCoords = destCoords || (routeData.segments?.length > 0
            ? routeData.segments[routeData.segments.length - 1].path.slice(-1)[0]
            : null);
        if (finalDestCoords) {
            const destMarker = L.marker(finalDestCoords, {
                icon: L.divIcon({
                    className: 'map-node dest-node',
                    html: '<div style="background:#3b82f6;color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">D</div>',
                    iconSize: [28, 28]
                })
            }).addTo(map);
            layers.push(destMarker);
            bounds.extend(finalDestCoords);
        }

        routeLayersRef.current = layers;
        map.fitBounds(bounds, { padding: [50, 100] });
        setIsExpanded(true);
    }, [routeData]);

    const handleEmailReservation = (parkingName) => {
        const subject = `Reservation Request: ${parkingName}`;
        const body = `Hello Customer Service,\n\nI would like to make a reservation for ${parkingName} as a ${parkingType === 'dauer' ? 'Permanent' : 'Short-term'} parker.\n\nStatus: ${isRegistered ? 'Registered (Sondertarife active)' : 'Guest'}\n\nPlease confirm availability.`;
        window.location.href = `mailto:service@parkiq.example.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    };

    const handleStartNavigation = () => {
        window.open(`https://www.google.com/maps/dir/?api=1&origin=${startCoords[0]},${startCoords[1]}&destination=${encodeURIComponent(destination)}&travelmode=transit`, '_blank');
    };

    const renderIcon = (mode) => {
        const commonProps = { weight: 'fill', size: 20 };
        if (mode === 'driving') return <Car {...commonProps} color="#000000" />;
        if (mode === 'parking') return <span style={{fontWeight:'bold',fontSize:15,color:'#f43f5e'}}>P</span>;
        if (mode === 'transit' || mode === 'train') return <Train {...commonProps} color="#f43f5e" />;
        if (mode === 'bus') return <Bus {...commonProps} color="#3b82f6" />;
        if (mode === 'cycling') return <Bicycle {...commonProps} color="#22c55e" />;
        if (mode === 'walking') return <PersonSimpleWalk {...commonProps} color="#22c55e" />;
        if (mode === 'destination') return <MapPin weight="fill" size={20} color="#3b82f6" />;
        return <PersonSimpleWalk weight="fill" size={20} />;
    };

    // Hidden icon renderer for Leaflet map markers
    const hiddenIcons = (
        <div style={{position:'absolute',left:-9999,top:-9999,opacity:0,pointerEvents:'none',width:0,height:0,overflow:'hidden'}}>
            <span ref={iconRef('driving')}><Car weight="fill" size={16} /></span>
            <span ref={iconRef('walking')}><PersonSimpleWalk weight="fill" size={16} /></span>
            <span ref={iconRef('train')}><Train weight="fill" size={16} /></span>
            <span ref={iconRef('bus')}><Bus weight="fill" size={16} /></span>
            <span ref={iconRef('cycling')}><Bicycle weight="fill" size={16} /></span>
        </div>
    );

    return (
        <div className="view">
            {hiddenIcons}
            {showToast && <SpecialOfferToast message="Student/Employee discount applied! -20%" onClose={() => setShowToast(false)} />}

            {loading ? (
                <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', background:'var(--surface)'}}>
                    <CircleNotch weight="bold" className="pulse text-primary" style={{fontSize: '3rem', animation: 'spin 1s linear infinite'}} />
                    <h3 className="font-bold">Loading parking options...</h3>
                </div>
            ) : error ? (
                <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', background:'var(--surface)', padding:'2rem', textAlign:'center'}}>
                    <WarningCircle weight="fill" style={{fontSize:'3rem',color:'var(--primary)',marginBottom:'1rem'}} />
                    <h3 className="font-bold" style={{marginBottom:'0.5rem'}}>Route Error</h3>
                    <p className="text-muted text-sm" style={{marginBottom:'1.5rem'}}>{error}</p>
                    <button className="btn btn-outline" onClick={() => navigate('/search')}>Try Again</button>
                </div>
            ) : (
                <>
                    <div ref={mapRef} className="main-map" />

                    <div className="top-nav map-top-nav" style={{display: 'flex', justifyContent: 'space-between', width: '100%'}}>
                        <button className="icon-btn bg-white shadow-sm" onClick={() => navigate(-1)}><ArrowLeft weight="bold" /></button>
                        <div className="destination-pill bg-white shadow-sm"><MapPin weight="fill" className="text-primary" /><span>{destination}</span></div>
                        <button className="icon-btn bg-white shadow-sm" onClick={() => navigate('/home')}><ArrowLeft weight="bold" style={{transform: 'rotate(180deg)'}} /></button>
                    </div>

                    <div className={`bottom-sheet ${isExpanded ? 'expanded' : ''}`}>
                        <div
                            className="drag-handle-container"
                            onClick={() => setIsExpanded(!isExpanded)}
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onMouseDown={handleTouchStart}
                            onMouseMove={(e) => { if (e.buttons === 1) handleTouchMove(e); }}
                            style={{ cursor: 'grab', padding: '12px 0', width: '100%', display: 'flex', justifyContent: 'center' }}
                        >
                            <div className="drag-handle" style={{ background: '#94a3b8', width: '48px', height: '5px', borderRadius: '4px' }}></div>
                        </div>
                        <div className="sheet-scrollable">

                            {/* Step 1: Options list */}
                            {!selectedParking && !loadingRoute && !routeData && (
                                <div className="options-list">
                                    <h4 className="text-muted text-sm font-semibold mb-3">SELECT PARKING</h4>
                                    {routeOptions.map((opt, idx) => (
                                        <div key={idx} className={`option-card ${opt.hasSpecialRate ? 'special-card' : ''}`} onClick={() => handleSelectParking(opt)}>
                                            <div className="flex-between mb-2">
                                                <div className="font-bold">{opt.parkingName}<span className={`category-tag ${opt.category?.toLowerCase() || 'public'}`}>{opt.category || 'Public'}</span></div>
                                                <div className="price-container">
                                                    {opt.hasSpecialRate && <span className="old-price">€ {opt.totalCost}</span>}
                                                    <div className="font-bold text-primary">
                                                        € {opt.hasSpecialRate ? (parseFloat(opt.totalCost) * 0.8).toFixed(2) : opt.totalCost}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="option-details">
                                                <div className="flex-between text-sm text-muted">
                                                    <div>{opt.totalTime}</div>
                                                    <div>Save €{opt.savings}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Step 2: Mode selection */}
                            {selectedParking && selectingMode && !loadingRoute && (
                                <div>
                                    <div className="route-header">
                                        <button className="icon-btn mb-2" onClick={() => { setSelectedParking(null); setSelectingMode(false); }}><CaretLeft weight="bold" /></button>
                                        <h3 className="text-center font-bold">{selectedParking.parkingName}</h3>
                                        <p className="text-center text-muted text-sm mb-4">Choose your transport mode</p>
                                    </div>
                                    <div className="mode-selector">
                                        {Object.entries(MODE_META).map(([mode, meta]) => {
                                            const isAvailable = mode === 'train' ? selectedParking.hasTrainStop
                                                : mode === 'bus' ? selectedParking.hasBusStop
                                                : selectedParking.hasBikeStop;
                                            return (
                                                <div
                                                    key={mode}
                                                    className={`mode-btn ${!isAvailable ? 'disabled' : ''}`}
                                                    onClick={() => isAvailable && handleModeSelect(mode)}
                                                >
                                                    <div className="mode-icon" style={{ borderColor: meta.color }}>
                                                        <span style={{fontSize: '1.5rem'}}>{meta.icon}</span>
                                                    </div>
                                                    <div className="mode-label">{meta.label}</div>
                                                    {!isAvailable && <div className="mode-unavailable">N/A</div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Loading route */}
                            {loadingRoute && (
                                <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'3rem 0'}}>
                                    <CircleNotch weight="bold" className="pulse text-primary" style={{fontSize: '2rem', animation: 'spin 1s linear infinite'}} />
                                    <h3 className="font-bold">Calculating route...</h3>
                                </div>
                            )}

                            {/* Step 3: Route display */}
                            {routeData && !selectingMode && !loadingRoute && (
                                <div>
                                    <div className="route-header">
                                        <button className="icon-btn mb-2" onClick={() => { setRouteData(null); setSelectedParking(null); setSelectingMode(false); }}><CaretLeft weight="bold" /></button>
                                        <h3 className="text-center font-bold text-xl">{routeData.totalTime} total trip</h3>
                                        <p className="text-center text-muted text-sm mb-4">Route Details</p>
                                    </div>
                                    <div className="route-timeline">
                                        {routeData.timeline && routeData.timeline.map((leg, i) => (
                                            <div className="timeline-item" key={i}>
                                                <div className="time">{leg.time}</div>
                                                <div className="node-col">
                                                    <div className="step-icon">
                                                        {renderIcon(leg.mode)}
                                                        {leg.durationMin > 0 && <span className={`duration-badge ${leg.mode}`}>{leg.durationMin} min</span>}
                                                    </div>
                                                    {i !== routeData.timeline.length - 1 && <div className={`line ${leg.mode}-line`}></div>}
                                                </div>
                                                <div className="details">
                                                    <div className="title font-bold">
                                                        {leg.name === 'Current Location' ? startLocation : leg.name}
                                                    </div>
                                                    <div className="subtitle text-sm text-muted">{leg.details}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {parkingType === 'dauer' && <button className="btn btn-outline w-100 mt-6 mb-2" onClick={() => handleEmailReservation(routeData.parkingName)}>Request Reservation</button>}
                                    <button className="btn btn-primary btn-large w-100 mb-4 shadow-glow" onClick={handleStartNavigation}>Start Navigation</button>
                                </div>
                            )}

                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default Results;