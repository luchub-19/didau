// Suy thành phố (HCM/HN) từ toạ độ bằng khung chữ nhật thô — đủ để chọn khu vực dữ liệu quán, không dùng để định vị chính xác.
export type CityGuess = 'HCM' | 'HN';

const BOXES: { city: CityGuess; minLat: number; maxLat: number; minLng: number; maxLng: number }[] = [
  { city: 'HCM', minLat: 10.3, maxLat: 11.2, minLng: 106.3, maxLng: 107.1 },
  { city: 'HN', minLat: 20.7, maxLat: 21.4, minLng: 105.5, maxLng: 106.2 },
];

/** `null` khi toạ độ ngoài cả hai khung → nơi gọi giữ ô chọn thành phố. */
export function cityFromCoords(lat: number, lng: number): CityGuess | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const hit = BOXES.find((b) => lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng);
  return hit ? hit.city : null;
}
