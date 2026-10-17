const raw = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
export const API_BASE = raw;            // "" = dùng đường dẫn tương đối (dev qua proxy của Vite)
const loc = typeof location !== "undefined" ? location : { protocol: "http:", host: "localhost:5173" };
export const WS_BASE = raw
  ? raw.replace(/^http/, "ws")          // https → wss, http → ws
  : `${loc.protocol === "https:" ? "wss:" : "ws:"}//${loc.host}`;

// Bản đồ: style mặc định là OpenFreeMap Liberty (miễn phí, không cần key)
export const MAP_STYLE_URL: string =
  import.meta.env.VITE_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty";
export const CITY_CENTER: Record<string, { lat: number; lng: number }> = {
  HCM: { lat: 10.7769, lng: 106.7009 },
  HN: { lat: 21.0285, lng: 105.8542 },
};

export const GOOGLE_MAPS_BROWSER_KEY: string =
  import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY || "";
