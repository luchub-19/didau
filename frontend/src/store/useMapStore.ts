import { create } from 'zustand';
import { poiApi } from '../services/api/poiApi';
import type { Poi } from '../types';

/** Kích thước ô lưới cache (độ). Backend giới hạn bbox ≤ 0,2° mỗi chiều. */
export const GRID_DEG = 0.02;
/** Số ô tối đa mỗi chiều trong một request (9 × 0,02° = 0,18° < 0,2°). */
export const BLOCK_CELLS = 9;
/** Tối đa số request cho một lần di chuyển bản đồ. */
const MAX_REQUESTS_PER_MOVE = 6;

export interface Bounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export type MapSelection = { kind: 'poi'; id: string } | { kind: 'place'; id: string } | null;

const cellIndex = (deg: number) => Math.floor(Number((deg / GRID_DEG).toFixed(6)));
const cellEdge = (idx: number) => Number((idx * GRID_DEG).toFixed(6));

export const cellKey = (ix: number, iy: number) => `${ix}:${iy}`;

/** `bbox` theo CONTRACTS: min_lat,min_lng,max_lat,max_lng. */
export const bboxParam = (b: Bounds) => `${b.minLat},${b.minLng},${b.maxLat},${b.maxLng}`;

/** Các ô lưới (lat = hàng, lng = cột) phủ kín khung nhìn. */
export function cellsForBounds(b: Bounds): { ix: number; iy: number }[] {
  const cells: { ix: number; iy: number }[] = [];
  for (let iy = cellIndex(b.minLat); iy <= cellIndex(b.maxLat); iy++) {
    for (let ix = cellIndex(b.minLng); ix <= cellIndex(b.maxLng); ix++) {
      cells.push({ ix, iy });
    }
  }
  return cells;
}

export interface FetchPlan {
  bbox: Bounds;
  cellKeys: string[];
}

/**
 * Gom các ô chưa tải thành vài bbox ≤ 0,18°: mỗi khối BLOCK_CELLS×BLOCK_CELLS ô
 * một request, bbox của request là hình chữ nhật bao các ô thiếu trong khối đó.
 */
export function planFetches(b: Bounds, loaded: Record<string, true>): FetchPlan[] {
  const blocks = new Map<string, { ix: number; iy: number }[]>();
  for (const c of cellsForBounds(b)) {
    if (loaded[cellKey(c.ix, c.iy)]) continue;
    const bk = `${Math.floor(c.ix / BLOCK_CELLS)}:${Math.floor(c.iy / BLOCK_CELLS)}`;
    const list = blocks.get(bk) ?? [];
    list.push(c);
    blocks.set(bk, list);
  }
  return [...blocks.values()].map((cells) => {
    const xs = cells.map((c) => c.ix);
    const ys = cells.map((c) => c.iy);
    return {
      bbox: {
        minLng: cellEdge(Math.min(...xs)),
        minLat: cellEdge(Math.min(...ys)),
        maxLng: cellEdge(Math.max(...xs) + 1),
        maxLat: cellEdge(Math.max(...ys) + 1),
      },
      cellKeys: cells.map((c) => cellKey(c.ix, c.iy)),
    };
  });
}

/** Gộp POI mới vào cache theo `external_id` (bản mới ghi đè bản cũ, giữ `distance_km` nếu có). */
export function mergePois(existing: Record<string, Poi>, incoming: Poi[]): Record<string, Poi> {
  if (incoming.length === 0) return existing;
  const next = { ...existing };
  for (const p of incoming) next[p.external_id] = { ...existing[p.external_id], ...p };
  return next;
}

/** Khoảng cách đường chim bay (km). */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(bLat - aLat) / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

interface MapState {
  poisById: Record<string, Poi>;
  loadedCells: Record<string, true>;
  selection: MapSelection;
  searchQuery: string;
  searchResults: Poi[];
  isLoading: boolean;
  isSearching: boolean;
  error: string | null;

  loadBounds: (bounds: Bounds) => Promise<void>;
  search: (q: string, near?: { lat: number; lng: number }) => Promise<Poi[]>;
  selectPoi: (externalId: string | null) => void;
  selectPlace: (placeId: string | null) => void;
  clearSearch: () => void;
  reset: () => void;
}

const initial = {
  poisById: {},
  loadedCells: {},
  selection: null,
  searchQuery: '',
  searchResults: [],
  isLoading: false,
  isSearching: false,
  error: null,
};

export const useMapStore = create<MapState>((set, get) => ({
  ...initial,

  loadBounds: async (bounds) => {
    const plans = planFetches(bounds, get().loadedCells).slice(0, MAX_REQUESTS_PER_MOVE);
    if (plans.length === 0) return;
    set({ isLoading: true, error: null });
    await Promise.all(
      plans.map(async (plan) => {
        try {
          const pois = await poiApi.listPois({ bbox: bboxParam(plan.bbox), limit: 1000 });
          set((s) => ({
            poisById: mergePois(s.poisById, pois),
            loadedCells: {
              ...s.loadedCells,
              ...Object.fromEntries(plan.cellKeys.map((k) => [k, true as const])),
            },
          }));
        } catch (err: unknown) {
          set({ error: (err as { message?: string })?.message || 'Không tải được địa điểm.' });
        }
      }),
    );
    set({ isLoading: false });
  },

  search: async (q, near) => {
    const query = q.trim();
    set({ searchQuery: query });
    if (!query) {
      set({ searchResults: [], isSearching: false });
      return [];
    }
    set({ isSearching: true });
    try {
      const results = await poiApi.searchPois({ q: query, lat: near?.lat, lng: near?.lng, limit: 8 });
      // Bỏ kết quả cũ nếu người dùng đã gõ tiếp
      if (get().searchQuery !== query) return results;
      set((s) => ({
        searchResults: results,
        poisById: mergePois(s.poisById, results),
        isSearching: false,
      }));
      return results;
    } catch {
      set({ searchResults: [], isSearching: false });
      return [];
    }
  },

  selectPoi: (externalId) =>
    set({ selection: externalId ? { kind: 'poi', id: externalId } : null }),
  selectPlace: (placeId) =>
    set({ selection: placeId ? { kind: 'place', id: placeId } : null }),
  clearSearch: () => set({ searchQuery: '', searchResults: [] }),
  reset: () => set({ ...initial }),
}));
