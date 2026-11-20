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
  globeFrame,
  globeLonAt,
  isGlobeOnScreen,
  markGlobeOnScreen,
  resetGlobeClock,
  setGlobeSpeed,
  signalGlobe,
} from '../stage/hero/globe/clock';
import {
  advance,
  FAST_SEEK_MS,
  GLOBE_PARK,
  initialChoreo,
  isStill,
  normLon,
  PIN_TOTAL,
  pinPose,
  planSeek,
  RUSH,
  seekDistance,
  seekDurationMs,
  seekVelocity,
  type ChoreoEvents,
  type ChoreoState,
} from '../stage/hero/globe/choreo';

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

// ——— T-113: biên đạo ———
const EV = (style = false, tiles = false, ready = false): ChoreoEvents => ({ style, tiles, ready });
/** Khoảng cách góc nhỏ nhất (độ) giữa hai kinh độ. */
const lonGap = (a: number, b: number) => Math.abs(normLon(a - b));

/** Chạy `advance` với bước `dt` cho tới khi `stop` hoặc quá `maxMs`; ghi lại từng khung. */
function play(s0: ChoreoState, ev: (t: number) => ChoreoEvents, stop: (s: ChoreoState) => boolean, dt = 1000 / 30, maxMs = 10_000) {
  const frames: { t: number; s: ChoreoState }[] = [];
  let s = s0;
  for (let t = 0; t <= maxMs; t += dt) {
    s = advance(s, dt, ev(t));
    frames.push({ t, s });
    if (stop(s)) break;
  }
  return frames;
}

describe('T-113: quay về TP.HCM (seek)', () => {
  it('quãng quay luôn theo chiều Trái Đất quay, ≥ 100°, thời lượng clamp(0,8 + dist/360, 1,1, 2,0) s', () => {
    for (const lon of [-180, -60, 0, 20, 106.7, 110, 150, 179]) {
      const d = seekDistance(lon);
      expect(d).toBeGreaterThanOrEqual(100);
      expect(d).toBeLessThan(460);
      expect(lonGap(lon - d, GLOBE_PARK.lon)).toBeLessThan(1e-9);
      const ms = seekDurationMs(d);
      expect(ms).toBeGreaterThanOrEqual(1100);
      expect(ms).toBeLessThanOrEqual(2000);
    }
    expect(seekDurationMs(100)).toBe(1100);
    expect(seekDurationMs(360)).toBe(1800);
    expect(seekDurationMs(450)).toBe(2000);
  });

  it.each([-170, -45, 0, 20, 100, 107, 140])('xuất phát ở %s°: dừng đúng 106,7°E / 10,8°N, không quay ngược, xong trong 1,1–2,0 s', (lon0) => {
    const frames = play(initialChoreo(lon0, 22, GLOBE_SPEED_FULL), () => EV(true), (s) => s.phase === 'parked');
    const end = frames[frames.length - 1].s;
    expect(end.phase).toBe('parked');
    expect(lonGap(end.lon, 106.7)).toBeLessThan(0.5);
    expect(Math.abs(end.lat - 10.8)).toBeLessThan(0.5);
    // kinh độ tâm nhìn chỉ giảm (dlon ≤ 0 từng khung, trừ khung cuối đặt đúng toạ độ)
    for (let i = 1; i < frames.length - 1; i++) expect(frames[i].s.lon).toBeLessThanOrEqual(frames[i - 1].s.lon + 1e-9);
    const seekMs = frames.filter((f) => f.s.phase === 'seek').length * (1000 / 30);
    expect(seekMs).toBeGreaterThanOrEqual(1100 - 34);
    expect(seekMs).toBeLessThanOrEqual(2000 + 34);
  });

  it('vận tốc lúc bắt đầu seek khớp vận tốc xoay (không khựng), cả full lẫn lite', () => {
    for (const speed of [GLOBE_SPEED_FULL, GLOBE_SPEED_SLOW]) {
      const seek = planSeek(20, 22, speed, false);
      expect(seekVelocity(seek, 0)).toBeCloseTo(speed, 6);
      expect(seekVelocity(seek, 1)).toBeCloseTo(0, 6);
      // đo bằng khung thật: 1 ms quay đều rồi 1 ms đầu của seek
      const spun = advance(initialChoreo(20, 22, speed), 1, EV());
      const started = advance(spun, 0, EV(true));
      const first = advance(started, 1, EV(true));
      expect((spun.lon - first.lon) / 0.001).toBeCloseTo(speed, 0);
      expect(20 - spun.lon).toBeCloseTo(speed / 1000, 9);
    }
  });

  it('`tiles` tới trước khi dừng: ghim chờ tới lúc `parked` mới bắt đầu', () => {
    const frames = play(initialChoreo(0, 22, GLOBE_SPEED_FULL), () => EV(true, true), (s) => s.phase === 'pin');
    const phases = [...new Set(frames.map((f) => f.s.phase))];
    expect(phases).toEqual(['seek', 'parked', 'pin']);
    const pin = frames[frames.length - 1].s;
    expect(pin.pinT).toBe(0);
    expect(pin.friends).toBe(true);
  });

  it('chưa `ready` thì đứng ở ghim mãi (gợn sóng lặp), không tự kết thúc', () => {
    const frames = play(initialChoreo(0, 22, GLOBE_SPEED_FULL), () => EV(true, true), () => false, 1000 / 30, 8000);
    const last = frames[frames.length - 1].s;
    expect(last.phase).toBe('pin');
    expect(last.pinT).toBeGreaterThan(PIN_TOTAL);
    expect(isStill(last, false)).toBe(false); // còn gợn sóng ⇒ vẫn vẽ
    expect(isStill(last, true)).toBe(true); // lite: đứng yên ⇒ bỏ vẽ
    expect(isStill({ ...last, phase: 'parked' }, false)).toBe(true);
  });
});

