import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { GLOBE_MASK_H, GLOBE_MASK_RLE, GLOBE_MASK_W } from '../stage/hero/globe/mask';
import { advanceStage, isPendingStage, nextStage, ringProgress, statusKey, type GlobeState } from '../stage/hero/globe/progress';
import {
  CITY_FRACTION,
  GLOBE_LEVELS,
  GLOBE_LIGHT,
  GLOBE_TOKENS,
  isCityLight,
  lambert,
  levelColors,
  parseRgbToken,
  readGlobePalette,
  shadeLevel,
  type RGB,
} from '../stage/hero/globe/palette';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

describe('T-112: mốc tải và vòng tiến độ', () => {
  it('mốc đúng PLAN §4.1: 0 / 22 / 48 / 76 / 100 %', () => {
    expect(['loading', 'code', 'style', 'tiles', 'ready'].map((s) => ringProgress(s as GlobeState, false))).toEqual([0, 0.22, 0.48, 0.76, 1]);
  });

  it('nhích dần nhưng không bao giờ vượt/đạt mốc kế khi chưa tới mốc', () => {
    for (const s of ['loading', 'code', 'style', 'tiles'] as const) {
      const next = nextStage(s)!;
      const creep = ringProgress(s, true);
      expect(creep).toBeGreaterThan(ringProgress(s, false));
      expect(creep).toBeLessThan(ringProgress(next, false));
    }
    expect(ringProgress('ready', true)).toBe(1);
    expect(ringProgress('failed', true)).toBe(0);
  });

  it('khoá chữ theo mốc; failed/loading dùng dòng bắt đầu', () => {
    expect(statusKey('loading')).toBe('hero.globe.start');
    expect(statusKey('code')).toBe('hero.globe.code');
    expect(statusKey('tiles')).toBe('hero.globe.tiles');
    expect(statusKey('ready')).toBe('hero.globe.ready');
  });

  it('advanceStage chỉ đi tới; ready/failed là cuối', () => {
    expect(advanceStage('code', 'style')).toBe('style');
    expect(advanceStage('tiles', 'style')).toBe('tiles'); // callback tới lệch thứ tự
    expect(advanceStage('style', 'tiles')).toBe('tiles');
    expect(advanceStage('ready', 'tiles')).toBe('ready');
    expect(advanceStage('failed', 'style')).toBe('failed');
  });

  it('isPendingStage: cầu còn cần hiện ở mọi mốc trước ready', () => {
    expect((['loading', 'code', 'style', 'tiles'] as const).every(isPendingStage)).toBe(true);
    expect(isPendingStage('ready')).toBe(false);
    expect(isPendingStage('failed')).toBe(false);
  });
});

// ——— T-111: ánh sáng, khí quyển, đèn thành phố ———
const tokensCss = readFileSync(fileURLToPath(new URL('../styles/tokens.css', import.meta.url)), 'utf8');
const darkAt = tokensCss.indexOf(':root[data-theme="dark"]');
const mediaAt = tokensCss.indexOf('@media (prefers-color-scheme: dark)');
// Ba đoạn: theme sáng (trước khối dark), theme tối khai báo tay, theme tối theo hệ điều hành.
const sections = { light: tokensCss.slice(0, darkAt), dark: tokensCss.slice(darkAt, mediaAt), system: tokensCss.slice(mediaAt) };
const reader = (css: string) => (name: string) => css.match(new RegExp(`${name}:\\s*([0-9 ]+);`))?.[1] ?? '';
const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe('T-111: bảng màu đọc từ token Stage', () => {
  it('cả hai theme khai báo đủ token cầu cần, đều là bộ ba RGB hợp lệ', () => {
    for (const [name, css] of Object.entries(sections)) {
      for (const tok of GLOBE_TOKENS) {
        expect(parseRgbToken(reader(css)(tok)), `${tok} @ ${name}`).not.toBeNull();
      }
    }
  });

  it('theme tối theo hệ điều hành khớp theme tối khai báo tay (cầu không lệch màu giữa hai đường)', () => {
    for (const tok of GLOBE_TOKENS) expect(reader(sections.system)(tok)).toBe(reader(sections.dark)(tok));
  });

  it('sáng: không đèn thành phố, đất lấy từ ink-2; tối: có đèn màu --stage-sun, biển tối hơn, đất sáng hơn', () => {
    const light = readGlobePalette(reader(sections.light), false);
    const dark = readGlobePalette(reader(sections.dark), true);
    expect(light.night).toBeNull();
    expect(light.land).toEqual(parseRgbToken(reader(sections.light)('--stage-ink-2')));
    expect(dark.night).toEqual(parseRgbToken(reader(sections.dark)('--stage-sun')));
    expect(lum(dark.seaDark)).toBeLessThan(lum(light.seaDark));
    expect(lum(dark.land)).toBeGreaterThan(lum(light.land));
    for (const pal of [light, dark]) expect(lum(pal.landLit)).toBeGreaterThan(lum(pal.land) - 1);
  });

  it('token trống/hỏng thì lùi về giá trị mặc định của theme, không ném lỗi', () => {
    const pal = readGlobePalette(() => 'không phải màu', true);
    expect(pal.night).toEqual([255, 201, 77]);
    expect(parseRgbToken('300 1 1')).toBeNull();
    expect(parseRgbToken('1 2')).toBeNull();
    expect(parseRgbToken(' 233 164 0 ')).toEqual([233, 164, 0]);
  });
});

