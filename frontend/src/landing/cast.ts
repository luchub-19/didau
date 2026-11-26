// Dàn nhân vật của landing (gđ11, PLAN §3 mục 10): đúng ca demo gđ8. Tên nhân vật chỉ nằm ở file này
// (và chuỗi i18n dùng chung tên) để đổi một lần là xong nếu bị hỏi bản quyền.
// CR-11: bốn bạn chỉ gắn với MÃ QUẬN, không bao giờ có toạ độ nhà; toạ độ quận đại diện nằm ở data/demoCase.json (T-122).
import { characterDataUri } from '../components/ui/characterAvatar';

/** 12 quận có chip "Bạn ở quận nào?" (nhãn ở i18n `landing.district.*`). */
export const DISTRICT_CODES = ['q1', 'q3', 'q5', 'q7', 'bt', 'pn', 'tb', 'gv', 'td', 'q12', 'btn', 'nb'] as const;
export type DistrictCode = (typeof DISTRICT_CODES)[number];

export type CastId = 'Nobita' | 'Doraemon' | 'Xuka' | 'Xeko';

export interface CastMember {
  /** Tên hiển thị kiêm seed avatar (không dịch). */
  id: CastId;
  /** Quận xuất phát, chỉ cấp quận (CR-11). */
  district: DistrictCode;
  /** Màu xe trên phố đêm (trang trí, không mang nghĩa). */
  rideColor: string;
  /** Chủ phòng của phòng mẫu. */
  host?: boolean;
}

/** Thứ tự cố định: chủ phòng trước, rồi theo thứ tự xuất hiện ở mock v3. */
export const CAST: readonly CastMember[] = [
  { id: 'Nobita', district: 'q1', rideColor: '#F2B544', host: true },
  { id: 'Doraemon', district: 'bt', rideColor: '#7CC4E8' },
  { id: 'Xuka', district: 'td', rideColor: '#F29BB8' },
  { id: 'Xeko', district: 'q7', rideColor: '#9AD1B9' },
];

export const HOST: CastMember = CAST.find((m) => m.host) ?? CAST[0];

/**
 * Seed avatar của người xem ("Bạn", người thứ 5). Viết bằng mã thoát để file nguồn không có chữ có dấu
 * (i18n_guard); nhãn hiển thị lấy từ `landing.you`.
 */
export const YOU_SEED = 'B\u1EA1n';

/** Màu nhận diện điểm "Bạn" trên bản đồ: coral = "nhóm mình / hành động chính" (PLAN §4.2). */
export const YOU_COLOR = 'rgb(var(--color-accent))';

export function castMember(id: CastId): CastMember {
  const m = CAST.find((c) => c.id === id);
  if (!m) throw new Error(`unknown cast id: ${id}`);
  return m;
}

/** Avatar DiceBear "thumbs" (CC0) của một nhân vật, hoặc của người xem khi `id` là `YOU_SEED`. */
export function avatarFor(id: CastId | typeof YOU_SEED): string {
  return characterDataUri(id);
}
