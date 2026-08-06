import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
const FETCH_TIMEOUT = 70000; // 70s
import { useParking } from '../context/ParkingContext';
import { ArrowLeft, MapPin, Car, PersonSimpleWalk, Train, Bus, Bicycle, CircleNotch, CaretLeft, Envelope, WarningCircle, Ticket, Check } from '@phosphor-icons/react';
import L from 'leaflet';
import './Results.css';

const API_BASE = 'http://localhost:5000';

const DEFAULT_HOURLY_RATE = '2 €/Std.';

const formatEuro = (val) => {
    const n = parseFloat(val);
    if (isNaN(n)) return val;
    return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
};

function getParkingDisplayPricing(opt) {
  const isFree = opt.isFree === true || opt.hasFee === false;
  if (isFree) {
    return { label: 'Kostenloses Parken', className: 'badge-free', isFree: true };
  }

  if (opt.displayPrice) {
    return { label: opt.displayPrice, className: 'badge-paid', isFree: false };
  }

  if (opt.hasFee === true) {
    return { label: DEFAULT_HOURLY_RATE, className: 'badge-paid', isFree: false };
  }

  return { label: formatEuro(opt.totalCost), className: 'badge-default', isFree: false };
}

const MODE_META = {
    train: { icon: '🚆', label: 'Bahn', color: '#f43f5e' },
    bus: { icon: '🚌', label: 'Bus', color: '#3b82f6' },
    bicycle: { icon: '🚲', label: 'Fahrrad', color: '#22c55e' }
};

const MODE_NAME_DE = { train: 'Bahn', bus: 'Bus', bicycle: 'Fahrrad' };

