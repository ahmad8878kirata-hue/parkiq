import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParking } from '../context/ParkingContext';
import { List, Car, CaretRight, House, Briefcase, Barbell, FirstAid, MagnifyingGlass, Microphone, X, MapPin, NavigationArrow, ChargingStation } from '@phosphor-icons/react';
import L from 'leaflet';
import './Home.css';

const API_BASE = 'http://localhost:5000';

const Home = () => {
    const navigate = useNavigate();
    const { parkingType, locationEnabled } = useParking();
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const markerInstance = useRef(null);
    const parkingMarkersRef = useRef([]);
    const [locationStatus, setLocationStatus] = useState('');
    const [parkingLots, setParkingLots] = useState([]);
    const [loadingParking, setLoadingParking] = useState(true);
    const [selectedParking, setSelectedParking] = useState(null);
    const [sheetExpanded, setSheetExpanded] = useState(false);

    const handleSelectParking = (lot) => {
        setSelectedParking(lot);
        setSheetExpanded(true);
        mapInstance.current?.setView(lot.coordinates, 15, { animate: true });
    };

    const updateParkingMarkers = useCallback(() => {
        const map = mapInstance.current;
        if (!map || loadingParking) return;

        parkingMarkersRef.current.forEach(m => m.remove());
        parkingMarkersRef.current = [];

        parkingLots.forEach(lot => {
            const statusColor = '#22c55e';
            const marker = L.marker(lot.coordinates, {
                icon: L.divIcon({
                    className: 'parking-div-icon',
                    html: `
                        <div class="parking-marker">
                            <div class="marker-dot" style="background:${statusColor}"></div>
                            <div class="marker-pulse" style="background:${statusColor}"></div>
                            <span class="marker-text">P</span>
                        </div>
                    `,
                    iconSize: [36, 36],
                    iconAnchor: [18, 18]
                })
            }).addTo(map);

            marker.on('click', () => handleSelectParking(lot));
            parkingMarkersRef.current.push(marker);
        });
    }, [parkingLots, loadingParking]);

    // Fetch live parking data
    useEffect(() => {
        const fetchParking = () => {
            fetch(`${API_BASE}/api/parking/stuttgart`)
                .then(res => res.json())
                .then(data => {
                    if (data.sites) setParkingLots(data.sites);
                    setLoadingParking(false);
                })
                .catch(err => {
                    console.error('Failed to fetch parking data:', err);
                    setLoadingParking(false);
                });
        };
        fetchParking();
        const interval = setInterval(fetchParking, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    // Init map once + re-fit when parking markers are added
    useEffect(() => {
        if (!mapRef.current || mapInstance.current) return;

        const stuttgartCenter = [48.7758, 9.1829];
        mapInstance.current = L.map(mapRef.current, { zoomControl: false }).setView(stuttgartCenter, 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 19
        }).addTo(mapInstance.current);

        // Force size recalculation after mount
        setTimeout(() => mapInstance.current?.invalidateSize(), 200);

        const myIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="background:#3b82f6;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px rgba(0,0,0,0.3);"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
        markerInstance.current = L.marker(stuttgartCenter, { icon: myIcon }).addTo(mapInstance.current);

        if (locationEnabled && "geolocation" in navigator) {
            setLocationStatus('Locating...');
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const ll = [pos.coords.latitude, pos.coords.longitude];
                    mapInstance.current?.setView(ll, 14);
                    markerInstance.current?.setLatLng(ll);
                    setLocationStatus('');
                },
                () => setLocationStatus('Location access denied'),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        }

        return () => {
            mapInstance.current?.remove();
            mapInstance.current = null;
        };
    }, []);

    // Update parking markers whenever data or map changes
    useEffect(() => {
        updateParkingMarkers();
    }, [updateParkingMarkers]);

    return (
        <div className="view">
            <div ref={mapRef} className="background-map" />
            <div className="map-overlay" />
            
            <div className="top-nav glass-panel">
                <button className="icon-btn" onClick={() => navigate('/selection')}><List weight="bold" /></button>
                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                    <div style={{fontWeight: 700, color: 'var(--primary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px'}}>
                        {parkingType === 'kurz' ? 'Short-term' : 'Permanent'}
                    </div>
                    <div style={{fontWeight: 600, color: 'var(--text-main)', fontSize: '0.875rem'}}>{locationStatus || 'Stuttgart'}</div>
                </div>
                <div style={{width: '40px'}}></div>
            </div>

            {/* Live Parking Mini Dashboard */}
            <div className="parking-dashboard">
                <div className="dashboard-header">
                    <Car weight="fill" className="dashboard-icon" />
                    <span>PBW Parking Stuttgart</span>
                    {loadingParking && <span className="loading-dots">Loading...</span>}
                    {!loadingParking && <span className="loading-dots" style={{color:'var(--text-light)'}}>{parkingLots.length} lots</span>}
                </div>
                <div className="dashboard-list">
                    {parkingLots.slice(0, 3).map(lot => (
                        <div key={lot.id} className="dashboard-item" onClick={() => handleSelectParking(lot)} style={{cursor:'pointer'}}>
                            <div className="d-status"></div>
                            <div className="d-name">{lot.name}</div>
                            <div className="d-count">{lot.totalCapacity} spots</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Parking Detail Bottom Sheet */}
            {selectedParking && (
                <div className={`parking-sheet-overlay ${sheetExpanded ? 'visible' : ''}`} onClick={() => setSheetExpanded(false)}>
                    <div className={`parking-sheet ${sheetExpanded ? 'expanded' : ''}`} onClick={e => e.stopPropagation()}>
                        <div className="parking-sheet-handle" onClick={() => setSheetExpanded(false)}>
                            <div className="sheet-handle-bar"></div>
                        </div>
                        <div className="parking-sheet-content">
                            <div className="parking-sheet-header">
                                <h3 className="parking-sheet-title">{selectedParking.name}</h3>
                                <button className="icon-btn sheet-close" onClick={() => { setSelectedParking(null); setSheetExpanded(false); }}><X weight="bold" /></button>
                            </div>
                            {selectedParking.address && <div className="parking-sheet-address">{selectedParking.address}</div>}
                            <div className="parking-sheet-stats">
                                <div className="ps-stat">
                                    <Car weight="fill" className="ps-stat-icon" />
                                    <div className="ps-stat-label">Capacity</div>
                                    <div className="ps-stat-value">{selectedParking.totalCapacity}</div>
                                </div>
                                <div className="ps-stat">
                                    <MapPin weight="fill" className="ps-stat-icon" />
                                    <div className="ps-stat-label">Location</div>
                                    <div className="ps-stat-value">{selectedParking.coordinates[0].toFixed(3)}, {selectedParking.coordinates[1].toFixed(3)}</div>
                                </div>
                                {selectedParking.amenities?.evCharging && (
                                    <div className="ps-stat">
                                        <ChargingStation weight="fill" className="ps-stat-icon" />
                                        <div className="ps-stat-label">EV Charging</div>
                                        <div className="ps-stat-value">Available</div>
                                    </div>
                                )}
                            </div>
                            <button className="btn btn-primary w-100 mt-2" onClick={() => navigate('/search', { state: { selectedParking } })}>
                                <NavigationArrow weight="bold" className="mr-2" /> Route from here
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            <div className="bottom-controls">
                <button className="btn btn-primary btn-large w-100 shadow-glow mb-4" onClick={() => navigate('/search')}>
                    <span className="flex-align-center"><Car weight="bold" className="mr-2" /> Park & Ride</span>
                    <CaretRight weight="bold" />
                </button>
                
                <div className="shortcuts">
                    <button className="shortcut-btn"><House weight="fill" className="text-blue" /> Home</button>
                    <button className="shortcut-btn"><Briefcase weight="fill" className="text-blue" /> Office</button>
                    <button className="shortcut-btn"><Barbell weight="fill" className="text-blue" /> Fitness</button>
                    <button className="shortcut-btn"><FirstAid weight="fill" className="text-blue" /> Hospital</button>
                </div>
                
                <div className="search-container" onClick={() => navigate('/search')}>
                    <MagnifyingGlass weight="bold" className="search-icon" />
                    <div className="search-text">Where are you going?</div>
                    <button className="mic-btn"><Microphone weight="bold" /></button>
                    <div className="date-badge">Date</div>
                </div>
            </div>
        </div>
    );
};

export default Home;
