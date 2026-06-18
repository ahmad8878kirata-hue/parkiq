import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParking } from '../context/ParkingContext';
import { List, Car, CaretRight, House, Briefcase, Barbell, FirstAid, MagnifyingGlass, Microphone, X, MapPin, NavigationArrow, ChargingStation, DotsThreeVertical, Pencil, Bicycle } from '@phosphor-icons/react';
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
    const tileLayerRef = useRef(null);
    const [locationStatus, setLocationStatus] = useState('');
    const [parkingLots, setParkingLots] = useState([]);
    const [loadingParking, setLoadingParking] = useState(true);
    const [selectedParking, setSelectedParking] = useState(null);
    const [sheetExpanded, setSheetExpanded] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [dataSourcesOpen, setDataSourcesOpen] = useState(false);
    const [bikeDataOpen, setBikeDataOpen] = useState(false);
    const [darkMode, setDarkMode] = useState(false);
    const [editingLocation, setEditingLocation] = useState(false);
    const isPickingLocationRef = useRef(false);
    const [startCoords, setStartCoords] = useState([48.7758, 9.1829]);
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

    const updateParkingMarkers = useCallback(() => {
        if (!mapInstance.current) return;
        
        // Remove existing markers
        parkingMarkersRef.current.forEach(marker => marker.remove());
        parkingMarkersRef.current = [];

        parkingLots.forEach(lot => {
            const marker = L.marker(lot.coordinates, {
                icon: L.divIcon({
                    className: 'map-node parking-node public',
                    html: '<div style="font-weight:bold;background:#3b82f6;color:white;width:100%;height:100%;display:flex;align-items:center;justify-content:center;border-radius:50%;border:2px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3);">P</div>',
                    iconSize: [28, 28]
                })
            }).addTo(mapInstance.current);
            
            marker.on('click', () => handleSelectParking(lot));
            parkingMarkersRef.current.push(marker);
        });
    }, [parkingLots]);

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

            mapInstance.current.on('click', async (e) => {
                if (!isPickingLocationRef.current) return;
                const { lat, lng } = e.latlng;
                
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
                } catch (err) {
                    console.error('Reverse geocode failed:', err);
                    setLocationStatus('Custom Location');
                }
            });
        };

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

    // Update parking markers whenever data or map changes
    useEffect(() => {
        updateParkingMarkers();
    }, [updateParkingMarkers]);

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
                <div style={{position: 'relative'}}>
                    <button className="icon-btn" onClick={() => setSettingsOpen(!settingsOpen)}>
                        <DotsThreeVertical weight="bold" size={24} />
                    </button>
                    {settingsOpen && (
                        <div className="settings-dropdown" style={{position: 'absolute', top: '100%', left: 0, background: 'var(--surface)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', padding: '0.5rem', zIndex: 100, minWidth: '200px'}}>
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
                            <div className="dropdown-item" onClick={() => { setDataSourcesOpen(true); setSettingsOpen(false); }}>
                                📊 Data Sources & Coverage
                            </div>
                            <div className="dropdown-item" onClick={() => { setBikeDataOpen(true); setSettingsOpen(false); }}>
                                🚲 Bicycle Parking Data
                            </div>
                        </div>
                    )}
                </div>
                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                    <div style={{fontWeight: 700, color: 'var(--primary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px'}}>
                        {parkingType === 'kurz' ? 'Short-term' : 'Permanent'}
                    </div>
                    {editingLocation ? (
                        <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--primary)', color: 'white', padding: '0.4rem 1rem', borderRadius: '2rem', fontSize: '0.875rem', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(244, 63, 94, 0.3)'}}>
                            Tap anywhere on map
                            <button onClick={() => { setEditingLocation(false); isPickingLocationRef.current = false; }} style={{background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', cursor: 'pointer', marginLeft: '0.5rem', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><X weight="bold" /></button>
                        </div>
                    ) : (
                        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem'}}>
                            <div style={{fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem'}}>
                                {locationStatus || 'Stuttgart'}
                            </div>
                            <button 
                                onClick={() => { setEditingLocation(true); isPickingLocationRef.current = true; }}
                                style={{display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--surface)', border: '1px solid var(--border-color)', color: 'var(--primary)', padding: '0.3rem 0.75rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', boxShadow: 'var(--shadow-sm)'}}
                            >
                                <Pencil weight="bold" /> Change My Location
                            </button>
                        </div>
                    )}
                </div>
                <div style={{width: '40px'}}></div>
            </div>

            <div className="top-park-btn-container" style={{position: 'absolute', top: '5rem', right: '1rem', zIndex: 20}}>
                <button className="btn btn-primary shadow-glow" onClick={() => navigate('/search', { state: { currentLocation: locationStatus || 'Stuttgart', startCoords } })} style={{padding: '0.6rem 1.2rem', borderRadius: '1.5rem 1.5rem 1.5rem 0', display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.875rem', fontWeight: '600'}}>
                    <span>Park & Ride</span>
                    <CaretRight weight="bold" />
                </button>
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
                            <button className="btn btn-primary w-100 mt-2" onClick={() => navigate('/search', { state: { selectedParking, currentLocation: locationStatus || 'Stuttgart', startCoords } })}>
                                <NavigationArrow weight="bold" className="mr-2" /> Route from here
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            <div className="bottom-controls">
                <div className="search-container" onClick={() => navigate('/search', { state: { currentLocation: locationStatus || 'Stuttgart', startCoords } })}>
                    <MagnifyingGlass weight="bold" className="search-icon" />
                    <div className="search-text">Where are you going?</div>
                    <button className="mic-btn" onClick={(e) => { 
                        e.stopPropagation(); 
                        setEditingLocation(true); 
                        isPickingLocationRef.current = true; 
                    }}>
                        <MapPin weight="bold" />
                    </button>
                </div>
            </div>

            {/* Privacy Modal */}
            {privacyModalOpen && (
                <div className="parking-sheet-overlay visible" onClick={() => setPrivacyModalOpen(false)}>
                    <div className="parking-sheet expanded" onClick={e => e.stopPropagation()} style={{padding: '2rem', height: 'auto', bottom: 0}}>
                        <h3 style={{marginBottom: '0.5rem'}}>Privacy Settings</h3>
                        <p style={{color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.875rem'}}>Manage your data permissions and tracking preferences.</p>
                        
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0', borderBottom: '1px solid var(--border-color)'}}>
                            <div>
                                <h4 style={{margin: '0 0 0.25rem 0'}}>Location Access</h4>
                                <span style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>Required for routing and nearby parking</span>
                            </div>
                            <input type="checkbox" checked={locationEnabled} readOnly style={{transform: 'scale(1.2)'}} />
                        </div>
                        
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0', borderBottom: '1px solid var(--border-color)'}}>
                            <div>
                                <h4 style={{margin: '0 0 0.25rem 0'}}>Analytics & Usage</h4>
                                <span style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>Help us improve the ParkIQ experience</span>
                            </div>
                            <input type="checkbox" defaultChecked style={{transform: 'scale(1.2)'}} />
                        </div>

                        <button className="btn btn-primary w-100" style={{marginTop: '2rem'}} onClick={() => setPrivacyModalOpen(false)}>Save Preferences</button>
                    </div>
                </div>
            )}

            {/* Profile Modal */}
            {profileModalOpen && (
                <div className="parking-sheet-overlay visible" onClick={() => setProfileModalOpen(false)}>
                    <div className="parking-sheet expanded" onClick={e => e.stopPropagation()} style={{padding: '2rem', height: 'auto', bottom: 0}}>
                        <h3 style={{marginBottom: '0.5rem'}}>User Category</h3>
                        <p style={{color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.875rem'}}>Select your profile type to apply relevant discounts and rules.</p>
                        
                        <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
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
                        <button className="btn btn-text w-100" style={{marginTop: '1rem'}} onClick={() => setProfileModalOpen(false)}>Cancel</button>
                    </div>
                </div>
            )}

            {/* Data Sources Modal */}
            {dataSourcesOpen && (
                <div className="parking-sheet-overlay visible" onClick={() => setDataSourcesOpen(false)} style={{zIndex: 100, background: 'rgba(0,0,0,0.5)'}}>
                    <div className="parking-sheet expanded" onClick={e => e.stopPropagation()} style={{padding: '2rem', height: '85vh', bottom: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                            <h3 style={{margin: 0}}>Data Sources & Coverage</h3>
                            <button className="icon-btn sheet-close" onClick={() => setDataSourcesOpen(false)}><X weight="bold" /></button>
                        </div>
                        
                        <div style={{color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: '1.5'}}>
                            <p style={{marginBottom: '0.5rem', color: 'var(--text-main)'}}><strong>Gebündelte Daten Parkplätze und Parkbauten Baden-Württemberg</strong></p>
                            <p style={{marginBottom: '0.5rem'}}>Dieses Datenprofil bündelt Daten zu Standorten und Echtzeit-Belegungsdaten von Parkplätzen in Baden-Württemberg. Dazu zählen Parkhäuser, Tiefgaragen, P+R-Anlagen sowie öffentliche Parkplätze.</p>
                            <p>Für Kommunen und Infrastrukturbetreiber gelten die Datenbereitstellungspflichten der Delegierten Verordnung (EU) 2024/490.</p>
                        </div>

                        <h4 style={{marginBottom: '0.75rem'}}>Aktuell enthaltene Anbieter</h4>
                        <div style={{overflowX: 'auto', marginBottom: '1.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)'}}>
                            <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left'}}>
                                <thead>
                                    <tr style={{background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)'}}>
                                        <th style={{padding: '0.75rem', fontWeight: '600', color: 'var(--text-main)', whiteSpace: 'nowrap'}}>Datengeber</th>
                                        <th style={{padding: '0.75rem', fontWeight: '600', color: 'var(--text-main)'}}>Dynamisch</th>
                                        <th style={{padding: '0.75rem', fontWeight: '600', color: 'var(--text-main)'}}>Zusätzliche Infos</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        ['Stadt Heidelberg', 'ja', 'inkl. Sonderparkplätze, Behindertenparkplätze'],
                                        ['Stadt Freiburg im Breisgau', 'ja', 'inkl. Sonderparkplätze, Behindertenparkplätze'],
                                        ['Stadt Mannheim', 'ja', 'inkl. Behindertenparkplätze'],
                                        ['Stadt Ulm', 'ja', 'inkl. Sonderparkplätze, Behindertenparkplätze'],
                                        ['Stadt Neckarsulm', 'nein', 'inkl. Sonderparkplätze, Behindertenparkplätze'],
                                        ['Stadt Reutlingen', 'nein', 'inkl. Behindertenparkplätze'],
                                        ['Stadt Pforzheim', 'nein', 'inkl. Sonderparkplätze'],
                                        ['Stadt Karlsruhe', 'ja', 'inkl. Behindertenparkplätze'],
                                        ['Stadt Herrenberg', 'ja', 'inkl. Behindertenparkplätze'],
                                        ['Stadt Konstanz', 'ja', 'inkl. Sonderparkplätze, Behindertenparkplätze'],
                                        ['Stadt Buchen', 'ja', 'inkl. Behindertenparkplätze'],
                                        ['Stadt Ellwangen', 'nein', 'inkl. Sonderparkplätze, Behindertenparkplätze'],
                                        ['Stadt Esslingen', 'nein', 'inkl. Sonderparkplätze, Behindertenparkplätze'],
                                        ['Gemeinde Keltern', 'nein', 'inkl. Sonderparkplätze'],
                                        ['Stadt Friedrichshafen', 'ja', 'Behindertenparkplätze'],
                                        ['Stadt Stuttgart', 'ja', 'inkl. Sonderparkplätze, Behindertenparkplätze'],
                                        ['Stadt Aalen', 'ja', 'inkl. Behindertenparkplätze'],
                                        ['Stadt Sachsenheim', 'nein', 'aus Park.Raum.Check'],
                                        ['Stadt Singen', 'nein', 'inkl. Sonderparkplätze, Behindertenparkplätze'],
                                        ['Stadtwerke Heilbronn', 'ja', '-'],
                                        ['Verkehrsverbund Rhein-Neckar', 'ja', '-'],
                                        ['DB BahnPark GmbH', 'nein', 'inkl. Sonderparkplätze'],
                                        ['PBW', 'ja', 'inkl. Sonderparkplätze'],
                                        ['APCOA Group', 'nein', 'Deutschlandweit, inkl. Sonderparkplätze'],
                                        ['GOLDBECK Parking Services', 'nein', '-'],
                                        ['PARK SERVICE HÜFNER', 'nein', 'inkl. Sonderparkplätze'],
                                        ['B+B Parkhaus', 'nein', 'inkl. Sonderparkplätze'],
                                        ['Sensade', 'ja', 'inkl. Sonderparkplätze'],
                                        ['Verband Region Stuttgart', 'nein', 'inkl. Sonderparkplätze'],
                                        ['Barrierefreie Reisekette', 'nein', 'inkl. Sonderparkplätze'],
                                        ['Parken und Mitfahren', 'nein', '-'],
                                        ['P+R-Anlagen (VRN)', 'ja', 'inkl. Sonderparkplätze'],
                                        ['P+R-Anlagen (opentransport)', 'nein', 'inkl. Sonderparkplätze']
                                    ].map((row, i) => (
                                        <tr key={i} style={{borderBottom: '1px solid var(--border-color)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg-color)'}}>
                                            <td style={{padding: '0.5rem 0.75rem', color: 'var(--text-main)', fontWeight: '500', whiteSpace: 'nowrap'}}>{row[0]}</td>
                                            <td style={{padding: '0.5rem 0.75rem'}}>
                                                <span style={{
                                                    background: row[1] === 'ja' ? 'rgba(34,197,94,0.1)' : 'rgba(244,63,94,0.1)',
                                                    color: row[1] === 'ja' ? 'var(--success)' : 'var(--primary)',
                                                    padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold'
                                                }}>{row[1]}</span>
                                            </td>
                                            <td style={{padding: '0.5rem 0.75rem', color: 'var(--text-muted)'}}>{row[2]}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <h4 style={{marginBottom: '0.5rem'}}>Open Data Access</h4>
                        <p style={{color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.5rem'}}>
                            Die Daten sind offen verfügbar und können über die ParkAPI (MobiData BW) genutzt werden. 
                            <br/><code style={{background: 'var(--bg-color)', padding: '2px 4px', borderRadius: '4px', wordBreak: 'break-all'}}>https://api.mobidata-bw.de/park-api/api/public/v3/parking-sites</code>
                        </p>
                    </div>
                </div>
            )}

            {/* Bike Data Sources Modal */}
            {bikeDataOpen && (
                <div className="parking-sheet-overlay visible" onClick={() => setBikeDataOpen(false)} style={{zIndex: 100, background: 'rgba(0,0,0,0.5)'}}>
                    <div className="parking-sheet expanded" onClick={e => e.stopPropagation()} style={{padding: '2rem', height: '85vh', bottom: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '0.6rem'}}>
                                <div style={{background: 'rgba(59,130,246,0.12)', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                    <Bicycle weight="fill" size={20} style={{color: 'var(--secondary)'}} />
                                </div>
                                <h3 style={{margin: 0}}>Bicycle Parking Data</h3>
                            </div>
                            <button className="icon-btn sheet-close" onClick={() => setBikeDataOpen(false)}><X weight="bold" /></button>
                        </div>

                        <div style={{color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: '1.5'}}>
                            <p style={{marginBottom: '0.5rem', color: 'var(--text-main)'}}><strong>Gebündelte Daten Fahrradabstellanlagen Baden-Württemberg</strong></p>
                            <p style={{marginBottom: '0.5rem'}}>Dieses Datenprofil bündelt Daten zu Standorten und, wenn vorhanden, Echtzeit-Belegungsdaten von Fahrradabstellanlagen in Baden-Württemberg.</p>
                            <p>Für Kommunen und Infrastrukturbetreiber gelten die Datenbereitstellungspflichten der Delegierten Verordnung (EU) 2024/490. Statische Daten sind bis zum 01.12.2024 und dynamische Daten bis zum 01.12.2026 bereitzustellen.</p>
                        </div>

                        <h4 style={{marginBottom: '0.75rem'}}>Aktuell enthaltene Anbieter</h4>
                        <div style={{overflowX: 'auto', marginBottom: '1.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)'}}>
                            <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left'}}>
                                <thead>
                                    <tr style={{background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)'}}>
                                        <th style={{padding: '0.75rem', fontWeight: '600', color: 'var(--text-main)', whiteSpace: 'nowrap'}}>Datengeber</th>
                                        <th style={{padding: '0.75rem', fontWeight: '600', color: 'var(--text-main)'}}>Dynamisch</th>
                                        <th style={{padding: '0.75rem', fontWeight: '600', color: 'var(--text-main)'}}>Zusätzliche Infos</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        ['Stadt Karlsruhe', 'nein', 'Fahrradabstellanlagen'],
                                        ['Stadt Konstanz', 'nein', 'Fahrradabstellanlagen'],
                                        ['Stadt Neckarsulm', 'nein', 'Fahrradbügeldaten'],
                                        ['Stadt Reutlingen', 'nein', 'Fahrradabstellanlagen'],
                                        ['Stadt Pforzheim', 'nein', 'Fahrradabstellanlagen'],
                                        ['Stadt Herrenberg', 'nein', 'Fahrradabstellanlagen'],
                                        ['VELOBRIX', 'nein', 'Fahrradabstellanlagen'],
                                        ['Firma Kienzler', 'ja', 'Fahrradgaragen'],
                                        ['RadVIS BW', 'nein', 'Fahrradabstellanlagen'],
                                        ['Barrierefreie Reisekette', 'nein', 'Fahrradabstellanlagen an ÖPNV- & SPNV-Haltestellen'],
                                        ['VRN-Gebiet', 'ja', 'Fahrradabstellanlagen']
                                    ].map((row, i) => (
                                        <tr key={i} style={{borderBottom: '1px solid var(--border-color)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg-color)'}}>
                                            <td style={{padding: '0.5rem 0.75rem', color: 'var(--text-main)', fontWeight: '500', whiteSpace: 'nowrap'}}>{row[0]}</td>
                                            <td style={{padding: '0.5rem 0.75rem'}}>
                                                <span style={{
                                                    background: row[1] === 'ja' ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.1)',
                                                    color: row[1] === 'ja' ? 'var(--success)' : 'var(--secondary)',
                                                    padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold'
                                                }}>{row[1]}</span>
                                            </td>
                                            <td style={{padding: '0.5rem 0.75rem', color: 'var(--text-muted)'}}>{row[2]}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div style={{background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', marginBottom: '1rem'}}>
                            <p style={{fontSize: '0.75rem', fontWeight: '700', color: 'var(--secondary)', marginBottom: '0.25rem'}}>💡 API Tip</p>
                            <p style={{fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0}}>Use <code style={{background: 'var(--bg-color)', padding: '1px 4px', borderRadius: '3px'}}>purpose=BIKE</code> to filter only bicycle parking spots.</p>
                        </div>

                        <h4 style={{marginBottom: '0.5rem'}}>Open Data Access</h4>
                        <p style={{color: 'var(--text-muted)', fontSize: '0.8rem'}}>
                            Die Daten sind offen verfügbar und können über die ParkAPI (MobiData BW) genutzt werden.
                            <br/><code style={{background: 'var(--bg-color)', padding: '2px 4px', borderRadius: '4px', wordBreak: 'break-all', display: 'block', marginTop: '0.4rem'}}>https://api.mobidata-bw.de/park-api/api/public/v3/parking-sites?purpose=BIKE</code>
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Home;
