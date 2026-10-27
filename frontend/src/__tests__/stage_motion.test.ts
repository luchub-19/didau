import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  parseMotionOverride,
  setMotionOverride,
  getTimeScale,
  SLOW_TIME_SCALE,
} from '../motion/debug';
import { DURATION_FALLBACK, EASING_FALLBACK, duration, parseCssDuration } from '../motion/tokens';
import {
  resolveMotionTier,
  lowerTier,
  createFpsGuard,
  getMotionTier,
  downgradeMotionTier,
  resetMotionTierForTest,
  type TierEnv,
} from '../motion/useMotionTier';
import { MOTION_PRESETS, MOTION_PRESET_NAMES, resolvePreset, motionAttrs } from '../motion/presets';

const strongDevice: TierEnv = {
  override: null,
  reducedMotion: false,
  webgl: true,
  cores: 8,
  memoryGb: 8,
};

describe('T-58: motion/debug (?motion=)', () => {
  afterEach(() => setMotionOverride(null));

  it('đọc đúng slow / off / lite, bỏ qua giá trị lạ', () => {
    expect(parseMotionOverride('?motion=slow')).toBe('slow');
    expect(parseMotionOverride('?tab=map&motion=off')).toBe('off');
    expect(parseMotionOverride('?motion=lite')).toBe('lite');
    expect(parseMotionOverride('?motion=fast')).toBeNull();
    expect(parseMotionOverride('')).toBeNull();
    expect(parseMotionOverride(undefined)).toBeNull();
  });

  it('?motion=slow nhân mọi thời lượng lên 4', () => {
    expect(getTimeScale()).toBe(1);
    expect(duration('swipe')).toBe(DURATION_FALLBACK.swipe);
    setMotionOverride('slow');
    expect(getTimeScale()).toBe(SLOW_TIME_SCALE);
    expect(duration('swipe')).toBe(DURATION_FALLBACK.swipe * SLOW_TIME_SCALE);
  });
});

describe('T-58: motion/useMotionTier', () => {
  afterEach(() => resetMotionTierForTest());

  it('máy mạnh, đủ WebGL → full', () => {
    expect(resolveMotionTier(strongDevice)).toBe('full');
  });

  it('prefers-reduced-motion → static', () => {
    expect(resolveMotionTier({ ...strongDevice, reducedMotion: true })).toBe('static');
  });

  it('không có WebGL → static (poster, không bản đồ động)', () => {
    expect(resolveMotionTier({ ...strongDevice, webgl: false })).toBe('static');
  });

  it('máy yếu (≤4 nhân hoặc ≤4 GB) → lite', () => {
    expect(resolveMotionTier({ ...strongDevice, cores: 4 })).toBe('lite');
    expect(resolveMotionTier({ ...strongDevice, memoryGb: 2 })).toBe('lite');
    expect(resolveMotionTier({ ...strongDevice, cores: undefined, memoryGb: undefined })).toBe('full');
  });

  it('tham số URL thắng mọi thứ: off → static, lite → lite kể cả khi reduced-motion', () => {
    expect(resolveMotionTier({ ...strongDevice, override: 'off' })).toBe('static');
    expect(resolveMotionTier({ ...strongDevice, override: 'lite' })).toBe('lite');
    expect(resolveMotionTier({ ...strongDevice, override: 'lite', reducedMotion: true })).toBe('lite');
    // slow chỉ đổi tốc độ, không đổi mức
    expect(resolveMotionTier({ ...strongDevice, override: 'slow' })).toBe('full');
    expect(resolveMotionTier({ ...strongDevice, override: 'slow', reducedMotion: true })).toBe('static');
  });

  it('hạ cấp chỉ đi xuống', () => {
    expect(lowerTier('full', 'lite')).toBe('lite');
    expect(lowerTier('static', 'full')).toBe('static');
    // Môi trường test (node) không có WebGL → static; xin hạ "lên" full không có tác dụng
    expect(getMotionTier()).toBe('static');
    downgradeMotionTier('full', 'test');
    expect(getMotionTier()).toBe('static');
  });

  it('bộ canh FPS: < 40 fps liên tục 2 giây mới báo, tab ẩn không tính', () => {
    const guard = createFpsGuard(40, 2000);
    let t = 0;
    let tripped = guard.frame(t);
    // 30 fps trong ~1,9 giây: chưa báo
    for (let i = 0; i < 57; i++) {
      t += 33;
      tripped = guard.frame(t) || tripped;
    }
    expect(tripped).toBe(false);
    // Một khung 60 fps chen vào → đếm lại
    t += 16;
    guard.frame(t);
    for (let i = 0; i < 50; i++) {
      t += 33;
      tripped = guard.frame(t) || tripped;
    }
    expect(tripped).toBe(false);
    for (let i = 0; i < 20; i++) {
      t += 33;
      tripped = guard.frame(t) || tripped;
    }
    expect(tripped).toBe(true);

    const hidden = createFpsGuard(40, 2000);
    hidden.frame(0);
    expect(hidden.frame(5000)).toBe(false);
  });
});

