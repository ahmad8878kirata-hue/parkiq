import { useNavigate } from 'react-router-dom';
import { useParking } from '../context/ParkingContext';
import { Clock, Calendar, CheckCircle, UserCheck } from '@phosphor-icons/react';
import './Selection.css';

const Selection = () => {
    const navigate = useNavigate();
    const { setParkingType, isRegistered, setIsRegistered } = useParking();

    const handleSelect = (type) => {
        setParkingType(type);
        navigate('/home');
    };

    return (
        <div className="view selection-view">
            <div className="selection-header">
                <h1 className="logo-text">Park<span>IQ</span></h1>
                <p className="selection-subtitle">Choose your parking style</p>
            </div>

            <div className="selection-container">
                <div className="selection-card kurz" onClick={() => handleSelect('kurz')}>
                    <div className="selection-icon">
                        <Clock weight="fill" />
                    </div>
                    <div className="selection-content">
                        <h3>Kurzzeitparker</h3>
                        <p>Perfect for shopping, meetings, or short visits. Hourly rates apply.</p>
                        <div className="selection-tag">Short-term</div>
                    </div>
                </div>

                <div className="selection-card dauer" onClick={() => handleSelect('dauer')}>
                    <div className="selection-icon">
                        <Calendar weight="fill" />
                    </div>
                    <div className="selection-content">
                        <h3>Dauerparker</h3>
                        <p>For daily commuters and regular customers. Monthly and weekly options.</p>
                        <div className="selection-tag">Permanent</div>
                    </div>
                </div>
            </div>

            <div className="registration-status-card glass-panel">
                <div className="flex-between w-100">
                    <div className="flex-align-center gap-3">
                        <div className={`status-dot ${isRegistered ? 'active' : ''}`}>
                            <UserCheck weight="bold" />
                        </div>
                        <div>
                            <div className="font-semibold text-sm">Already a customer?</div>
                            <div className="text-xs text-muted">Unlock exclusive rates & discounts</div>
                        </div>
                    </div>
                    <label className="toggle-switch">
                        <input 
                            type="checkbox" 
                            checked={isRegistered} 
                            onChange={(e) => setIsRegistered(e.target.checked)}
                        />
                        <span className="slider round"></span>
                    </label>
                </div>
                {isRegistered && (
                    <div className="registration-badge">
                        <CheckCircle weight="fill" /> Business/Student Rates Active
                    </div>
                )}
            </div>
            
            <div className="selection-footer">
                <p>Prices include VAT and are subject to availability.</p>
            </div>
        </div>
    );
};

export default Selection;