describe('T-111: lambert và lượng tử hoá mức sáng', () => {
  it('hướng nắng chuẩn hoá, nằm phía trên-trái và hướng về người xem', () => {
    expect(Math.hypot(...GLOBE_LIGHT)).toBeCloseTo(1, 6);
    expect(GLOBE_LIGHT[0]).toBeLessThan(0);
    expect(GLOBE_LIGHT[1]).toBeGreaterThan(0);
    expect(GLOBE_LIGHT[2]).toBeGreaterThan(0);
    expect(lambert(...GLOBE_LIGHT)).toBeCloseTo(1, 6);
    expect(lambert(-GLOBE_LIGHT[0], -GLOBE_LIGHT[1], -GLOBE_LIGHT[2])).toBeCloseTo(-1, 6);
  });

  it('shadeLevel trả đúng số mức, đơn điệu, chạm cả hai đầu', () => {
    expect(GLOBE_LEVELS).toBeLessThanOrEqual(6);
    for (const levels of [3, GLOBE_LEVELS]) {
      const seen = new Set<number>();
      let prev = -1;
      for (let lam = -1; lam <= 1.0001; lam += 0.005) {
        const k = shadeLevel(lam, levels);
        expect(k).toBeGreaterThanOrEqual(0);
        expect(k).toBeLessThan(levels);
        expect(k).toBeGreaterThanOrEqual(prev);
        prev = k;
        seen.add(k);
      }
      expect(seen.size).toBe(levels);
    }
    expect(shadeLevel(-5)).toBe(0);
    expect(shadeLevel(5)).toBe(GLOBE_LEVELS - 1);
  });

  it('levelColors trả đúng số màu, từ màu tối đến màu hứng nắng', () => {
    const pal = readGlobePalette(reader(sections.dark), true);
    const colors = levelColors(pal);
    expect(colors).toHaveLength(GLOBE_LEVELS);
    expect(new Set(colors).size).toBe(GLOBE_LEVELS);
    const first = colors[0].match(/\d+/g)!.map(Number);
    const last = colors[GLOBE_LEVELS - 1].match(/\d+/g)!.map(Number);
    expect(first[0]).toBeLessThan(last[0]);
  });
});

describe('T-111: đèn thành phố', () => {
  const dark = readGlobePalette(reader(sections.dark), true);
  const light = readGlobePalette(reader(sections.light), false);

  it('chỉ ở theme tối và phía đêm; phía sáng không đèn', () => {
    expect(isCityLight(dark, 0.01, -0.5)).toBe(true);
    expect(isCityLight(dark, 0.01, 0.5)).toBe(false);
    expect(isCityLight(light, 0.01, -0.5)).toBe(false);
    expect(isCityLight(dark, CITY_FRACTION + 0.01, -0.5)).toBe(false);
  });

  it('chọn theo hash tất định: chấm dựng hai lần cho cùng tập đèn, tỉ lệ ≈ 18 %', () => {
    const a = buildDots(84);
    const b = buildDots(84);
    expect(Array.from(a.hash)).toEqual(Array.from(b.hash));
    const lit = Array.from(a.hash).filter((h) => h < CITY_FRACTION).length / a.count;
    expect(lit).toBeGreaterThan(0.12);
    expect(lit).toBeLessThan(0.25);
  });
});
