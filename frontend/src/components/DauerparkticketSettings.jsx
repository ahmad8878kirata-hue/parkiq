import { useState, useRef, useEffect } from 'react';
import { MapPin, Pencil, X, Plus, Check, WarningCircle, MagnifyingGlass } from '@phosphor-icons/react';
import { useParking } from '../context/ParkingContext';
import { geocodeFacilityAddress } from '../services/geocodingService';
import { API_BASE } from '../config';

let draftSeq = 0;

const toLabel = (facility) =>
    facility?.label || [facility?.name, facility?.address].filter(Boolean).join(', ') || null;

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

    const [suggestions, setSuggestions] = useState([]);
    const [suggestKey, setSuggestKey] = useState(null);
    const [suggestOpen, setSuggestOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [searching, setSearching] = useState(false);
    const [picked, setPicked] = useState({});
    const [pendingSuggestion, setPendingSuggestion] = useState({});

    const suggestTimer = useRef(null);
    const blurTimer = useRef(null);

    useEffect(() => {
        return () => { clearTimeout(suggestTimer.current); clearTimeout(blurTimer.current); };
    }, []);

    if (!hasDauerparkticket) return null;

    const addDraft = (facilityId = null, initial = '') => {
        setErrors({});
        setSuggestions([]);
        setSuggestOpen(false);
        setDrafts(prev => [...prev, { key: `d${++draftSeq}`, facilityId, value: initial }]);
    };

    const clearSuggestions = () => {
        setSuggestions([]);
        setSuggestOpen(false);
        setActiveIndex(-1);
        setSuggestKey(null);
        setSearching(false);
    };

    const updateDraft = (key, value) => {
        setDrafts(prev => prev.map(d => d.key === key ? { ...d, value } : d));
        setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
        setPendingSuggestion(prev => { const next = { ...prev }; delete next[key]; return next; });
        setPicked(prev => { const next = { ...prev }; delete next[key]; return next; });

        clearTimeout(suggestTimer.current);
        setSuggestKey(key);
        const q = String(value || '').trim();
        if (q.length < 2) {
            clearSuggestions();
            return;
        }
        setSearching(true);
        suggestTimer.current = setTimeout(async () => {
            try {
                const res = await fetch(`${API_BASE}/api/parking/search?q=${encodeURIComponent(q)}`);
                if (!res.ok) throw new Error(res.status);
                const json = await res.json();
                if (!json.success) return;
                const list = (json.facilities || []).slice(0, 6);
                setSuggestions(list);
                setSuggestOpen(list.length > 0);
                setActiveIndex(-1);
            } catch (e) {
                clearSuggestions();
            } finally {
                setSearching(false);
            }
        }, 260);
    };

    const pickSuggestion = (key, facility) => {
        const label = toLabel(facility);
        if (!label) return;
        setDrafts(prev => prev.map(d => d.key === key ? { ...d, value: label } : d));
        setPicked(prev => ({ ...prev, [key]: { label, coordinates: [facility.lat, facility.lng] } }));
        clearSuggestions();
    };

    const commitFacility = (key, label, coordinates, facilityId) => {
        if (facilityId) {
            updateDauerparkticketFacility(facilityId, label, coordinates);
        } else {
            addDauerparkticketFacility(label, coordinates);
        }
        setDrafts(prev => prev.filter(d => d.key !== key));
        setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
        setPicked(prev => { const next = { ...prev }; delete next[key]; return next; });
        setPendingSuggestion(prev => { const next = { ...prev }; delete next[key]; return next; });
    };

    const applyPendingSuggestion = (key, facilityId) => {
        const candidate = pendingSuggestion[key];
        if (!candidate) return;
        const label = toLabel(candidate);
        if (!label) return;
        commitFacility(key, label, [candidate.lat, candidate.lng], facilityId);
    };

    const saveDraft = async (draft) => {
        const raw = String(draft.value || '').trim();
        if (!raw) {
            setErrors(prev => ({ ...prev, [draft.key]: 'Bitte geben Sie eine Adresse ein.' }));
            return;
        }
        const pk = picked[draft.key];
        if (pk) {
            commitFacility(draft.key, pk.label, pk.coordinates, draft.facilityId);
            return;
        }
        clearSuggestions();
        setSavingKey(draft.key);
        try {
            const res = await fetch(`${API_BASE}/api/parking/search?q=${encodeURIComponent(raw)}`);
            if (!res.ok) throw new Error(res.status);
            const json = await res.json();
            const best = (json.facilities || [])[0];
            if (best && best.score >= 80) {
                commitFacility(draft.key, toLabel(best), [best.lat, best.lng], draft.facilityId);
            } else if (best && best.score >= 30) {
                const label = toLabel(best);
                setErrors(prev => ({ ...prev, [draft.key]: `Parkobjekt eindeutig? Meinten Sie "${label}"?` }));
                setPendingSuggestion(prev => ({ ...prev, [draft.key]: best }));
            } else {
                const resolved = await geocodeFacilityAddress(raw);
                if (!resolved) {
                    setErrors(prev => ({ ...prev, [draft.key]: 'Parkobjekt konnte nicht gefunden werden. Bitte wählen Sie einen Vorschlag aus der Liste.' }));
                } else {
                    commitFacility(draft.key, resolved.label || raw, resolved.coordinates, draft.facilityId);
                }
            }
        } catch (e) {
            console.error('Failed to resolve facility:', e);
            setErrors(prev => ({ ...prev, [draft.key]: 'Adresse konnte nicht verifiziert werden. Bitte versuchen Sie es erneut.' }));
        } finally {
            setSavingKey(null);
        }
    };

    const handleDraftKeyDown = (e, draft) => {
        if (e.key === 'Enter') {
            if (suggestOpen && activeIndex >= 0 && suggestions[activeIndex]) {
                e.preventDefault();
                pickSuggestion(draft.key, suggestions[activeIndex]);
            } else {
                e.preventDefault();
                saveDraft(draft);
            }
        } else if (e.key === 'ArrowDown') {
            if (suggestOpen && suggestions.length > 0) {
                e.preventDefault();
                setActiveIndex(i => (i + 1) % suggestions.length);
            }
        } else if (e.key === 'ArrowUp') {
            if (suggestOpen && suggestions.length > 0) {
                e.preventDefault();
                setActiveIndex(i => (i <= 0 ? suggestions.length - 1 : i - 1));
            }
        } else if (e.key === 'Escape') {
            clearSuggestions();
        }
    };

    const cancelDraft = (key) => {
        setDrafts(prev => prev.filter(d => d.key !== key));
        setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
        setPicked(prev => { const next = { ...prev }; delete next[key]; return next; });
        setPendingSuggestion(prev => { const next = { ...prev }; delete next[key]; return next; });
        clearSuggestions();
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
                    <div className="facility-autocomplete">
                        <input
                            type="text"
                            className="station-input"
                            placeholder="Name des Parkobjekts eingeben."
                            value={draft.value}
                            onChange={(e) => updateDraft(draft.key, e.target.value)}
                            onKeyDown={(e) => handleDraftKeyDown(e, draft)}
                            onFocus={() => { if (suggestions.length > 0) setSuggestOpen(true); }}
                            onBlur={() => {
                                blurTimer.current = setTimeout(() => { setSuggestOpen(false); setSuggestKey(null); }, 150);
                            }}
                            autoComplete="off"
                            autoFocus
                        />
                        {searching && <MagnifyingGlass className="facility-search-spinner" size={14} />}
                        {suggestOpen && suggestKey === draft.key && suggestions.length > 0 && (
                            <ul className="facility-suggestions">
                                {suggestions.map((facility, idx) => (
                                    <li
                                        key={`${facility.id || idx}-${idx}`}
                                        className={`facility-suggestion ${idx === activeIndex ? 'active' : ''}`}
                                        onMouseDown={(e) => { e.preventDefault(); pickSuggestion(draft.key, facility); }}
                                        onMouseEnter={() => setActiveIndex(idx)}
                                    >
                                        <span className="facility-suggestion-line">
                                            <MapPin size={13} className="facility-suggestion-icon" />
                                            <span className="facility-suggestion-label">{facility.name || toLabel(facility) || 'Unbenanntes Parkobjekt'}</span>
                                        </span>
                                        <span className="facility-suggestion-sub">{facility.address || ''}</span>
                                    </li>
                                ))}
                                {searching && <li className="facility-suggestion muted">Suche…</li>}
                            </ul>
                        )}
                    </div>
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
                    {pendingSuggestion[draft.key] && (
                        <button
                            type="button"
                            className="facility-suggestion-apply"
                            onClick={() => applyPendingSuggestion(draft.key, draft.facilityId)}
                        >
                            <Check size={13} weight="bold" /> Dieses Parkobjekt übernehmen: {toLabel(pendingSuggestion[draft.key])}
                        </button>
                    )}
                </div>
            ))}

            {drafts.length === 0 && (
                <button className="btn btn-sm btn-outline w-100" onClick={() => addDraft()}>
                    <Plus size={14} /> Adresse hinzufügen
                </button>
            )}

            <p className="address-hint">
                Name des Parkobjekts eingeben – Vorschläge direkt aus den Parkdaten auswählen.
            </p>
        </div>
    );
};

export default DauerparkticketSettings;