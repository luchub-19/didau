import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { GLOBE_MASK_H, GLOBE_MASK_RLE, GLOBE_MASK_W } from '../stage/hero/globe/mask';
import { buildDots, decodeMask, dotStepDeg, GLOBE_HCM, isLand, project } from '../stage/hero/globe/projection';
import {
  GLOBE_SPEED_FULL,
  GLOBE_SPEED_SLOW,
  GLOBE_START_LON,
  globeLonAt,
  isGlobeOnScreen,
  markGlobeOnScreen,
  resetGlobeClock,
  setGlobeSpeed,
} from '../stage/hero/globe/clock';

describe('T-110: bitmask đất liền', () => {
  it('giải RLE đủ 360×180 ô, tỉ lệ đất hợp lý (~29 % bề mặt, ô vuông độ nên cao hơn)', () => {
    const m = decodeMask(GLOBE_MASK_RLE, GLOBE_MASK_W, GLOBE_MASK_H);
    expect(m.length).toBe(64800);
    const land = m.reduce((a, b) => a + b, 0);
    expect(land / m.length).toBeGreaterThan(0.25);
    expect(land / m.length).toBeLessThan(0.45);
  });

  it('dữ liệu mask gửi đi ≤ 2 kB gzip', () => {
    expect(gzipSync(GLOBE_MASK_RLE).length).toBeLessThanOrEqual(2048);
  });

  it('isLand đúng ở các điểm mốc', () => {
    expect(isLand(GLOBE_HCM.lat, GLOBE_HCM.lon)).toBe(true); // TP.HCM
    expect(isLand(21.03, 105.85)).toBe(true); // Hà Nội
    expect(isLand(23, 13)).toBe(true); // Sahara
    expect(isLand(-25, 134)).toBe(true); // giữa Úc
    expect(isLand(66.5, 100)).toBe(true); // Siberia (hàng từng bị lật chẵn-lẻ do vòng vắt qua 180°)
    expect(isLand(0, -150)).toBe(false); // giữa Thái Bình Dương
    expect(isLand(-30, -20)).toBe(false); // Nam Đại Tây Dương
    expect(isLand(12, 113)).toBe(false); // Biển Đông
    expect(isLand(-89, 0)).toBe(true); // Nam Cực
  });

  it('kinh độ tự quấn, vĩ độ ngoài khoảng không lỗi', () => {
    expect(isLand(GLOBE_HCM.lat, GLOBE_HCM.lon + 360)).toBe(true);
    expect(isLand(GLOBE_HCM.lat, GLOBE_HCM.lon - 720)).toBe(true);
    expect(() => isLand(95, 0)).not.toThrow();
    expect(() => isLand(-95, 0)).not.toThrow();
  });
});

describe('T-110: chấm và phép chiếu', () => {
  it('số chấm theo bán kính nằm trong khoảng hợp lý, cầu lớn nhiều chấm hơn', () => {
    const mobile = buildDots(60);
    const desktop = buildDots(84);
    expect(mobile.count).toBeGreaterThan(800);
    expect(mobile.count).toBeLessThan(2500);
    expect(desktop.count).toBeGreaterThan(mobile.count);
    expect(desktop.count).toBeLessThan(4500);
    expect(dotStepDeg(1)).toBe(4);
    expect(dotStepDeg(10_000)).toBe(1);
  });

  it('điểm ở tâm nhìn có z = 1, điểm ở mặt sau có z ≤ 0', () => {
    const c = project({ lat: 10, lon: 100 }, 100, 10);
    expect(c.x).toBeCloseTo(0, 6);
    expect(c.y).toBeCloseTo(0, 6);
    expect(c.z).toBeCloseTo(1, 6);
    expect(project({ lat: -10, lon: -80 }, 100, 10).z).toBeLessThanOrEqual(0); // đối cực
    expect(project({ lat: 0, lon: -60 }, 100, 0).z).toBeLessThanOrEqual(0);
    expect(project({ lat: 0, lon: 190 }, 100, 0).z).toBeCloseTo(0, 6); // đúng mép
  });

  it('phía đông lệch phải, phía bắc lệch lên; mọi điểm nằm trong đĩa đơn vị', () => {
    expect(project({ lat: 0, lon: 130 }, 100, 0).x).toBeGreaterThan(0);
    expect(project({ lat: 30, lon: 100 }, 100, 0).y).toBeGreaterThan(0);
    for (const [lat, lon] of [[45, 10], [-60, 170], [80, -120]]) {
      const q = project({ lat, lon }, 20, 22);
      expect(q.x * q.x + q.y * q.y + q.z * q.z).toBeCloseTo(1, 5);
    }
  });
});

describe('T-110: đồng hồ chung (nối hai instance)', () => {
  afterEach(() => resetGlobeClock());

  it('bắt đầu ở góc khởi đầu, quay 45°/s về phía tây', () => {
    setGlobeSpeed(GLOBE_SPEED_FULL, 1000);
    expect(globeLonAt(1000)).toBeCloseTo(GLOBE_START_LON, 6);
    expect(globeLonAt(2000)).toBeCloseTo(GLOBE_START_LON - 45, 6);
    expect(globeLonAt(1000 + 8000)).toBeCloseTo(GLOBE_START_LON, 6); // 8 s một vòng
  });

  it('instance thứ hai gọi lại setGlobeSpeed cùng tốc độ không đặt lại góc', () => {
    setGlobeSpeed(GLOBE_SPEED_FULL, 0); // fallback của Hero
    const before = globeLonAt(1500);
    setGlobeSpeed(GLOBE_SPEED_FULL, 1500); // HeroScroll mount
    expect(globeLonAt(1500)).toBeCloseTo(before, 6);
    expect(globeLonAt(1600)).toBeCloseTo(before - 4.5, 6);
  });

  it('đổi tốc độ (full → lite) giữ nguyên góc tại thời điểm đổi', () => {
    setGlobeSpeed(GLOBE_SPEED_FULL, 0);
    const at = globeLonAt(2000);
    setGlobeSpeed(GLOBE_SPEED_SLOW, 2000);
    expect(globeLonAt(2000)).toBeCloseTo(at, 6);
    expect(globeLonAt(3000)).toBeCloseTo(at - GLOBE_SPEED_SLOW, 6);
  });

  it('góc luôn trong [−180, 180)', () => {
    setGlobeSpeed(GLOBE_SPEED_FULL, 0);
    for (const t of [0, 3333, 12_345, 99_999]) {
      const lon = globeLonAt(t);
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThan(180);
    }
  });

  it('cờ "đang hiện" đếm theo instance, huỷ hai lần không âm', () => {
    expect(isGlobeOnScreen()).toBe(false);
    const a = markGlobeOnScreen();
    const b = markGlobeOnScreen();
    a();
    a();
    expect(isGlobeOnScreen()).toBe(true);
    b();
    expect(isGlobeOnScreen()).toBe(false);
  });
});