const Results = () => {
    const navigate = useNavigate();
    const locationState = useLocation();
    const { parkingType, hasJobTicket, hasDauerparkticket, dauerparkticketStation, dauerparkticketStationCoords } = useParking();
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const parkingMarkersRef = useRef([]);
    const routeLayersRef = useRef([]);

    const iconSvgCache = useRef({});
    const routeCacheRef = useRef(new Map());
    const iconRef = (name) => (el) => {
        if (el && !iconSvgCache.current[name]) {
            const svg = el.querySelector('svg');
            if (svg) iconSvgCache.current[name] = svg.outerHTML;
        }
    };

    const [isExpanded, setIsExpanded] = useState(true);

    const touchStartY = useRef(0);
    const handleTouchStart = (e) => { touchStartY.current = e.touches ? e.touches[0].clientY : e.clientY; };
    const handleTouchMove = (e) => {
        if (!isExpanded) return;
        const currentY = e.touches ? e.touches[0].clientY : e.clientY;
        if (currentY - touchStartY.current > 40) setIsExpanded(false);
    };

    const [routeOptions, setRouteOptions] = useState([]);
    const [selectedMode, setSelectedMode] = useState('train');
    const [sortBy, setSortBy] = useState('price');
    const [sortOrder, setSortOrder] = useState('asc');
    const sortedOptions = [...routeOptions]
        .sort((a, b) => {
            const aVal = sortBy === 'price' ? parseFloat(a.totalCost) : (parseInt(a.totalTime) || 999);
            const bVal = sortBy === 'price' ? parseFloat(b.totalCost) : (parseInt(b.totalTime) || 999);
            return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
        })
        .slice(0, 10);

    // Determine best transport mode: which mode has the fastest total trip time
    const bestMode = (() => {
        const modeKeys = ['train', 'bus', 'bicycle'];
        const modeHasFlag = { train: 'hasTrainStop', bus: 'hasBusStop', bicycle: 'hasBikeStop' };
        let best = null;
        let bestTime = Infinity;
        for (const mode of modeKeys) {
            const available = routeOptions.filter(o => o[modeHasFlag[mode]]);
            if (available.length === 0) continue;
            const fastest = Math.min(...available.map(o => parseInt(o.totalTime) || 999));
            if (fastest < bestTime) { bestTime = fastest; best = mode; }
        }
        return best;
    })();

    const [selectedParking, setSelectedParking] = useState(null);
    const [isDirectTransit, setIsDirectTransit] = useState(false);
    const [routeData, setRouteData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingRoute, setLoadingRoute] = useState(false);
    const [error, setError] = useState(null);
    const [isNavigating, setIsNavigating] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const navLayersRef = useRef([]);

    // Mode of the currently displayed trip: the open route's mode in the detail
    // view, or the primary (first) option's mode while browsing the list.
    const activeMode = selectedParking
        ? selectedMode
        : (sortedOptions[0]?.bestTransitMode || bestMode || selectedMode);
    const navPulseRef = useRef(null);

    const destination = locationState.state?.destination || 'Baden-Württemberg Zentrum';
    const startLocation = locationState.state?.startLocation || 'Your Location';
    const startCoords = locationState.state?.startCoords || [48.6616, 9.0654];
    const destCoords = locationState.state?.destCoords || null;
    const arrivalTime = locationState.state?.arrivalTime;
    const parkingId = locationState.state?.parkingId || null;
    const maxTimeMinutes = locationState.state?.maxTimeMinutes || 120;

    // Check if destination is near the Dauerparkticket station (text match OR geographic proximity)
    const isNearDauerparkticketStation = hasDauerparkticket && dauerparkticketStation && (
        destination.toLowerCase().includes(dauerparkticketStation.toLowerCase()) ||
        dauerparkticketStation.toLowerCase().includes(destination.toLowerCase()) ||
        (dauerparkticketStationCoords && destCoords && (() => {
            const R = 6371e3;
            const toRad = (d) => d * Math.PI / 180;
            const dLat = toRad(destCoords[0] - dauerparkticketStationCoords[0]);
            const dLon = toRad(destCoords[1] - dauerparkticketStationCoords[1]);
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(dauerparkticketStationCoords[0])) * Math.cos(toRad(destCoords[0])) * Math.sin(dLon / 2) ** 2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) < 500;
        })())
    );

    // When destination matches station, the effective starting point is the station itself
    const effectiveStartLocation = isNearDauerparkticketStation ? dauerparkticketStation : startLocation;

    // Fetch parking options list
    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        const fetchOptions = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`${API_BASE}/api/routes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ destination, startCoords, destCoords, arrivalTime, parkingId, maxTimeMinutes }),
                    signal: controller.signal
                });
                if (!cancelled) clearTimeout(timer);
                if (!res.ok) throw new Error(`API error: ${res.status}`);
                const json = await res.json();
                if (!json.success) throw new Error(json.message || 'Unknown error');

                if (!cancelled) {
                    if (json.directTransit) {
                        setIsDirectTransit(true);
                        setSelectedParking(null);
                        setSelectedMode(json.directTransit.mode || 'train');
                        setRouteOptions([]);
                        setRouteData(json.directTransit);
                        setIsExpanded(true);
                    } else {
                        setIsDirectTransit(false);
                        const enriched = (json.data || []).map((opt, index) => ({
                            ...opt,
                            category: 'Öffentlich',
                            hasTransitDiscount: hasJobTicket,
                            isDauerparkticketFree: isNearDauerparkticketStation
                        }));
                        setRouteOptions(enriched);
                    }
                }
            } catch (err) {
                if (err.name === 'AbortError') {
                    if (!cancelled) setError('Request timed out. Please try again.');
                    return;
                }
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) { clearTimeout(timer); setLoading(false); }
            }
        };
        fetchOptions();
        return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
    }, [destination, startCoords, destCoords, arrivalTime, parkingId, hasJobTicket]);

    // Init map with markers
    useEffect(() => {
        if (mapInstance.current || !mapRef.current || loading) return;

        mapInstance.current = L.map(mapRef.current, { zoomControl: false }).setView(startCoords, 12);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(mapInstance.current);
        mapInstance.current.on('click', () => setIsExpanded(false));
        setTimeout(() => mapInstance.current?.invalidateSize(), 200);

        const startIcon = L.divIcon({
            className: 'map-node start-node',
            html: '📍',
            iconSize: [30, 30]
        });
        L.marker(startCoords, { icon: startIcon }).addTo(mapInstance.current);

    }, [loading, routeOptions]);

    const currentRouteReq = useRef(null);
    const fetchRouteForParking = async (mode, parking) => {
        if (!parking) return;
        const cacheKey = `${parking.id}-${mode}`;
        const cached = routeCacheRef.current.get(cacheKey);
        if (cached) {
            setRouteData(cached);
            return;
        }
        currentRouteReq.current?.abort();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        currentRouteReq.current = controller;
        setLoadingRoute(true);
        try {
            const res = await fetch(`${API_BASE}/api/routes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    destination, startCoords, destCoords, arrivalTime,
                    parkingId: parking.id,
                    transportMode: mode,
                    maxTimeMinutes
                }),
                signal: controller.signal
            });
            if (!res.ok) throw new Error(`API error: ${res.status}`);
            const json = await res.json();
            if (!json.success || !json.data?.length) throw new Error(json.message || 'Keine Route gefunden');
            routeCacheRef.current.set(cacheKey, json.data[0]);
            if (routeCacheRef.current.size > 50) {
                const firstKey = routeCacheRef.current.keys().next().value;
                routeCacheRef.current.delete(firstKey);
            }
            if (currentRouteReq.current === controller) {
                setRouteData(json.data[0]);
            }
        } catch (err) {
            if (err.name === 'AbortError' || currentRouteReq.current !== controller) return;
            setError(err.message);
        } finally {
            if (currentRouteReq.current === controller) {
                clearTimeout(timer);
                setLoadingRoute(false);
            }
        }
    };

    const handleModeChange = (mode) => {
        setSelectedMode(mode);
        if (selectedParking) {
            fetchRouteForParking(mode, selectedParking);
        }
    };

    const handleSelectParking = (opt) => {
        const mode = opt.bestTransitMode || selectedMode;
        setIsDirectTransit(false);
        setSelectedParking(opt);
        setSelectedMode(mode);
        setRouteData(null);
        setIsExpanded(true);
        fetchRouteForParking(mode, opt);
    };

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
            let stepNum = 1;
            routeData.segments.forEach((seg, segIdx) => {
                const mode = seg.mode || 'driving';
                if (!seg.path || seg.path.length < 2) return;
                seg.path.forEach(pt => bounds.extend(pt));

                let modeColor, modeKey, glowColor, lineWeight, dashArray, modeLabel;
                if (mode === 'driving') { modeColor = '#64748b'; modeKey = 'driving'; glowColor = 'rgba(100,116,139,0.25)'; lineWeight = 6; dashArray = ''; modeLabel = 'Fahrt'; }
                else if (mode === 'walking') { modeColor = '#0ea5e9'; modeKey = 'walking'; glowColor = 'rgba(14,165,233,0.3)'; lineWeight = 6; dashArray = '10, 6'; modeLabel = 'Fußweg'; }
                else if (mode === 'transit' || mode === 'train') { modeColor = '#e11d48'; modeKey = 'train'; glowColor = 'rgba(225,29,72,0.2)'; lineWeight = 7; dashArray = ''; modeLabel = 'Bahn'; }
                else if (mode === 'bus') { modeColor = '#7c3aed'; modeKey = 'bus'; glowColor = 'rgba(124,58,237,0.2)'; lineWeight = 6; dashArray = '12, 6'; modeLabel = 'Bus'; }
                else if (mode === 'cycling') { modeColor = '#f59e0b'; modeKey = 'cycling'; glowColor = 'rgba(245,158,11,0.2)'; lineWeight = 5; dashArray = '16, 8'; modeLabel = 'Rad'; }

                const glow = L.polyline(seg.path, {
                    color: glowColor || modeColor, weight: lineWeight + 8, opacity: 0.35,
                    lineCap: 'round', lineJoin: 'round'
                }).addTo(map);
                layers.push(glow);

                if (modeColor) {
                    const dashOpts = dashArray ? { dashArray } : {};
                    const poly = L.polyline(seg.path, {
                        color: modeColor, weight: lineWeight, opacity: 0.9,
                        lineCap: 'round', lineJoin: 'round', ...dashOpts
                    }).addTo(map);
                    layers.push(poly);
                }

                const stepColor = modeColor || '#64748b';
                const stepHtml = `<div class="step-number-marker" style="background:${stepColor};color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${stepNum}</div>`;
                const stepMarker = L.marker(seg.path[0], {
                    icon: L.divIcon({ className: 'custom-route-icon', html: stepHtml, iconSize: [24, 24] })
                }).addTo(map);
                layers.push(stepMarker);

                const endHtml = `<div class="step-label-bubble" style="background:${stepColor};color:#fff;padding:3px 8px;border-radius:6px;font-weight:700;font-size:10px;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,0.25);display:flex;align-items:center;gap:4px;">${mode === 'walking'
                    ? `Schritt ${stepNum}: ${seg.durationMin || ''} Min. Fußweg`
                    : `Schritt ${stepNum}: ${modeLabel} ${seg.durationMin || ''} Min.`}</div>`;
                const midIdx = Math.floor(seg.path.length / 2);
                const labelMarker = L.marker(seg.path[midIdx], {
                    icon: L.divIcon({
                        className: 'route-label-node',
                        html: endHtml,
                        iconSize: [100, 24],
                        iconAnchor: [50, 30]
                    })
                }).addTo(map);
                layers.push(labelMarker);

                stepNum++;
            });
        }

        if (!isDirectTransit && routeData.lat != null && routeData.lng != null) {
            const parkMarker = L.marker([routeData.lat, routeData.lng], {
                icon: L.divIcon({
                    className: 'map-node parking-node',
                    html: '<div style="background:#f43f5e;color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">P</div>',
                    iconSize: [28, 28]
                })
            }).addTo(map);
            layers.push(parkMarker);
            bounds.extend([routeData.lat, routeData.lng]);
        }

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
    }, [routeData, isDirectTransit]);

    const handleEmailReservation = (parkingName) => {
        window.open('https://www.pbw.de/reservieren', '_blank');
    };

    const handleStartNavigation = () => {
        setIsNavigating(true);
        setCurrentStep(0);
        setIsExpanded(false);
    };

    const handleStopNavigation = () => {
        setIsNavigating(false);
        setCurrentStep(0);
        navLayersRef.current.forEach(l => l.remove());
        navLayersRef.current = [];
        if (navPulseRef.current) { navPulseRef.current.remove(); navPulseRef.current = null; }
        if (mapInstance.current && routeData) {
            const bounds = L.latLngBounds([]);
            bounds.extend(startCoords);
            routeData.segments.forEach(s => s.path?.forEach(pt => bounds.extend(pt)));
            bounds.extend([routeData.lat, routeData.lng]);
            mapInstance.current.fitBounds(bounds, { padding: [50, 100] });
        }
        setIsExpanded(true);
    };

    const handleNextStep = () => {
        if (routeData && currentStep < routeData.segments.length - 1) {
            setCurrentStep(prev => prev + 1);
        }
    };

    const handlePrevStep = () => {
        if (currentStep > 0) setCurrentStep(prev => prev - 1);
    };

    const MODE_COLORS = {
        driving: '#64748b', walking: '#0ea5e9', train: '#e11d48',
        transit: '#e11d48', bus: '#7c3aed', cycling: '#f59e0b'
    };
    const MODE_LABELS = {
        driving: 'Fahrt', walking: 'Fußweg', train: 'Bahn nehmen',
        transit: 'Bahn nehmen', bus: 'Bus nehmen', cycling: 'Radfahren'
    };

    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !isNavigating || !routeData?.segments?.length) return;

        navLayersRef.current.forEach(l => l.remove());
        navLayersRef.current = [];
        if (navPulseRef.current) { navPulseRef.current.remove(); navPulseRef.current = null; }

        const seg = routeData.segments[currentStep];
        if (!seg || !seg.path || seg.path.length < 2) return;

        const color = MODE_COLORS[seg.mode] || '#64748b';

        const glow = L.polyline(seg.path, {
            color, weight: 14, opacity: 0.2,
            lineCap: 'round', lineJoin: 'round'
        }).addTo(map);
        navLayersRef.current.push(glow);

        const isWalking = seg.mode === 'walking';
        const dashArr = isWalking ? { dashArray: '10, 6' } : {};
        const poly = L.polyline(seg.path, {
            color, weight: 7, opacity: 0.95,
            lineCap: 'round', lineJoin: 'round', ...dashArr
        }).addTo(map);
        navLayersRef.current.push(poly);

        const startPos = seg.path[0];
        const pulseHtml = `<div class="nav-pulse-marker" style="width:32px;height:32px;position:relative;">
            <div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.3;animation:navPulseRing 2s ease-out infinite;"></div>
            <div style="position:absolute;top:6px;left:6px;width:20px;height:20px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>
        </div>`;
        navPulseRef.current = L.marker(startPos, {
            icon: L.divIcon({ className: 'nav-pulse-container', html: pulseHtml, iconSize: [32, 32] })
        }).addTo(map);

        const stepNum = currentStep + 1;
        const startLabel = `<div style="background:${color};color:#fff;padding:4px 10px;border-radius:8px;font-weight:800;font-size:11px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);">Schritt ${stepNum}</div>`;
        navLayersRef.current.push(L.marker(startPos, {
            icon: L.divIcon({ className: 'nav-label', html: startLabel, iconSize: [60, 24], iconAnchor: [30, 30] })
        }).addTo(map));

        const endPos = seg.path[seg.path.length - 1];
        const endLabelHtml = `<div style="background:#fff;color:${color};padding:4px 10px;border-radius:8px;font-weight:700;font-size:10px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.2);border:2px solid ${color};">
            ${currentStep < routeData.segments.length - 1 ? 'Weiter →' : 'Ziel'}
        </div>`;
        navLayersRef.current.push(L.marker(endPos, {
            icon: L.divIcon({ className: 'nav-end-label', html: endLabelHtml, iconSize: [80, 24], iconAnchor: [40, 30] })
        }).addTo(map));

        const bounds = L.latLngBounds(seg.path);
        map.fitBounds(bounds, { padding: [80, 80], maxZoom: 16 });
    }, [isNavigating, currentStep, routeData]);

    const navModeMeta = routeData?.segments?.[currentStep] ? {
        mode: routeData.segments[currentStep].mode,
        color: MODE_COLORS[routeData.segments[currentStep].mode] || '#64748b',
        label: MODE_LABELS[routeData.segments[currentStep].mode] || 'Travel',
        duration: routeData.segments[currentStep].durationMin || 0,
        from: routeData.segments[currentStep].fromStop || routeData.segments[currentStep].stopName || '',
        to: routeData.segments[currentStep].toStop || routeData.segments[currentStep].stopName || '',
        details: routeData.segments[currentStep].label || ''
    } : null;

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

    const hiddenIcons = (
        <div style={{position:'absolute',left:-9999,top:-9999,opacity:0,pointerEvents:'none',width:0,height:0,overflow:'hidden'}}>
            <span ref={iconRef('driving')}><Car weight="fill" size={16} /></span>
            <span ref={iconRef('walking')}><PersonSimpleWalk weight="fill" size={16} /></span>
            <span ref={iconRef('train')}><Train weight="fill" size={16} /></span>
            <span ref={iconRef('bus')}><Bus weight="fill" size={16} /></span>
            <span ref={iconRef('cycling')}><Bicycle weight="fill" size={16} /></span>
        </div>
    );

    const renderModeTabs = () => (
        <div className="mode-tabs">
            {Object.entries(MODE_META).map(([mode, meta]) => {
                const isActive = mode === activeMode;
                return (
                    <button
                        key={mode}
                        className={`mode-tab ${isActive ? 'active' : ''} ${isActive ? 'best-mode' : ''}`}
                        onClick={() => handleModeChange(mode)}
                    >
                        <span className="mode-tab-icon">{meta.icon}</span>
                        <span className="mode-tab-label">{meta.label}</span>
                        {isActive && <span className="best-mode-check"><Check weight="bold" size={12} /></span>}
                    </button>
                );
            })}
        </div>
    );

    return (
        <div className="view">
            {hiddenIcons}

            {loading ? (
                <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', background:'var(--surface)'}}>
                    <CircleNotch weight="bold" className="pulse text-primary" style={{fontSize: '3rem', animation: 'spin 1s linear infinite'}} />
                    <h3 className="font-bold">Parkoptionen werden geladen...</h3>
                </div>
            ) : error ? (
                <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', background:'var(--surface)', padding:'2rem', textAlign:'center'}}>
                    <WarningCircle weight="fill" style={{fontSize:'3rem',color:'var(--primary)',marginBottom:'1rem'}} />
                    <h3 className="font-bold" style={{marginBottom:'0.5rem'}}>Routenfehler</h3>
                    <p className="text-muted text-sm" style={{marginBottom:'1.5rem'}}>{error}</p>
                    <button className="btn btn-outline" onClick={() => navigate('/search')}>Erneut versuchen</button>
                </div>
            ) : (
                <>
                    <div ref={mapRef} className="main-map" />

                    {!isNavigating ? (
                        <div className="results-top">
                            <div className="results-top-row">
                                <button className="icon-btn bg-white shadow-sm" onClick={() => navigate(-1)}><ArrowLeft weight="bold" /></button>
                                <div className="destination-pill bg-white shadow-sm"><MapPin weight="fill" className="text-primary" /><span>{destination}</span></div>
                                <div style={{width: '40px'}}></div>
                            </div>
                            {!isDirectTransit && renderModeTabs()}
                        </div>
                    ) : (
                        <div className="nav-overlay-top">
                            <div className="nav-step-progress">
                                <div className="nav-progress-bar">
                                    <div className="nav-progress-fill" style={{ width: `${((currentStep + 1) / routeData.segments.length) * 100}%` }}></div>
                                </div>
                                <span className="nav-step-counter">Schritt {currentStep + 1} von {routeData.segments.length}</span>
                            </div>
                            {navModeMeta && (
                                <div className="nav-step-card" style={{ borderLeft: `4px solid ${navModeMeta.color}` }}>
                                    <div className="nav-step-info">
                                        <div className="nav-step-mode" style={{ color: navModeMeta.color }}>{navModeMeta.label}</div>
                                        <div className="nav-step-duration">{navModeMeta.duration} Min.</div>
                                    </div>
                                    <div className="nav-step-detail">
                                        {navModeMeta.from && <span>Von: {navModeMeta.from}</span>}
                                        {navModeMeta.to && navModeMeta.from && <span> → </span>}
                                        {navModeMeta.to && <span>Nach: {navModeMeta.to}</span>}
                                    </div>
                                </div>
                            )}
                            <div className="nav-controls">
                                <button className="nav-btn nav-btn-stop" onClick={handleStopNavigation}>
                                    <ArrowLeft weight="bold" size={16} /> Beenden
                                </button>
                                <div className="nav-step-dots">
                                    {routeData.segments.map((_, i) => (
                                        <div key={i} className={`nav-dot ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'done' : ''}`}></div>
                                    ))}
                                </div>
                                <div className="nav-btn-group">
                                    <button className="nav-btn nav-btn-prev" onClick={handlePrevStep} disabled={currentStep === 0}>← Zurück</button>
                                    {currentStep < routeData.segments.length - 1 ? (
                                        <button className="nav-btn nav-btn-next" onClick={handleNextStep}>Weiter →</button>
                                    ) : (
                                        <button className="nav-btn nav-btn-next nav-btn-arrived" onClick={handleStopNavigation}>Angekommen!</button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {!isNavigating && (
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

                            {/* Options list */}
                            {!selectedParking && !loadingRoute && !routeData && (
                                <div className="options-list">
                                    <div className="flex-between mb-3">
                                        <h4 className="text-muted text-sm font-semibold">PARKPLATZ AUSWÄHLEN</h4>
                                        <div className="sort-bar">
                                            <button className={`sort-btn ${sortBy === 'price' ? 'active' : ''}`} onClick={() => { if (sortBy === 'price') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); else { setSortBy('price'); setSortOrder('asc'); } }}>
                                                Preis {sortBy === 'price' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                                            </button>
                                            <button className={`sort-btn ${sortBy === 'time' ? 'active' : ''}`} onClick={() => { if (sortBy === 'time') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); else { setSortBy('time'); setSortOrder('asc'); } }}>
                                                Dauer {sortBy === 'time' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                                            </button>
                                        </div>
                                    </div>
                                    {sortedOptions.length === 0 && routeOptions.length > 0 && (
                                        <p className="text-muted text-sm text-center">Keine passenden Optionen</p>
                                    )}
                                    {sortedOptions.map((opt, idx) => {
                                        const displayPrice = getParkingDisplayPricing(opt);
                                        const transitFree = opt.hasTransitDiscount;
                                        const dauerparkFree = opt.isDauerparkticketFree;
                                        return (
                                        <div key={idx} className={`option-card ${transitFree || dauerparkFree ? 'special-card' : ''}`} onClick={() => handleSelectParking(opt)}>
                                            <div className="flex-between mb-2">
                                                <div className="font-bold">{opt.parkingName}<span className={`category-tag ${opt.category?.toLowerCase() || 'public'}`}>{opt.category || 'Öffentlich'}</span></div>
                                                <div className="price-container">
                                                    <div className={`font-bold text-primary ${dauerparkFree ? 'badge-free' : displayPrice.className}`}>
                                                        {dauerparkFree ? 'Kostenloses Parken' : displayPrice.label}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="option-details">
                                                <div className="flex-between text-sm text-muted">
                                                    <div>{opt.totalTime}</div>
                                                    {!displayPrice.isFree && !dauerparkFree && <div>{formatEuro(opt.savings)} sparen</div>}
                                                    {transitFree && <div className="text-success">Job-Ticket aktiv</div>}
                                                    {dauerparkFree && <div className="text-success">Dauerparkticket: Station</div>}
                                                </div>
                                                {(opt.nearTrain?.name || opt.nearBus?.name || opt.nearBike?.name) && (
                                                    <div className="text-xs text-muted mt-1" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <span>🚶 {opt.walkTime} Min.</span>
                                                        <span>→</span>
                                                        <span style={{ fontWeight: 600 }}>
                                                            {opt.bestTransitMode === 'train' && opt.nearTrain?.name}
                                                            {opt.bestTransitMode === 'bus' && opt.nearBus?.name}
                                                            {opt.bestTransitMode === 'bicycle' && opt.nearBike?.name}
                                                        </span>
                                                        <span className="tag" style={{ fontSize: '9px', background: 'var(--primary)', color: '#fff', borderRadius: '4px', padding: '1px 5px' }}>
                                                            {opt.bestTransitMode === 'train' ? 'Bahn' : opt.bestTransitMode === 'bus' ? 'Bus' : 'Rad'}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        );
                                    })}
                                    {routeOptions.length > 10 && (
                                        <p className="text-muted text-xs text-center mt-2">Die 10 besten von {routeOptions.length} Optionen</p>
                                    )}
                                </div>
                            )}

                            {/* Loading route */}
                            {loadingRoute && (
                                <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'3rem 0'}}>
                                    <CircleNotch weight="bold" className="pulse text-primary" style={{fontSize: '2rem', animation: 'spin 1s linear infinite'}} />
                                    <h3 className="font-bold">Route wird berechnet...</h3>
                                </div>
                            )}

                            {/* Route display */}
                            {routeData && !loadingRoute && (
                                <div>
                                    <div className="route-header">
                                        <button className="icon-btn mb-2" onClick={() => { if (isDirectTransit) { navigate(-1); return; } setRouteData(null); setSelectedParking(null); }}><CaretLeft weight="bold" /></button>
                                        {isDirectTransit && (
                                            <div className="direct-transit-banner">
                                                <Train weight="fill" /> Kein Auto erforderlich! Direktverbindung mit öffentlichen Verkehrsmitteln verfügbar.
                                            </div>
                                        )}
                                        <h3 className="text-center font-bold text-xl">{routeData.totalTime} Gesamtdauer</h3>
                                        <p className="text-center text-muted text-sm mb-4">{isDirectTransit ? destination : `${selectedParking?.parkingName} — ${MODE_NAME_DE[selectedMode] || selectedMode}`}</p>
                                        {hasJobTicket && (
                                            <div className="text-center mb-2">
                                                <div className="badge-transit-free"><Ticket weight="fill" /> Job-Ticket: ÖPNV ist kostenlos</div>
                                            </div>
                                        )}
                                        {!isDirectTransit && isNearDauerparkticketStation && (
                                            <div className="text-center mb-2">
                                                <div className="badge-free-badge"><MapPin weight="fill" /> Dauerparkticket: Kostenlos an {dauerparkticketStation}</div>
                                            </div>
                                        )}
                                        {!isDirectTransit && hasDauerparkticket && dauerparkticketStation && !isNearDauerparkticketStation && (
                                            <div className="text-center text-sm mb-2 text-muted">
                                                <MapPin weight="fill" className="text-primary" /> Dauerparkticket-Station: {dauerparkticketStation}
                                            </div>
                                        )}
                                        {selectedParking && (() => {
                                            const pd = getParkingDisplayPricing(selectedParking);
                                            if (isNearDauerparkticketStation) {
                                                return <div className="text-center mb-4"><span className="badge-free-badge">Kostenlos – Dauerparkticket</span></div>;
                                            }
                                            if (pd.isFree) {
                                                return <div className="text-center mb-4"><span className="badge-free-badge">{pd.label}</span></div>;
                                            }
                                            return (
                                                <div className="text-center mb-4 parking-rate-display">
                                                    <span className="badge-paid-display">{pd.label}</span>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    <div className="route-timeline">
                                        {routeData.timeline && routeData.timeline.map((leg, i) => (
                                            <div className="timeline-item" key={i}>
                                                <div className="time">{leg.time}</div>
                                                <div className="node-col">
                                                    <div className="step-icon">
                                                        {renderIcon(leg.mode)}
                                                        {leg.durationMin > 0 && <span className={`duration-badge ${leg.mode}`}>{leg.durationMin} Min.</span>}
                                                    </div>
                                                    {i !== routeData.timeline.length - 1 && <div className={`line ${leg.mode}-line`}></div>}
                                                </div>
                                                <div className="details">
                                                    <div className="title font-bold">
                                                        {(leg.name === 'Current Location' || leg.name === 'Mein Standort') ? effectiveStartLocation : leg.name}
                                                    </div>
                                                    <div className="subtitle text-sm text-muted">{leg.details}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {!isDirectTransit && (
                                        <button className="btn btn-outline w-100 mt-6 mb-2" onClick={() => handleEmailReservation(routeData.parkingName)}>Parkplatzreservierung</button>
                                    )}
                                    <button className="btn btn-primary btn-large w-100 mb-4 shadow-glow" onClick={handleStartNavigation}>Navigation starten</button>
                                </div>
                            )}

                        </div>
                    </div>
                    )}
                </>
            )}
        </div>
    );
};

export default Results;
