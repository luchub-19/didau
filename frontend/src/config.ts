const raw = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
export const API_BASE = raw;            // "" = dùng đường dẫn tương đối (dev qua proxy của Vite)
const loc = typeof location !== "undefined" ? location : { protocol: "http:", host: "localhost:5173" };
export const WS_BASE = raw
  ? raw.replace(/^http/, "ws")          // https → wss, http → ws
  : `${loc.protocol === "https:" ? "wss:" : "ws:"}//${loc.host}`;
