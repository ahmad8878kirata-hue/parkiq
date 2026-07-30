import { useState, useEffect, useRef, useCallback } from 'react';
import './AutocompleteInput.css';

const AutocompleteInput = ({
    placeholder = '',
    value = '',
    onChange,
    onSelect,
    className = '',
    autoFocus = false,
    requiredPostalCode = true
}) => {
    const [suggestions, setSuggestions] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const debounceRef = useRef(null);
    const inputRef = useRef(null);
    const dropdownRef = useRef(null);

    const fetchSuggestions = useCallback(async (query) => {
        if (!query || query.trim().length < 2) {
            setSuggestions([]);
            setShowDropdown(false);
            return;
        }
        try {
            const res = await fetch(
                `http://localhost:5000/api/geocode/search?format=json&q=${encodeURIComponent(query.trim())}&addressdetails=1&limit=5&countrycodes=de`
            );
            if (!res.ok) return;
            const data = await res.json();
            const filtered = requiredPostalCode
                ? data.filter(item => item.address?.postcode)
                : data;
            setSuggestions(filtered);
            setShowDropdown(filtered.length > 0);
        } catch {
            setSuggestions([]);
            setShowDropdown(false);
        }
    }, [requiredPostalCode]);

    const handleInputChange = (e) => {
        const val = e.target.value;
        onChange?.(e);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
        setActiveIndex(-1);
    };

    const selectSuggestion = (item) => {
        const name = item.display_name || item.name || '';
        const coords = [parseFloat(item.lat), parseFloat(item.lon)];
        const addr = item.address || {};
        const syntheticEvent = { target: { value: name } };
        onChange?.(syntheticEvent);
        onSelect?.({
            name,
            coordinates: coords,
            postcode: addr.postcode,
            city: addr.city || addr.town || addr.village || addr.county || '',
            road: addr.road || ''
        });
        setShowDropdown(false);
        setActiveIndex(-1);
        inputRef.current?.blur();
    };

    const handleKeyDown = (e) => {
        if (!showDropdown || suggestions.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            selectSuggestion(suggestions[activeIndex]);
        } else if (e.key === 'Escape') {
            setShowDropdown(false);
            setActiveIndex(-1);
        }
    };

    useEffect(() => {
        const handleClick = (e) => {
            if (
                dropdownRef.current && !dropdownRef.current.contains(e.target) &&
                inputRef.current && !inputRef.current.contains(e.target)
            ) {
                setShowDropdown(false);
                setActiveIndex(-1);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    useEffect(() => {
        return () => clearTimeout(debounceRef.current);
    }, []);

    return (
        <div className="autocomplete-wrapper">
            <input
                ref={inputRef}
                type="text"
                placeholder={placeholder}
                value={value}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
                className={className}
                autoFocus={autoFocus}
                autoComplete="off"
            />
            {showDropdown && suggestions.length > 0 && (
                <ul className="autocomplete-dropdown" ref={dropdownRef}>
                    {suggestions.map((item, index) => {
                        const addr = item.address || {};
                        const road = addr.road || addr.hamlet || addr.suburb || '';
                        const postcode = addr.postcode || '';
                        const city = addr.city || addr.town || addr.village || addr.county || '';
                        return (
                            <li
                                key={item.osm_id || index}
                                className={`autocomplete-item ${index === activeIndex ? 'active' : ''}`}
                                onClick={() => selectSuggestion(item)}
                                onMouseEnter={() => setActiveIndex(index)}
                            >
                                <span className="autocomplete-name">
                                    {road || item.name || item.display_name?.split(',')[0] || ''}
                                </span>
                                <span className="autocomplete-detail">
                                    {postcode ? `${postcode} ` : ''}{city}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default AutocompleteInput;
