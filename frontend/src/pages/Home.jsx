import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParking } from '../context/ParkingContext';
import { List, Car, CaretRight, House, Briefcase, Barbell, FirstAid, MagnifyingGlass, Microphone, X, MapPin, NavigationArrow, ChargingStation, DotsThreeVertical, Pencil } from '@phosphor-icons/react';
import L from 'leaflet';
import './Home.css';

const API_BASE = 'http://localhost:5000';

const Home = () => {
    const navigate = useNavigate();
    const { parkingType, locationEnabled } = useParking();
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const markerInstance = useRef(null);
    const tileLayerRef = useRef(null);
    const [locationStatus, setLocationStatus] = useState('');
    const [selectedParking, setSelectedParking] = useState(null);
    const [mapReady, setMapReady] = useState(false);
    const parkbautenLayerRef = useRef(null);
    const [sheetExpanded, setSheetExpanded] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [darkMode, setDarkMode] = useState(false);
    const [editingLocation, setEditingLocation] = useState(false);
    const isPickingLocationRef = useRef(false);
    const [startCoords, setStartCoords] = useState([48.7758, 9.1829]);
    const [destCoords, setDestCoords] = useState(null);
    const [destStatus, setDestStatus] = useState('');
    const destMarkerRef = useRef(null);
    const [customLocation, setCustomLocation] = useState('');
    const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
    const [profileModalOpen, setProfileModalOpen] = useState(false);

    const handleSelectParking = (lot) => {
        setSelectedParking(lot);
        setSheetExpanded(true);
        mapInstance.current?.setView(lot.coordinates, 15, { animate: true });
    };

    const handleLocationSubmit = async () => {
        setEditingLocation(false);
        if (!customLocation) return;

        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(customLocation)}`);
            const data = await res.json();
            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                mapInstance.current?.setView([lat, lon], 14, { animate: true });
                markerInstance.current?.setLatLng([lat, lon]);
                setLocationStatus(data[0].display_name.split(',')[0]);
            } else {
                alert("Location not found");
            }
        } catch (e) {
            console.error('Failed to geocode location:', e);
        }
    };

    useEffect(() => {
        if (!mapRef.current || mapInstance.current) return;

        const initMap = (centerLatLng, zoom) => {
            if (mapInstance.current || !mapRef.current) return;
            mapInstance.current = L.map(mapRef.current, { zoomControl: false }).setView(centerLatLng, zoom);
            tileLayerRef.current = L.tileLayer(
                document.body.classList.contains('dark-mode')
                    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
                { maxZoom: 19 }
            ).addTo(mapInstance.current);

            // Force size recalculation after mount
            setTimeout(() => mapInstance.current?.invalidateSize(), 200);

            const myIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background:#3b82f6;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px rgba(0,0,0,0.3);"></div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });
            markerInstance.current = L.marker(centerLatLng, { icon: myIcon }).addTo(mapInstance.current);

            const destIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background:#f43f5e;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:10px;color:white;font-weight:bold;">D</div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });
            destMarkerRef.current = L.marker([0, 0], { icon: destIcon }).addTo(mapInstance.current);
            destMarkerRef.current.setOpacity(0);

            mapInstance.current.on('click', async (e) => {
                const { lat, lng } = e.latlng;

                if (isPickingLocationRef.current) {
                    setStartCoords([lat, lng]);
                    markerInstance.current?.setLatLng([lat, lng]);
                    mapInstance.current?.setView([lat, lng], 14, { animate: true });
                    setEditingLocation(false);
                    isPickingLocationRef.current = false;
                    setLocationStatus('Loading location...');
                    try {
                        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
                        const data = await res.json();
                        if (data && data.display_name) {
                            const name = data.address?.road || data.address?.city || data.address?.town || data.display_name.split(',')[0];
                            setLocationStatus(name);
                        } else {
                            setLocationStatus('Custom Location');
                        }
                    } catch { setLocationStatus('Custom Location'); }
                } else {
                    destMarkerRef.current?.setLatLng([lat, lng]);
                    destMarkerRef.current?.setOpacity(1);
                    setDestCoords([lat, lng]);
                    setDestStatus('Loading...');
                    try {
                        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
                        const data = await res.json();
                        if (data && data.display_name) {
                            const name = data.address?.road || data.address?.city || data.address?.town || data.display_name.split(',')[0];
                            setDestStatus(name);
                        } else {
                            setDestStatus('Selected location');
                        }
                    } catch { setDestStatus('Selected location'); }
                }
            });

            setMapReady(true);
        }

        const stuttgartCenter = [48.7758, 9.1829];

        if (locationEnabled && "geolocation" in navigator) {
            setLocationStatus('Locating...');
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const ll = [pos.coords.latitude, pos.coords.longitude];
                    initMap(ll, 14);
                    setLocationStatus('');
                    setStartCoords(ll);
                },
                () => {
                    initMap(stuttgartCenter, 13);
                    setLocationStatus('Location access denied');
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            initMap(stuttgartCenter, 13);
        }

        return () => {
            mapInstance.current?.remove();
            mapInstance.current = null;
        };
    }, []);

    // Fetch additional map layers (CKAN data)
    useEffect(() => {
        if (!mapReady || !mapInstance.current) return;

        fetch(`${API_BASE}/api/parkbauten`)
            .then(res => res.json())
            .then(data => {
                if (parkbautenLayerRef.current) parkbautenLayerRef.current.remove();
                parkbautenLayerRef.current = L.geoJSON(data, {
                    style: { color: '#1d4ed8', weight: 2 },
                    pointToLayer: (feature, latlng) => L.circleMarker(latlng, { radius: 5, color: '#1d4ed8', fillColor: '#1d4ed8', fillOpacity: 0.8 })
                }).addTo(mapInstance.current);
            })
            .catch(err => console.error("Error loading parking layer:", err));

    }, [mapReady]);

// Update map tiles when dark mode changes
useEffect(() => {
    if (tileLayerRef.current) {
        const url = darkMode
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
        tileLayerRef.current.setUrl(url);
    }
}, [darkMode]);

const touchStartY = useRef(0);
const handleTouchStart = (e) => { touchStartY.current = e.touches ? e.touches[0].clientY : e.clientY; };
const handleTouchMove = (e) => {
    if (!sheetExpanded) return;
    const currentY = e.touches ? e.touches[0].clientY : e.clientY;
    if (currentY - touchStartY.current > 40) {
        setSheetExpanded(false);
        setTimeout(() => setSelectedParking(null), 300);
    }
};

return (
    <div className="view">
        <div ref={mapRef} className="background-map" />
        <div className="map-overlay" />

        <div className="top-nav glass-panel">
            <div style={{ position: 'relative' }}>
                <button className="icon-btn" onClick={() => setSettingsOpen(!settingsOpen)}>
                    <DotsThreeVertical weight="bold" size={24} />
                </button>
                {settingsOpen && (
                    <div className="settings-dropdown" style={{ position: 'absolute', top: '100%', left: 0, background: 'var(--surface)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', padding: '0.5rem', zIndex: 100, minWidth: '200px' }}>
                        <div className="dropdown-item" onClick={() => {
                            const newDark = !darkMode;
                            setDarkMode(newDark);
                            if (newDark) document.body.classList.add('dark-mode');
                            else document.body.classList.remove('dark-mode');
                            setSettingsOpen(false);
                        }}>
                            {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
                        </div>
                        <div className="dropdown-item" onClick={() => { setPrivacyModalOpen(true); setSettingsOpen(false); }}>
                            🔒 Privacy Settings
                        </div>
                        <div className="dropdown-item" onClick={() => { setProfileModalOpen(true); setSettingsOpen(false); }}>
                            👤 User Profile Options
                        </div>

                    </div>
                )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    {parkingType === 'kurz' ? 'Short-term' : 'Permanent'}
                </div>
                {editingLocation ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--primary)', color: 'white', padding: '0.4rem 1rem', borderRadius: '2rem', fontSize: '0.875rem', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(244, 63, 94, 0.3)' }}>
                        Tap anywhere on map
                        <button onClick={() => { setEditingLocation(false); isPickingLocationRef.current = false; }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', cursor: 'pointer', marginLeft: '0.5rem', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X weight="bold" /></button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>
                            {locationStatus || 'Stuttgart'}
                        </div>
                        <button
                            onClick={() => { setEditingLocation(true); isPickingLocationRef.current = true; }}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--surface)', border: '1px solid var(--border-color)', color: 'var(--primary)', padding: '0.3rem 0.75rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}
                        >
                            <Pencil weight="bold" /> Change My Location
                        </button>
                    </div>
                )}
            </div>
            <div style={{ width: '40px' }}></div>
        </div>

        <div className="top-park-btn-container" style={{ position: 'absolute', top: '5rem', right: '1rem', zIndex: 20 }}>
            <button className="btn btn-primary shadow-glow" onClick={() => navigate('/search', { state: { currentLocation: locationStatus || 'Stuttgart', startCoords, destination: destStatus || undefined, destCoords: destCoords || undefined } })} style={{ padding: '0.6rem 1.2rem', borderRadius: '1.5rem 1.5rem 1.5rem 0', display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.875rem', fontWeight: '600' }}>
                <span>Park & Ride</span>
                <CaretRight weight="bold" />
            </button>
            {destCoords && (
                <div style={{ fontSize: '0.65rem', color: 'var(--primary)', marginTop: '0.25rem', textAlign: 'right', fontWeight: 500, background: 'rgba(244,63,94,0.1)', borderRadius: '0.5rem', padding: '0.2rem 0.5rem' }}>
                    → {destStatus || 'Selected'}
                </div>
            )}
        </div>

        {/* Parking Detail Bottom Sheet */}
        {selectedParking && (
            <div className={`parking-sheet-overlay ${sheetExpanded ? 'visible' : ''}`} onClick={() => setSheetExpanded(false)}>
                <div className={`parking-sheet ${sheetExpanded ? 'expanded' : ''}`} onClick={e => e.stopPropagation()}>
                    <div
                        className="parking-sheet-handle"
                        onClick={() => setSheetExpanded(false)}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onMouseDown={handleTouchStart}
                        onMouseMove={(e) => { if (e.buttons === 1) handleTouchMove(e); }}
                        style={{ cursor: 'grab', padding: '12px 0', width: '100%', display: 'flex', justifyContent: 'center' }}
                    >
                        <div className="sheet-handle-bar" style={{ background: '#94a3b8', width: '48px', height: '5px', borderRadius: '4px' }}></div>
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
<button className="btn btn-primary w-100 mt-2" onClick={() => navigate('/search', { state: { selectedParking, currentLocation: locationStatus || 'Stuttgart', startCoords, destination: destStatus || undefined, destCoords: destCoords || undefined } })}>
    <NavigationArrow weight="bold" className="mr-2" /> Route from here
</button>
                    </div>
                </div>
            </div>
        )}

        <div className="bottom-controls">
            <div className="search-container" onClick={() => navigate('/search', { state: { currentLocation: locationStatus || 'Stuttgart', startCoords, destination: destStatus || undefined, destCoords: destCoords || undefined } })}>
                <MagnifyingGlass weight="bold" className="search-icon" />
                <div className="search-text">{destStatus ? destStatus : 'Click map to set destination'}</div>
                <button className="mic-btn" onClick={(e) => {
                    e.stopPropagation();
                    setDestCoords(null);
                    setDestStatus('');
                    destMarkerRef.current?.setOpacity(0);
                }}>
                    {destCoords ? <X weight="bold" /> : <MapPin weight="bold" />}
                </button>
            </div>
        </div>

        {/* Privacy Modal */}
        {privacyModalOpen && (
            <div className="parking-sheet-overlay visible" onClick={() => setPrivacyModalOpen(false)}>
                <div className="parking-sheet expanded" onClick={e => e.stopPropagation()} style={{ padding: '2rem', height: 'auto', bottom: 0 }}>
                    <h3 style={{ marginBottom: '0.5rem' }}>Privacy Settings</h3>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>Manage your data permissions and tracking preferences.</p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0', borderBottom: '1px solid var(--border-color)' }}>
                        <div>
                            <h4 style={{ margin: '0 0 0.25rem 0' }}>Location Access</h4>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Required for routing and nearby parking</span>
                        </div>
                        <input type="checkbox" checked={locationEnabled} readOnly style={{ transform: 'scale(1.2)' }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0', borderBottom: '1px solid var(--border-color)' }}>
                        <div>
                            <h4 style={{ margin: '0 0 0.25rem 0' }}>Analytics & Usage</h4>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Help us improve the ParkIQ experience</span>
                        </div>
                        <input type="checkbox" defaultChecked style={{ transform: 'scale(1.2)' }} />
                    </div>

                    <button className="btn btn-primary w-100" style={{ marginTop: '2rem' }} onClick={() => setPrivacyModalOpen(false)}>Save Preferences</button>
                </div>
            </div>
        )}

        {/* Profile Modal */}
        {profileModalOpen && (
            <div className="parking-sheet-overlay visible" onClick={() => setProfileModalOpen(false)}>
                <div className="parking-sheet expanded" onClick={e => e.stopPropagation()} style={{ padding: '2rem', height: 'auto', bottom: 0 }}>
                    <h3 style={{ marginBottom: '0.5rem' }}>User Category</h3>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>Select your profile type to apply relevant discounts and rules.</p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <button className={`btn ${parkingType === 'kurz' ? 'btn-primary' : 'btn-outline'} w-100`} onClick={() => { setProfileModalOpen(false); navigate('/selection'); }}>
                            Regular Customer
                        </button>
                        <button className={`btn btn-outline w-100`} onClick={() => { setProfileModalOpen(false); navigate('/selection'); }}>
                            🎓 Student / University (Discounted)
                        </button>
                        <button className={`btn ${parkingType === 'dauer' ? 'btn-primary' : 'btn-outline'} w-100`} onClick={() => { setProfileModalOpen(false); navigate('/selection'); }}>
                            Permanent Parker
                        </button>
                    </div>
                    <button className="btn btn-text w-100" style={{ marginTop: '1rem' }} onClick={() => setProfileModalOpen(false)}>Cancel</button>
                </div>
            </div>
        )}



    </div>
);
};

export default Home;
