import { useState } from 'react';
import { MapPin, Pencil, X, Plus, Check, WarningCircle } from '@phosphor-icons/react';
import { useParking } from '../context/ParkingContext';
import { geocodeFacilityAddress } from '../services/geocodingService';

let draftSeq = 0;

const DauerparkticketSettings = () => {
    const {
        hasDauerparkticket,
        dauerparkticketStations,
        addDauerparkticketFacility,
        updateDauerparkticketFacility,
        removeDauerparkticketFacility,
    } = useParking();

    const [drafts, setDrafts] = useState([]);
    const [errors, setErrors] = useState({});
    const [savingKey, setSavingKey] = useState(null);

    if (!hasDauerparkticket) return null;

    const addDraft = (facilityId = null, initial = '') => {
        setErrors({});
        setDrafts(prev => [...prev, { key: `d${++draftSeq}`, facilityId, value: initial }]);
    };

    const updateDraft = (key, value) => {
        setDrafts(prev => prev.map(d => d.key === key ? { ...d, value } : d));
        setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
    };

    const cancelDraft = (key) => {
        setDrafts(prev => prev.filter(d => d.key !== key));
        setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
    };

    const saveDraft = async (draft) => {
        const raw = String(draft.value || '').trim();
        if (!raw) {
            setErrors(prev => ({ ...prev, [draft.key]: 'Bitte geben Sie eine Adresse ein.' }));
            return;
        }
        setSavingKey(draft.key);
        try {
            const resolved = await geocodeFacilityAddress(raw);
            if (!resolved) {
                setErrors(prev => ({ ...prev, [draft.key]: 'Parkobjekt konnte nicht gefunden werden. Bitte überprüfen Sie den Namen.' }));
                return;
            }
            if (draft.facilityId) {
                updateDauerparkticketFacility(draft.facilityId, resolved.label, resolved.coordinates);
            } else {
                addDauerparkticketFacility(resolved.label, resolved.coordinates);
            }
            setDrafts(prev => prev.filter(d => d.key !== draft.key));
            setErrors(prev => { const next = { ...prev }; delete next[draft.key]; return next; });
        } catch (e) {
            console.error('Failed to geocode facility address:', e);
            setErrors(prev => ({ ...prev, [draft.key]: 'Adresse konnte nicht verifiziert werden. Bitte versuchen Sie es erneut.' }));
        } finally {
            setSavingKey(null);
        }
    };

    return (
        <div className="dauerparkticket-settings">
            {dauerparkticketStations.length > 0 && (
                <ul className="facility-list">
                    {dauerparkticketStations.map((facility, idx) => (
                        <li key={facility.id} className="facility-item">
                            <MapPin weight="fill" className="facility-icon" />
                            <span className="facility-label">
                                {idx === 0 && <span className="facility-primary-tag">Station</span>}
                                {facility.label}
                            </span>
                            <button
                                type="button"
                                className="icon-btn facility-action"
                                aria-label="Adresse bearbeiten"
                                onClick={() => addDraft(facility.id, facility.label)}
                            >
                                <Pencil size={14} />
                            </button>
                            <button
                                type="button"
                                className="icon-btn facility-action"
                                aria-label="Adresse entfernen"
                                onClick={() => removeDauerparkticketFacility(facility.id)}
                            >
                                <X size={14} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {drafts.map(draft => (
                <div key={draft.key} className="station-input-row facility-draft">
                    <input
                        type="text"
                        className="station-input"
                        placeholder="Name des Parkobjekts eingeben."
                        value={draft.value}
                        onChange={(e) => updateDraft(draft.key, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveDraft(draft); }}
                        autoFocus
                    />
                    <button
                        className="btn btn-sm btn-primary"
                        disabled={savingKey === draft.key}
                        onClick={() => saveDraft(draft)}
                    >
                        {savingKey === draft.key ? '...' : <Check size={14} weight="bold" />}
                    </button>
                    <button className="btn btn-sm btn-outline" onClick={() => cancelDraft(draft.key)}>
                        <X size={14} />
                    </button>
                    {errors[draft.key] && (
                        <div className="address-error"><WarningCircle size={14} /> {errors[draft.key]}</div>
                    )}
                </div>
            ))}

            {drafts.length === 0 && (
                <button className="btn btn-sm btn-outline w-100" onClick={() => addDraft()}>
                    <Plus size={14} /> Adresse hinzufügen
                </button>
            )}

            <p className="address-hint">
                Name des Parkobjekts eingeben.
            </p>
        </div>
    );
};

export default DauerparkticketSettings;