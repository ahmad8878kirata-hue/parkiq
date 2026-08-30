import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParking } from '../context/ParkingContext';
import { Car, CaretRight, MagnifyingGlass, X, MapPin, NavigationArrow, ChargingStation, DotsThreeVertical, Pencil, Ticket, WarningCircle } from '@phosphor-icons/react';
import L from 'leaflet';
import './Home.css';
import './Search.css';
import './Selection.css';
import RouteSearchForm from '../components/RouteSearchForm';
import { resolveCoords, buildDepartureISO } from '../services/geocodingService';
import { createBaseTileLayer, handleMapTileErrors, setMapDarkMode } from '../services/mapTiles';
import { API_BASE } from '../config';

const Home = () => {
    const navigate = useNavigate();
    const { parkingType, locationEnabled, hasJobTicket, setHasJobTicket, hasDauerparkticket, setHasDauerparkticket, dauerparkticketStation, setDauerparkticketStation, setDauerparkticketStationCoords, analyticsEnabled, setAnalyticsEnabled } = useParking();
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const markerInstance = useRef(null);
    const tileLayerRef = useRef(null);
    const [locationStatus, setLocationStatus] = useState('');
    const [selectedParking, setSelectedParking] = useState(null);
    const [mapReady, setMapReady] = useState(false);
    const parkbautenLayerRef = useRef(null);
    const parkingMarkersLayerRef = useRef(null);
    const [sheetExpanded, setSheetExpanded] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [darkMode, setDarkMode] = useState(false);
    const [editingLocation, setEditingLocation] = useState(false);
    const isPickingLocationRef = useRef(false);
    const [startCoords, setStartCoords] = useState([48.7758, 9.1829]);
    const [destCoords, setDestCoords] = useState(null);
    const [destStatus, setDestStatus] = useState('');
    const destMarkerRef = useRef(null);
    const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
    const [profileModalOpen, setProfileModalOpen] = useState(false);
    const [showSearchSheet, setShowSearchSheet] = useState(false);
    const [loadingLocation, setLoadingLocation] = useState(false);
    const [stationInput, setStationInput] = useState('');
    const [tileOffline, setTileOffline] = useState(false);

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

    const handleSearchSubmit = async (form) => {
        setLoadingLocation(true);
        form.setDestError('');
        try {
            const result = await resolveCoords({
                startLocation: form.startLocation,
                startCoords: form.startCoords,
                startFromAutocomplete: form.startFromAutocomplete,
                destination: form.destination,
                destCoords: form.destCoords,
                destFromAutocomplete: form.destFromAutocomplete,
                currentLocationStatus: locationStatus,
            });

            if (!result.destCoords) {
                setLoadingLocation(false);
                form.setDestError('Ungültiger Ort. Bitte geben Sie einen gültigen Ort ein.');
                return;
            }

            const departureTime = buildDepartureISO(form.year, form.month, form.activeDay, form.time);
            setShowSearchSheet(false);
            navigate('/results', {
                state: {
                    destination: result.destName,
                    startLocation: result.startName,
                    startCoords: result.startCoords,
                    destCoords: result.destCoords,
                    departureTime,
                    transportMode: form.transportMode || 'train',
                    parkingId: selectedParking?.id
                }
            });
        } catch (e) {
            console.error("Geocoding failed:", e);
            setLoadingLocation(false);
        }
    };

    useEffect(() => {
        if (!mapRef.current || mapInstance.current) return;

        const initMap = (centerLatLng, zoom) => {
            if (mapInstance.current || !mapRef.current) return;
            mapInstance.current = L.map(mapRef.current, { zoomControl: false }).setView(centerLatLng, zoom);
            tileLayerRef.current = createBaseTileLayer().addTo(mapInstance.current);
            handleMapTileErrors(mapInstance.current, {
                onError: () => setTileOffline(true),
                onRecover: () => setTileOffline(false)
            });
            setMapDarkMode(mapInstance.current, document.body.classList.contains('dark-mode'));

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
                    setLocationStatus('Standort wird geladen...');
                    try {
                        const res = await fetch(`${API_BASE}/api/geocode/reverse?format=json&lat=${lat}&lon=${lng}`);
                        const data = await res.json();
                        if (data && data.display_name) {
                            const name = data.address?.road || data.address?.city || data.address?.town || data.display_name.split(',')[0];
                            setLocationStatus(name);
                        } else {
                            setLocationStatus('Eigener Standort');
                        }
                    } catch { setLocationStatus('Eigener Standort'); }
                } else {
                    destMarkerRef.current?.setLatLng([lat, lng]);
                    destMarkerRef.current?.setOpacity(1);
                    setDestCoords([lat, lng]);
                    setDestStatus('Wird geladen...');
                    try {
                        const res = await fetch(`${API_BASE}/api/geocode/reverse?format=json&lat=${lat}&lon=${lng}`);
                        const data = await res.json();
                        if (data && data.display_name) {
                            const name = data.address?.road || data.address?.city || data.address?.town || data.display_name.split(',')[0];
                            setDestStatus(name);
                        } else {
                            setDestStatus('Ausgewählter Standort');
                        }
                    } catch { setDestStatus('Ausgewählter Standort'); }
                }
            });

            setMapReady(true);
        }

        const defaultCenter = [48.6616, 9.0654]; // Center of Baden-Württemberg

        if (locationEnabled && "geolocation" in navigator) {
            setLocationStatus('Standort wird ermittelt...');
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const ll = [pos.coords.latitude, pos.coords.longitude];
                    initMap(ll, 14);
                    setLocationStatus('Mein Standort');
                    setStartCoords(ll);
                },
                () => {
                    initMap(defaultCenter, 9);
                    setLocationStatus('Standortzugriff verweigert');
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            initMap(defaultCenter, 9);
        }

        return () => {
            mapInstance.current?.remove();
            mapInstance.current = null;
        };
    }, []);

    // Fetch parking sites and additional map layers
    useEffect(() => {
        if (!mapReady || !mapInstance.current) return;

        const map = mapInstance.current;

        // Fetch parking site markers from the live API
        fetch(`${API_BASE}/api/parking/bw`)
            .then(res => res.json())
            .then(json => {
                if (!mapInstance.current || mapInstance.current !== map) return;
                const sites = json.sites || [];
                if (parkingMarkersLayerRef.current) parkingMarkersLayerRef.current.clearLayers();
                else parkingMarkersLayerRef.current = L.layerGroup().addTo(map);

                sites.forEach(site => {
                    const marker = L.circleMarker(site.coordinates, {
                        radius: 8,
                        color: '#f43f5e',
                        fillColor: '#f43f5e',
                        fillOpacity: 0.7,
                        weight: 2,
                        opacity: 1
                    });
                    marker.bindPopup(`<b>${site.name}</b><br/>${site.address || ''}<br/>Kapazität: ${site.totalCapacity}`);
                    parkingMarkersLayerRef.current.addLayer(marker);
                });
            })
            .catch(err => console.error("Error loading parking sites:", err));

        // Fetch CKAN parkbauten building outlines
        fetch(`${API_BASE}/api/parkbauten`)
            .then(res => res.json())
            .then(data => {
                if (!mapInstance.current || mapInstance.current !== map) return;
                if (parkbautenLayerRef.current) parkbautenLayerRef.current.remove();
                parkbautenLayerRef.current = L.geoJSON(data, {
                    style: { color: '#f43f5e', weight: 2 },
                    pointToLayer: (feature, latlng) => L.circleMarker(latlng, { radius: 5, color: '#f43f5e', fillColor: '#f43f5e', fillOpacity: 0.8 })
                }).addTo(map);
            })
            .catch(err => console.error("Error loading parking layer:", err));

    }, [mapReady]);

    // When location is enabled after mount, update the marker and map center
    useEffect(() => {
        if (!locationEnabled || !mapInstance.current || !markerInstance.current) return;
        if (!("geolocation" in navigator)) return;
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const ll = [pos.coords.latitude, pos.coords.longitude];
                markerInstance.current?.setLatLng(ll);
                mapInstance.current?.flyTo(ll, 14, { animate: true });
                setStartCoords(ll);
                try {
                    const res = await fetch(`${API_BASE}/api/geocode/reverse?format=json&lat=${ll[0]}&lon=${ll[1]}`);
                    const data = await res.json();
                    if (data && data.display_name) {
                        const name = data.address?.road || data.address?.city || data.address?.town || data.display_name.split(',')[0];
                        setLocationStatus(name);
                    } else {
                        setLocationStatus('Mein Standort');
                    }
                } catch { setLocationStatus('Mein Standort'); }
            },
            () => { },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }, [locationEnabled]);

    // Apply dark mode to the map tile pane (tiles stay the same; CSS filter darkens them)
    useEffect(() => {
        setMapDarkMode(mapInstance.current, darkMode);
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

            {tileOffline && (
                <div className="tile-offline-banner" role="alert">
                    <WarningCircle weight="fill" /> Keine Internetverbindung. Karte kann nicht angezeigt werden. Bitte Verbindung prüfen und erneut versuchen.
                </div>
            )}

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
                                {darkMode ? '☀️ Hellmodus' : '🌙 Nachtmodus'}
                            </div>
                            <div className="dropdown-item" onClick={() => { setPrivacyModalOpen(true); setSettingsOpen(false); }}>
                                🔒 Datenschutzeinstellungen
                            </div>
                            <div className="dropdown-item" onClick={() => { setProfileModalOpen(true); setSettingsOpen(false); }}>
                                ℹ️ Info &amp; Hilfe
                            </div>

                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        {parkingType === 'kurz' ? 'Kurzzeit' : 'Dauerparken'}
                    </div>
                    {editingLocation ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--primary)', color: 'white', padding: '0.4rem 1rem', borderRadius: '2rem', fontSize: '0.875rem', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(244, 63, 94, 0.3)' }}>
                            Tippen Sie irgendwo auf die Karte
                            <button onClick={() => { setEditingLocation(false); isPickingLocationRef.current = false; }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', cursor: 'pointer', marginLeft: '0.5rem', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X weight="bold" /></button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>
                                {locationStatus || 'Startpunkt festlegen'}
                            </div>
                            <button
                                onClick={() => { setEditingLocation(true); isPickingLocationRef.current = true; }}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--surface)', border: '1px solid var(--border-color)', color: 'var(--primary)', padding: '0.3rem 0.75rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}
                            >
                                <Pencil weight="bold" /> Standort ändern
                            </button>
                        </div>
                    )}
                </div>
                <div style={{ width: '40px' }}></div>
            </div>

            <div className="top-park-btn-container" style={{ position: 'absolute', top: '5rem', right: '1rem', zIndex: 20 }}>
                <button className="btn btn-primary shadow-glow" onClick={() => { setShowSearchSheet(true); }} style={{ padding: '0.6rem 1.2rem', borderRadius: '1.5rem 1.5rem 1.5rem 0', display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.875rem', fontWeight: '600' }}>
                    <span>Park & Ride</span>
                    <CaretRight weight="bold" size={28} />
                </button>
                {destCoords && (
                    <div style={{ fontSize: '0.65rem', color: 'var(--primary)', marginTop: '0.25rem', textAlign: 'right', fontWeight: 500, background: 'rgba(244,63,94,0.1)', borderRadius: '0.5rem', padding: '0.2rem 0.5rem' }}>
                        → {destStatus || 'Ausgewählt'}
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
                            <div className="parking-sheet-stats">
                                <div className="ps-stat">
                                    <Car weight="fill" className="ps-stat-icon" />
                                    <div className="ps-stat-label">Kapazität</div>
                                    <div className="ps-stat-value">{selectedParking.totalCapacity}</div>
                                </div>
                                <div className="ps-stat">
                                    <MapPin weight="fill" className="ps-stat-icon" />
                                    <div className="ps-stat-label">Standort</div>
                                    <div className="ps-stat-value">{selectedParking.coordinates[0].toFixed(3)}, {selectedParking.coordinates[1].toFixed(3)}</div>
                                </div>
                                {selectedParking.amenities?.evCharging && (
                                    <div className="ps-stat">
                                        <ChargingStation weight="fill" className="ps-stat-icon" />
                                        <div className="ps-stat-label">E-Ladestation</div>
                                        <div className="ps-stat-value">Verfügbar</div>
                                    </div>
                                )}
                            </div>
                            <button className="btn btn-primary w-100 mt-2" onClick={() => { setShowSearchSheet(true); }}>
                                <NavigationArrow weight="bold" className="mr-2" /> Route ab hier
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="bottom-controls">
                <div className="search-container" onClick={() => { setShowSearchSheet(true); }}>
                    <MagnifyingGlass weight="bold" className="search-icon" />
                    <div className="search-text">{destStatus ? destStatus : 'Auf Karte tippen, um Ziel festzulegen'}</div>
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

            {showSearchSheet && (
                <div className="search-sheet-overlay visible" onClick={() => setShowSearchSheet(false)}>
                    <div className="search-sheet" onClick={e => e.stopPropagation()}>
                        <div className="sheet-header">
                            <h3>Route</h3>
                            <button className="icon-btn close-btn" onClick={() => setShowSearchSheet(false)}>
                                <X weight="bold" />
                            </button>
                        </div>

                        <RouteSearchForm
                            initialStartLocation={locationStatus || ''}
                            initialStartCoords={startCoords}
                            initialDestination={destStatus || ''}
                            initialDestCoords={destCoords}
                            selectedParking={selectedParking}
                            onRemoveParking={() => { setSelectedParking(null); setShowSearchSheet(false); }}
                            onSubmit={handleSearchSubmit}
                            loading={loadingLocation}
                        />
                    </div>
                </div>
            )}

            {/* Privacy Modal */}
            {privacyModalOpen && (
                <div className="parking-sheet-overlay visible" onClick={() => setPrivacyModalOpen(false)}>
                    <div className="parking-sheet expanded" onClick={e => e.stopPropagation()} style={{ padding: '2rem', height: 'auto', bottom: 0 }}>
                        <h3 style={{ marginBottom: '0.5rem' }}>Datenschutzeinstellungen</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>Verwalten Sie Ihre Datenzugriffe und Tracking-Einstellungen.</p>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0', borderBottom: '1px solid var(--border-color)' }}>
                            <div>
                                <h4 style={{ margin: '0 0 0.25rem 0' }}>Standortzugriff</h4>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Erforderlich für Routenführung und Parkplätze in der Nähe</span>
                            </div>
                            <input type="checkbox" checked={locationEnabled} readOnly style={{ transform: 'scale(1.2)' }} />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0', borderBottom: '1px solid var(--border-color)' }}>
                            <div>
                                <h4 style={{ margin: '0 0 0.25rem 0' }}>Analyse & Nutzung</h4>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Helfen Sie uns, das ParkIQ-Erlebnis zu verbessern</span>
                            </div>
                            <input type="checkbox" checked={analyticsEnabled} onChange={(e) => setAnalyticsEnabled(e.target.checked)} style={{ transform: 'scale(1.2)' }} />
                        </div>

                        <div className="ticket-options-container" style={{ marginTop: '1.5rem' }}>
                            <div className="ticket-options-header">
                                <h3>Haben Sie eine der folgenden Optionen?</h3>
                                <p className="text-xs text-muted">Aktivieren Sie die für Sie zutreffende Option</p>
                            </div>

                            <div className="ticket-option">
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

                            <div className="ticket-option">
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
                                                />
                                                <button className="btn btn-sm btn-primary" onClick={handleDauerparkticketConfirm}>Festlegen</button>
                                            </div>
                                        ) : (
                                            <div className="station-confirmed">
                                                <MapPin weight="fill" /> Station: {dauerparkticketStation}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <button className="btn btn-primary w-100" style={{ marginTop: '2rem' }} onClick={() => setPrivacyModalOpen(false)}>Einstellungen speichern</button>
                    </div>
                </div>
            )}

            {/* Info & Hilfe Modal */}
            {profileModalOpen && (
                <div className="parking-sheet-overlay visible" onClick={() => setProfileModalOpen(false)}>
                    <div className="parking-sheet expanded" onClick={e => e.stopPropagation()} style={{ padding: '2rem', height: 'auto', bottom: 0, maxHeight: '85vh', overflowY: 'auto' }}>
                        <h3 style={{ marginBottom: '1rem' }}>Info &amp; Hilfe</h3>

                        <p style={{ color: 'var(--text-main)', marginBottom: '1.25rem', fontSize: '0.875rem', lineHeight: '1.6' }}>
                            Diese App unterstützt Sie bei der Planung Ihrer nachhaltigen Mobilität mit Bus und Bahn.
                        </p>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: '1.6', marginBottom: '1.25rem' }}>
                            Fahrradabstellanlagen werden in einer zukünftigen Version angezeigt.
                        </p>
                        <p style={{ color: 'var(--text-main)', marginBottom: '1.25rem', fontSize: '0.875rem', lineHeight: '1.6' }}>
                            Bei Fragen oder Problemen kontaktieren Sie uns bitte unter.
                        </p>

                        <div style={{ background: 'var(--bg-color)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.25rem' }}>
                            <div style={{ fontSize: '0.875rem', lineHeight: '1.8', color: 'var(--text-main)' }}>
                                <div><strong>Telefon:</strong> +49 (0)711 89255-0</div>
                                <div><strong>Telefax:</strong> +49 (0)711 89255-599</div>
                                <div><strong>E-Mail:</strong> info@pbw</div>
                            </div>
                        </div>

                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                            <strong>Weitere Informationen:</strong> Informationen zu Angeboten für Studierende und Berufstätige finden Sie auf der PBW-Website.
                        </p>

                        <button className="btn btn-primary w-100" onClick={() => setProfileModalOpen(false)}>Schließen</button>
                    </div>
                </div>
            )}



        </div>
    );
};

export default Home;
