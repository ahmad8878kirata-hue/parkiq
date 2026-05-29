import { Sparkle, X } from '@phosphor-icons/react';
import './SpecialOfferToast.css';

const SpecialOfferToast = ({ message, onClose }) => {
    return (
        <div className="special-offer-toast">
            <div className="toast-icon">
                <Sparkle weight="fill" />
            </div>
            <div className="toast-content">
                <div className="toast-title">Special Rate Available!</div>
                <div className="toast-message">{message}</div>
            </div>
            <button className="toast-close" onClick={onClose}>
                <X weight="bold" />
            </button>
        </div>
    );
};

export default SpecialOfferToast;
