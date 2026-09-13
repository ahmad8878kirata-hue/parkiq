import { createContext, useContext, useState } from 'react';

const ParkingContext = createContext();

const newId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

export const ParkingProvider = ({ children }) => {
    const [parkingType, setParkingType] = useState('kurz');
    const [hasDauerparkticket, setHasDauerparkticket] = useState(false);
    const [hasJobTicket, setHasJobTicket] = useState(false);
    const [dauerparkticketStations, setDauerparkticketStations] = useState([]);
    const [locationEnabled, setLocationEnabled] = useState(null);
    const [analyticsEnabled, setAnalyticsEnabled] = useState(true);

    const addDauerparkticketFacility = (label, coordinates) => {
        const normalized = String(label || '').trim();
        if (!normalized) return;
        setDauerparkticketStations(prev =>
            prev.some(s => s.label.toLowerCase() === normalized.toLowerCase())
                ? prev
                : [...prev, { id: newId(), label: normalized, coordinates: coordinates || null }]
        );
    };

    const updateDauerparkticketFacility = (id, label, coordinates) => {
        const normalized = String(label || '').trim();
        if (!normalized) return;
        setDauerparkticketStations(prev => prev.map(s =>
            s.id === id ? { ...s, label: normalized, coordinates: coordinates || null } : s
        ));
    };

    const removeDauerparkticketFacility = (id) => {
        setDauerparkticketStations(prev => prev.filter(s => s.id !== id));
    };

    const primary = dauerparkticketStations[0] || null;

    return (
        <ParkingContext.Provider value={{
            parkingType, setParkingType,
            hasDauerparkticket, setHasDauerparkticket,
            hasJobTicket, setHasJobTicket,
            dauerparkticketStations,
            dauerparkticketStation: primary?.label || '',
            dauerparkticketStationCoords: primary?.coordinates || null,
            addDauerparkticketFacility,
            updateDauerparkticketFacility,
            removeDauerparkticketFacility,
            locationEnabled, setLocationEnabled,
            analyticsEnabled, setAnalyticsEnabled
        }}>
            {children}
        </ParkingContext.Provider>
    );
};

export const useParking = () => useContext(ParkingContext);