import { createContext, useContext, useState } from 'react';

const ParkingContext = createContext();

export const ParkingProvider = ({ children }) => {
    const [parkingType, setParkingType] = useState('kurz');
    const [isRegistered, setIsRegistered] = useState(false);
    const [locationEnabled, setLocationEnabled] = useState(null); // null=undecided, true=enabled, false=not now

    return (
        <ParkingContext.Provider value={{ parkingType, setParkingType, isRegistered, setIsRegistered, locationEnabled, setLocationEnabled }}>
            {children}
        </ParkingContext.Provider>
    );
};

export const useParking = () => useContext(ParkingContext);