describe('T-113: ghim, bản đồ xong (rush) và mạng rất nhanh', () => {
  it('`ready` trong lúc ghim: phần còn lại chạy ×2,6 rồi `done`', () => {
    let s: ChoreoState = { ...initialChoreo(GLOBE_PARK.lon, GLOBE_PARK.lat, 45), phase: 'pin', pinT: 400 };
    let ms = 0;
    while (s.phase !== 'done' && ms < 5000) {
      s = advance(s, 10, EV(true, true, true));
      ms += 10;
    }
    expect(s.phase).toBe('done');
    expect(ms).toBeLessThanOrEqual(Math.ceil((PIN_TOTAL - 400) / RUSH / 10) * 10);
    expect(s.friends).toBe(true);
  });

  it('`ready` khi đang xoay (chưa kịp quay về): quay nhanh ≤ 500 ms, không quay ngược, bỏ chấm bạn bè, xong ngay khi dừng', () => {
    for (const lon0 of [-100, 0, 20, 107, 110]) {
      const frames = play(initialChoreo(lon0, 22, GLOBE_SPEED_FULL), () => EV(true, true, true), (s) => s.phase === 'done', 10);
      const end = frames[frames.length - 1];
      expect(end.s.phase).toBe('done');
      expect(end.s.friends).toBe(false);
      expect(end.t).toBeLessThanOrEqual(FAST_SEEK_MS + 20);
      expect(lonGap(end.s.lon, 106.7)).toBeLessThan(0.5);
      for (let i = 1; i < frames.length - 1; i++) expect(frames[i].s.lon).toBeLessThanOrEqual(frames[i - 1].s.lon + 1e-9);
      expect(frames.some((f) => f.s.phase === 'pin')).toBe(false);
    }
  });

  it('`ready` giữa lúc seek dài: phần còn lại rút về ≤ 500 ms, giữ vận tốc (không khựng), vẫn dừng đúng TP.HCM', () => {
    let s = advance(initialChoreo(20, 22, GLOBE_SPEED_FULL), 0, EV(true));
    const dur = (s.seek as NonNullable<ChoreoState['seek']>).durMs;
    expect(dur).toBeGreaterThan(1500);
    for (let t = 0; t < 300; t += 10) s = advance(s, 10, EV(true));
    const vBefore = seekVelocity(s.seek!, s.seek!.p);
    const lonBefore = s.lon;
    s = advance(s, 0, EV(true, true, true)); // lập lại, chưa đi
    expect(s.lon).toBeCloseTo(lonBefore, 9);
    expect(seekVelocity(s.seek!, 0)).toBeCloseTo(vBefore, 6);
    expect(s.seek!.durMs).toBeLessThanOrEqual(FAST_SEEK_MS);
    let ms = 0;
    let prev = s.lon;
    while (s.phase !== 'done' && ms < 2000) {
      s = advance(s, 10, EV(true, true, true));
      if (s.phase === 'seek') expect(s.lon).toBeLessThanOrEqual(prev + 1e-9);
      prev = s.lon;
      ms += 10;
    }
    expect(ms).toBeLessThanOrEqual(FAST_SEEK_MS + 20);
    expect(lonGap(s.lon, 106.7)).toBeLessThan(0.5);
    expect(s.friends).toBe(false);
  });

  it('seek gần xong khi `ready` tới (còn < 500 ms) thì giữ nguyên đường cũ', () => {
    let s = advance(initialChoreo(20, 22, GLOBE_SPEED_FULL), 0, EV(true));
    const plan = s.seek!;
    for (let t = 0; t < plan.durMs - 300; t += 10) s = advance(s, 10, EV(true));
    const next = advance(s, 10, EV(true, true, true));
    expect(next.seek!.durMs).toBe(plan.durMs);
    expect(next.seek!.fromLon).toBe(plan.fromLon);
  });

  it('dáng ghim: nảy rồi đứng (full), hiện thẳng không nảy (lite / nhánh nhanh)', () => {
    expect(pinPose(0, false).lift).toBe(0);
    expect(pinPose(175, false).bounce).toBeGreaterThan(0);
    expect(pinPose(350, false)).toMatchObject({ lift: 1 });
    expect(pinPose(350, false).bounce).toBeCloseTo(0, 9);
    expect(pinPose(0, true)).toEqual({ bounce: 0, lift: 1, pulse: 1 });
  });
});

