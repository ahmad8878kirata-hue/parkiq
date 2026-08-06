import { createContext, useContext, useState } from 'react';

const ParkingContext = createContext();

export const ParkingProvider = ({ children }) => {
    const [parkingType, setParkingType] = useState('kurz');
    const [hasDauerparkticket, setHasDauerparkticket] = useState(false);
    const [hasJobTicket, setHasJobTicket] = useState(false);
    const [dauerparkticketStation, setDauerparkticketStation] = useState('');
    const [dauerparkticketStationCoords, setDauerparkticketStationCoords] = useState(null);
    const [locationEnabled, setLocationEnabled] = useState(null);
    const [analyticsEnabled, setAnalyticsEnabled] = useState(true);

    return (
        <ParkingContext.Provider value={{
            parkingType, setParkingType,
            hasDauerparkticket, setHasDauerparkticket,
            hasJobTicket, setHasJobTicket,
            dauerparkticketStation, setDauerparkticketStation,
            dauerparkticketStationCoords, setDauerparkticketStationCoords,
            locationEnabled, setLocationEnabled,
            analyticsEnabled, setAnalyticsEnabled
        }}>
            {children}
        </ParkingContext.Provider>
    );
};

export const useParking = () => useContext(ParkingContext);
