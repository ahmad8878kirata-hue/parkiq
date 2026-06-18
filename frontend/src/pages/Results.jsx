import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useParking } from '../context/ParkingContext';
import { ArrowLeft, MapPin, Car, PersonSimpleWalk, Train, CircleNotch, CaretLeft, Envelope, WarningCircle } from '@phosphor-icons/react';
import SpecialOfferToast from '../components/SpecialOfferToast';
import L from 'leaflet';
import './Results.css';

const API_BASE = 'http://localhost:5000';

function detectTransitType(routeName) {
    if (!routeName) return 'train';
    const upper = routeName.toUpperCase();
    if (upper.startsWith('U') || upper.startsWith('S') || upper.startsWith('RB') || upper.startsWith('RE') || upper.startsWith('ICE') || upper.startsWith('IC')) return 'train';
    if (upper.startsWith('BUS') || upper.startsWith('N') || /^\d+$/.test(routeName)) return 'bus';
    return 'train';
}

const Results = () => {
    const navigate = useNavigate();
    const locationState = useLocation();
    const { parkingType, isRegistered } = useParking();
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const parkingMarkersRef = useRef([]);
    const routeLayersRef = useRef([]);
    
    const [isExpanded, setIsExpanded] = useState(true);
    const [showToast, setShowToast] = useState(false);
    
    const touchStartY = useRef(0);
    const handleTouchStart = (e) => { touchStartY.current = e.touches ? e.touches[0].clientY : e.clientY; };
    const handleTouchMove = (e) => {
        if (!isExpanded) return;
        const currentY = e.touches ? e.touches[0].clientY : e.clientY;
        if (currentY - touchStartY.current > 40) {
            setIsExpanded(false);
        }
    };
    
    const [routeOptions, setRouteOptions] = useState([]);
    const [selectedRoute, setSelectedRoute] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const destination = locationState.state?.destination || 'Stuttgart Zentrum';
    const startLocation = locationState.state?.startLocation || 'Your Location';
    const startCoords = locationState.state?.startCoords || [48.7758, 9.1829];
    const arrivalTime = locationState.state?.arrivalTime;
    const parkingId = locationState.state?.parkingId || null;

    // Fetch live routes from backend
    useEffect(() => {
        const fetchRoutes = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`${API_BASE}/api/routes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ destination, startCoords, arrivalTime, parkingId })
                });
                if (!res.ok) throw new Error(`API error: ${res.status}`);
                const json = await res.json();
                if (!json.success) throw new Error(json.message || 'Unknown error');

                const enriched = (json.data || []).map((opt, index) => ({
                    ...opt,
                    category: 'Public',
                    transitType: detectTransitType(opt.transitRoute),
                    hasSpecialRate: index === 0 && isRegistered
                }));
                setRouteOptions(enriched);
                if (isRegistered && enriched.some(o => o.hasSpecialRate)) {
                    setTimeout(() => setShowToast(true), 1000);
                }
            } catch (err) {
                console.error('Failed to fetch routes:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchRoutes();
    }, [destination, startCoords, arrivalTime, parkingId, isRegistered]);

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

        routeOptions.forEach(opt => {
            const marker = L.marker([opt.lat, opt.lng], { 
                icon: L.divIcon({ 
                    className: `map-node parking-node public`, 
                    html: '<div style="font-weight:bold;">P</div>', 
                    iconSize: [30, 30] 
                }) 
            }).addTo(mapInstance.current);
            marker.on('click', () => setSelectedRoute(opt));
            parkingMarkersRef.current.push(marker);
        });
    }, [loading, routeOptions]);

    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !selectedRoute) return;

        routeLayersRef.current.forEach(layer => layer.remove());
        routeLayersRef.current = [];

        const layers = [];
        const bounds = L.latLngBounds([]);

        if (selectedRoute.segments && selectedRoute.segments.length > 0) {
            selectedRoute.segments.filter(s => s.mode === 'driving').forEach((seg) => {
                seg.path.forEach(pt => bounds.extend(pt));

                const polyShadow = L.polyline(seg.path, {
                    color: 'white', weight: 10, opacity: 0.3,
                    lineCap: 'round', lineJoin: 'round'
                }).addTo(map);
                layers.push(polyShadow);

                const poly = L.polyline(seg.path, {
                    color: '#1e293b', weight: 6, opacity: 0.7,
                    lineCap: 'round', lineJoin: 'round'
                }).addTo(map);
                layers.push(poly);

                const startIcon = L.marker(seg.path[0], {
                    icon: L.divIcon({
                        className: 'custom-route-icon',
                        html: '<div class="route-icon-node driving">🚗</div>',
                        iconSize: [24, 24]
                    })
                }).addTo(map);
                layers.push(startIcon);

                const midIdx = Math.floor(seg.path.length / 2);
                const driveMin = seg.driveMinutes || 15;
                const labelMarker = L.marker(seg.path[midIdx], {
                    icon: L.divIcon({
                        className: 'route-label-node',
                        html: `<div class="label-inner">Drive • ${driveMin} min</div>`,
                        iconSize: [60, 22]
                    })
                }).addTo(map);
                layers.push(labelMarker);
            });
        }

        // Add parking marker
        const parkMarker = L.marker([selectedRoute.lat, selectedRoute.lng], {
            icon: L.divIcon({
                className: 'map-node parking-node',
                html: '<div style="font-weight:bold;">P</div>',
                iconSize: [30, 30]
            })
        }).addTo(map);
        layers.push(parkMarker);
        bounds.extend([selectedRoute.lat, selectedRoute.lng]);

        routeLayersRef.current = layers;
        map.fitBounds(bounds, { padding: [50, 100] });
        setIsExpanded(true);
    }, [selectedRoute]);

    const handleEmailReservation = (parkingName) => {
        const subject = `Reservation Request: ${parkingName}`;
        const body = `Hello Customer Service,\n\nI would like to make a reservation for ${parkingName} as a ${parkingType === 'dauer' ? 'Permanent' : 'Short-term'} parker.\n\nStatus: ${isRegistered ? 'Registered (Sondertarife active)' : 'Guest'}\n\nPlease confirm availability.`;
        window.location.href = `mailto:service@parkiq.example.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    };

    const handleStartNavigation = () => {
        window.open(`https://www.google.com/maps/dir/?api=1&origin=${startCoords[0]},${startCoords[1]}&destination=${encodeURIComponent(destination)}&travelmode=transit`, '_blank');
    };

    const renderIcon = (mode) => {
        if (mode === 'driving') return <Car weight="fill" />;
        if (mode === 'parking') return <span style={{fontWeight:'bold'}}>P</span>;
        if (mode === 'transit') return <Train weight="fill" />;
        if (mode === 'walking') return <div className="dot" style={{width: 8, height: 8, background: 'var(--text-muted)', borderRadius: '50%'}}></div>;
        if (mode === 'destination') return <MapPin weight="fill" />;
        return <PersonSimpleWalk weight="fill" />;
    };

    return (
        <div className="view">
            {showToast && <SpecialOfferToast message="Student/Employee discount applied! -20%" onClose={() => setShowToast(false)} />}

            {loading ? (
                <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', background:'var(--surface)'}}>
                    <CircleNotch weight="bold" className="pulse text-primary" style={{fontSize: '3rem', animation: 'spin 1s linear infinite'}} />
                    <h3 className="font-bold">Calculating Routes...</h3>
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
                            {!selectedRoute ? (
                                <div className="options-list">
                                    <h4 className="text-muted text-sm font-semibold mb-3">SMART PBW OPTIONS</h4>
                                    {routeOptions.map((opt, idx) => (
                                        <div key={`${opt.id}-${opt.variantLabel || idx}`} className={`option-card ${opt.hasSpecialRate ? 'special-card' : ''}`} onClick={() => setSelectedRoute(opt)}>
                                            <div className="flex-between mb-2">
                                                <div className="font-bold">{opt.parkingName}{opt.variantLabel && <span className="variant-tag">{opt.variantLabel}</span>}<span className={`category-tag ${opt.category.toLowerCase()}`}>{opt.category}</span></div>
                                                    <div className="price-container">
                                                        {opt.hasSpecialRate && <span className="old-price">€ {opt.totalCost}</span>}
                                                        <div className="font-bold text-primary">
                                                            € {opt.hasSpecialRate ? (parseFloat(opt.totalCost) * 0.8).toFixed(2) : opt.totalCost}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="option-details">
                                                    <div className="transit-signal">
                                                        <span className={`transit-badge ${opt.transitType}`}>
                                                            {opt.transitType === 'train' ? '🚆' : '🚌'} {opt.transitRoute}
                                                        </span>
                                                        <span className="walk-info">
                                                            <PersonSimpleWalk weight="bold" /> {opt.walkTimeToStation} min
                                                        </span>
                                                    </div>
                                                    <div className="flex-between text-sm text-muted">
                                                        <div>{opt.distanceToStation} to station • {opt.totalTime}</div>
                                                        <div>Save €{opt.savings}</div>
                                                    </div>
                                                </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div>
                                    <div className="route-header">
                                        <button className="icon-btn mb-2" onClick={() => setSelectedRoute(null)}><CaretLeft weight="bold" /></button>
                                        <h3 className="text-center font-bold text-xl">{selectedRoute.totalTime} total trip</h3>
                                        <p className="text-center text-muted text-sm mb-4">Route Details</p>
                                    </div>
                                    <div className="transit-info-card">
                                        <div className="transit-info-row">
                                            <div className="transit-info-item">
                                                <PersonSimpleWalk weight="bold" className="walk-icon" />
                                                <div>
                                                    <div className="info-label">Walk to station</div>
                                                    <div className="info-value">{selectedRoute.walkTimeToStation} min • {selectedRoute.distanceToStation}</div>
                                                </div>
                                            </div>
                                            <div className="transit-info-divider"></div>
                                            <div className="transit-info-item">
                                                <span className={`transit-badge large ${selectedRoute.transitType}`}>
                                                    {selectedRoute.transitType === 'train' ? '🚆' : '🚌'} {selectedRoute.transitRoute}
                                                </span>
                                                <div>
                                                    <div className="info-label">Transit line</div>
                                                    <div className="info-value">Direct connection</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="route-timeline">
                                        {selectedRoute.timeline.map((leg, i) => (
                                            <div className="timeline-item" key={i}>
                                                <div className="time">{leg.time}</div>
                                                <div className="node-col"><div className={`node ${leg.mode}`}>{renderIcon(leg.mode)}</div>{i !== selectedRoute.timeline.length - 1 && <div className="line"></div>}</div>
                                                <div className="details">
                                                    <div className="title font-bold">
                                                        {leg.name === 'Current Location' ? startLocation : 
                                                         leg.name === 'Station' ? 'Stuttgart Hauptbahnhof' : 
                                                         leg.name}
                                                    </div>
                                                    <div className="subtitle text-sm text-muted">{leg.details}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {parkingType === 'dauer' && <button className="btn btn-outline w-100 mt-6 mb-2" onClick={() => handleEmailReservation(selectedRoute.parkingName)}>Request Reservation</button>}
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