describe('T-113: biên đạo trong đồng hồ chung', () => {
  afterEach(() => resetGlobeClock());

  it('còn xoay thì góc = đồng hồ giải tích; `style` tới ⇒ seek bắt đầu đúng góc đang đứng (không nhảy)', () => {
    setGlobeSpeed(GLOBE_SPEED_FULL, 0);
    signalGlobe('code', 0);
    expect(globeFrame(1000).phase).toBe('spin');
    expect(globeFrame(1000).lon).toBeCloseTo(globeLonAt(1000), 9);
    signalGlobe('style', 1500);
    const f = globeFrame(1500);
    expect(f.phase).toBe('seek');
    expect(lonGap(f.lon, globeLonAt(1500))).toBeLessThan(1e-9);
    // hai instance gọi cùng thời điểm không đếm thời gian hai lần
    const a = globeFrame(1600).lon;
    expect(globeFrame(1600).lon).toBeCloseTo(a, 9);
  });

  it('đi hết: style → tiles → ready ⇒ done; quay lại trang chủ (mốc lùi) ⇒ xoay lại từ TP.HCM', () => {
    setGlobeSpeed(GLOBE_SPEED_FULL, 0);
    signalGlobe('loading', 0);
    signalGlobe('code', 100);
    signalGlobe('style', 200);
    signalGlobe('tiles', 1000);
    let t = 200;
    let f = globeFrame(t);
    while (f.phase !== 'pin' && t < 5000) f = globeFrame((t += 33));
    expect(f.phase).toBe('pin');
    signalGlobe('ready', t);
    while (f.phase !== 'done' && t < 8000) f = globeFrame((t += 33));
    expect(f.phase).toBe('done');
    signalGlobe('loading', t + 10);
    const again = globeFrame(t + 10);
    expect(again.phase).toBe('spin');
    expect(lonGap(again.lon, GLOBE_PARK.lon)).toBeLessThan(1e-6);
    expect(globeFrame(t + 1010).lon).toBeCloseTo(normLon(GLOBE_PARK.lon - 45), 6);
  });
});

describe('T-113: màu chấm bạn bè', () => {
  it('4 chấm = sky, leaf, sun, brick của theme đang dùng', () => {
    const r = reader(sections.light);
    const pal = readGlobePalette(r, false);
    expect(pal.friends).toEqual(['--stage-sky', '--stage-leaf', '--stage-sun', '--stage-brick'].map((t) => parseRgbToken(r(t))));
    expect(readGlobePalette(() => '', true).friends[1]).toEqual([147, 197, 139]);
  });
});
