// Chunk lười của landing: chỉ file này import maplibre-gl + CSS của nó, nên chunk chính của trang chủ không kéo
// thư viện bản đồ (PLAN §4.6). Gọi qua `loadMap()` trong ./index.ts, không import thẳng ở nơi khác.
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export default maplibregl;
