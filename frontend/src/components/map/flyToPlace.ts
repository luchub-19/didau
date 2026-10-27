// Cửa nhỏ để lớp ngoài (màn công bố quán, T-61) bay bản đồ phòng tới một quán mà không import chunk MapView.
// MapView đăng ký khi bản đồ sẵn sàng; tab Bản đồ chưa mở hoặc đang ẩn thì flyToPlace trả false.

export interface MapFlyTarget {
  lng: number;
  lat: number;
  zoom: number;
  pitch: number;
  /** Độ xoay thêm so với hướng hiện tại (độ). */
  bearingDelta: number;
  durationMs: number;
  /** Dịch tâm theo trục dọc (px, âm = quán nằm cao hơn giữa khung) để thẻ không che ghim. */
  offsetY: number;
}

export interface MapFlyer {
  fly: (target: MapFlyTarget) => void;
  /** Bản đồ đang hiện trên màn hình (không bị display:none / kích thước 0). */
  isVisible: () => boolean;
}

let active: MapFlyer | null = null;

export function registerMapFlyer(flyer: MapFlyer): () => void {
  active = flyer;
  return () => {
    if (active === flyer) active = null;
  };
}

/** Có bản đồ phòng đang hiện để bay tới quán này không (quán phải có toạ độ). */
export function canFlyToPlace(place: { latitude?: number | null; longitude?: number | null }): boolean {
  return Boolean(active && active.isVisible() && place.latitude != null && place.longitude != null);
}

export function flyToPlace(
  place: { latitude?: number | null; longitude?: number | null },
  opts: Omit<MapFlyTarget, 'lng' | 'lat'>,
): boolean {
  if (!active || !canFlyToPlace(place)) return false;
  active.fly({ ...opts, lng: place.longitude as number, lat: place.latitude as number });
  return true;
}