describe('T-58: motion/presets', () => {
  afterEach(() => setMotionOverride(null));

  it('có đủ 6 preset đã đặt tên trong PLAN §4', () => {
    expect(MOTION_PRESET_NAMES.sort()).toEqual(
      ['decide.reveal', 'hero.intro', 'hero.shot', 'presence.pulse', 'tab.switch', 'vote.flyIn', 'vote.swipe'].sort(),
    );
  });

  it('thời lượng mỗi preset nằm trong chuỗi tối đa của khoảnh khắc', () => {
    for (const name of MOTION_PRESET_NAMES) {
      const p = MOTION_PRESETS[name];
      expect(DURATION_FALLBACK[p.duration], name).toBeLessThanOrEqual(p.maxSequenceMs);
      expect(EASING_FALLBACK[p.easing], name).toBeTruthy();
    }
  });

  it('static bỏ di chuyển, lite rút ngắn, full giữ nguyên', () => {
    const full = resolvePreset('decide.reveal', 'full');
    const lite = resolvePreset('decide.reveal', 'lite');
    const stat = resolvePreset('decide.reveal', 'static');
    expect(full.move).toBe(true);
    expect(full.durationMs).toBe(DURATION_FALLBACK.reveal);
    expect(lite.move).toBe(true);
    expect(lite.durationMs).toBeLessThan(full.durationMs);
    expect(stat.move).toBe(false);
    expect(stat.durationMs).toBe(DURATION_FALLBACK.ui);
  });

  it('motionAttrs gắn data-motion đúng tên', () => {
    expect(motionAttrs('vote.swipe')).toEqual({ 'data-motion': 'vote.swipe' });
  });
});

describe('T-58: token CSS và JS khớp nhau', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../styles/tokens.css'), 'utf8');

  it('mỗi thời lượng dự phòng trong tokens.ts bằng giá trị --t-* ở :root', () => {
    for (const [name, ms] of Object.entries(DURATION_FALLBACK)) {
      const m = new RegExp(`--t-${name}:\\s*([^;]+);`).exec(css);
      expect(m, `--t-${name}`).not.toBeNull();
      expect(parseCssDuration(m![1]), `--t-${name}`).toBe(ms);
    }
  });

  it('parseCssDuration hiểu ms và s', () => {
    expect(parseCssDuration('280ms')).toBe(280);
    expect(parseCssDuration('1.4s')).toBe(1400);
    expect(parseCssDuration('abc')).toBeNull();
  });

  it('palette Stage có mặt ở cả sáng và hai khối tối', () => {
    expect(css.match(/--stage-paper:/g)?.length).toBe(3);
    expect(css.match(/--stage-ink:/g)?.length).toBe(3);
  });
});
