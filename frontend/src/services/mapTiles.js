import L from 'leaflet';

const TRANSPARENT_TILE =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const BASE_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const createBaseTileLayer = () =>
    L.tileLayer(BASE_TILE_URL, {
        maxZoom: 19,
        attribution: OSM_ATTRIBUTION,
        errorTileUrl: TRANSPARENT_TILE
    });

const handleMapTileErrors = (map, { onError, onRecover } = {}) => {
    let offline = false;
    let errorCount = 0;
    let recoverTimer = null;

    map.on('tileerror', (e) => {
        errorCount += 1;
        console.error('Map tile/API error:', e?.error || e?.tile?.src || e, `(retry ${errorCount})`);
        if (!offline) {
            offline = true;
            onError?.();
        }
    });

    map.on('tileload', () => {
        if (!offline) return;
        clearTimeout(recoverTimer);
        recoverTimer = setTimeout(() => {
            offline = false;
            errorCount = 0;
            onRecover?.();
        }, 800);
    });
};

const MAP_DARK_FILTER = 'invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9)';

const setMapDarkMode = (map, dark) => {
    if (!map) return;
    const pane = map.getPane('tilePane');
    if (!pane) return;
    pane.style.filter = dark ? MAP_DARK_FILTER : '';
};

export { TRANSPARENT_TILE, BASE_TILE_URL, createBaseTileLayer, handleMapTileErrors, setMapDarkMode };