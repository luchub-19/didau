import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, afterEach } from 'vitest';
import '../i18n';
import i18n from 'i18next';
import { cubicBezier, easingFn, parseCubicBezier } from '../motion/bezier';
import { resolvePreset } from '../motion/presets';
import { setMotionOverride } from '../motion/debug';
import {
  cameraAt,
  HERO_SHOTS,
  HERO_STOPS,
  SHOT_HOLD,
  shotIndexAt,
  shotStarts,
  stopsRoute,
  type HeroShot,
} from '../stage/hero/shots';
import { Hero } from '../stage/hero/Hero';
import { HomePage } from '../pages/HomePage';

const noop = () => {};
const camOf = (s: HeroShot) => ({ center: s.center, zoom: s.zoom, pitch: s.pitch, bearing: s.bearing });

function expectCamera(actual: ReturnType<typeof cameraAt>, expected: ReturnType<typeof cameraAt>) {
  expect(actual.center[0]).toBeCloseTo(expected.center[0], 6);
  expect(actual.center[1]).toBeCloseTo(expected.center[1], 6);
  expect(actual.zoom).toBeCloseTo(expected.zoom, 6);
  expect(actual.pitch).toBeCloseTo(expected.pitch, 6);
  expect(actual.bearing).toBeCloseTo(expected.bearing, 6);
}

describe('T-59: kịch bản hero (shots.ts)', () => {
  it('5 cảnh đúng thứ tự PLAN §6, cảnh 1 nhìn thẳng xuống, cảnh 2–4 nghiêng 3D', () => {
    expect(HERO_SHOTS.map((s) => s.id)).toEqual(['overview', 'market', 'walkingStreet', 'stops', 'night']);
    expect(HERO_SHOTS[0]).toMatchObject({ zoom: 13, pitch: 0 });
    for (const s of HERO_SHOTS.slice(1, 4)) {
      expect(s.zoom).toBeGreaterThanOrEqual(14); // lớp building-3d có minzoom 14
      expect(s.pitch).toBeGreaterThanOrEqual(60);
    }
  });

  it('cameraAt: đầu phim = cảnh 1, cuối phim = cảnh 5', () => {
    expectCamera(cameraAt(0), camOf(HERO_SHOTS[0]));
    expectCamera(cameraAt(1), camOf(HERO_SHOTS[4]));
  });

  it('cameraAt: ngoài khoảng hoặc NaN thì kẹp về đầu/cuối', () => {
    expectCamera(cameraAt(-0.5), camOf(HERO_SHOTS[0]));
    expectCamera(cameraAt(1.7), camOf(HERO_SHOTS[4]));
    expectCamera(cameraAt(Number.NaN), camOf(HERO_SHOTS[0]));
  });

  it('cameraAt: phần đứng yên của mỗi cảnh giữ đúng camera cảnh đó', () => {
    const starts = shotStarts();
    for (let i = 0; i < HERO_SHOTS.length - 1; i++) {
      const span = starts[i + 1] - starts[i];
      expectCamera(cameraAt(starts[i] + span * SHOT_HOLD * 0.5), camOf(HERO_SHOTS[i]));
      expect(shotIndexAt(starts[i] + span * 0.5)).toBe(i);
    }
  });

  it('cameraAt: giữa hai cảnh thì nằm giữa (zoom, pitch), easing camera đối xứng', () => {
    const starts = shotStarts();
    const span = starts[1] - starts[0];
    const mid = starts[0] + span * (SHOT_HOLD + (1 - SHOT_HOLD) / 2);
    const cam = cameraAt(mid);
    const [a, b] = HERO_SHOTS;
    expect(cam.zoom).toBeCloseTo((a.zoom + b.zoom) / 2, 3);
    expect(cam.pitch).toBeCloseTo((a.pitch + b.pitch) / 2, 3);
    // Tiến độ tăng thì zoom không giảm trong đoạn 1 → 2 (13 → 16)
    let prev = -Infinity;
    for (let k = 0; k <= 20; k++) {
      const z = cameraAt(starts[0] + (span * k) / 20).zoom;
      expect(z).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = z;
    }
  });

  it('cameraAt: bearing đi đường ngắn nhất qua 180°', () => {
    const shots: HeroShot[] = [
      { ...HERO_SHOTS[0], bearing: 170, durationWeight: 1 },
      { ...HERO_SHOTS[1], bearing: -170, durationWeight: 1 },
    ];
    const mid = 0.5 * (SHOT_HOLD + (1 - SHOT_HOLD) / 2);
    expect(Math.abs(cameraAt(mid, shots).bearing)).toBeCloseTo(180, 3);
  });

  it('3 chặng là quán thật OSM, theo thứ tự giờ trong khung 17:00–23:00, gần nhau', () => {
    expect(HERO_STOPS.map((s) => s.id)).toEqual(['eat', 'coffee', 'after']);
    for (const s of HERO_STOPS) expect(s.externalId).toMatch(/^osm:node\/\d+$/);
    expect(HERO_STOPS[0].startMinute).toBe(1020);
    expect(HERO_STOPS[HERO_STOPS.length - 1].endMinute).toBe(1380);
    for (let i = 1; i < HERO_STOPS.length; i++) {
      expect(HERO_STOPS[i].startMinute).toBeGreaterThanOrEqual(HERO_STOPS[i - 1].endMinute);
      // dưới ~1 km giữa hai chặng liền nhau (1° vĩ độ ≈ 111 km)
      const d = Math.hypot(HERO_STOPS[i].lat - HERO_STOPS[i - 1].lat, HERO_STOPS[i].lng - HERO_STOPS[i - 1].lng) * 111;
      expect(d).toBeLessThan(1);
    }
    expect(stopsRoute().geometry.coordinates).toHaveLength(3);
  });
});

describe('T-59: easing cubic-bezier cho camera', () => {
  it('đọc chuỗi CSS, chuỗi hỏng trả null', () => {
    expect(parseCubicBezier('cubic-bezier(0.65, 0, 0.35, 1)')).toEqual([0.65, 0, 0.35, 1]);
    expect(parseCubicBezier('ease-in')).toBeNull();
  });

  it('đầu/cuối đúng 0 và 1, đường thẳng là đồng nhất, --ease-camera đối xứng', () => {
    const linear = cubicBezier(0, 0, 1, 1);
    expect(linear(0.3)).toBeCloseTo(0.3, 5);
    const cam = easingFn('camera');
    expect(cam(0)).toBe(0);
    expect(cam(1)).toBe(1);
    expect(cam(0.5)).toBeCloseTo(0.5, 4);
    expect(cam(0.25) + cam(0.75)).toBeCloseTo(1, 4);
  });

  it("mức 'lite': mỗi cảnh flyTo khoảng 1,2 s", () => {
    const lite = resolvePreset('hero.shot', 'lite');
    expect(lite.move).toBe(true);
    expect(lite.durationMs).toBeGreaterThanOrEqual(1150);
    expect(lite.durationMs).toBeLessThanOrEqual(1250);
  });
});

describe('T-59: mức chuyển động → thành phần hero', () => {
  afterEach(async () => {
    setMotionOverride(null);
    await i18n.changeLanguage('vi');
  });

  const props = { header: <header />, onCreate: noop, onJoin: noop };

  it("'static': poster + 5 khối chữ xếp dọc, CTA ở khối đầu và cuối, không bản đồ", () => {
    const html = renderToStaticMarkup(<Hero tier="static" {...props} />);
    expect(html).toContain('data-hero-tier="static"');
    expect(html).toContain('/hero/hero-1-wide.webp');
    expect(html).toContain('Đi đâu? Rồi đi đâu nữa?');
    expect(html).toContain('Mỗi người một ý…');
    expect(html).toContain('Cả tối xếp sẵn, khỏi vòng vèo');
    expect(html.match(/Tạo phòng/g)).toHaveLength(2);
    expect(html).not.toContain('data-motion');
  });

  it("'lite'/'full': poster + màn đầu hiện ngay (khung chờ), rồi phim cuộn lazy", async () => {
    const first = renderToStaticMarkup(<Hero tier="lite" {...props} />);
    expect(first).toContain('data-hero-tier="loading"');
    expect(first).toContain('/hero/hero-1-wide.webp');
    expect(first).toContain('Đi đâu? Rồi đi đâu nữa?');
    expect(first).toContain('Tạo phòng');
    expect(first).not.toContain('Mỗi người một ý…');

    await import('../stage/hero/HeroScroll');
    await new Promise((r) => setTimeout(r, 0));
    for (const tier of ['lite', 'full'] as const) {
      const html = renderToStaticMarkup(<Hero tier={tier} {...props} />);
      expect(html).toContain(`data-hero-tier="${tier}"`);
      expect(html).toContain('data-motion="hero.shot"');
      expect(html).toContain('Bỏ qua');
      // Chỉ cảnh 1 hiện lúc đầu; 4 cảnh còn lại ẩn với trình đọc màn hình, không aria-live đọc từng cảnh
      expect(html.match(/data-motion="hero.shot" aria-hidden="true"/g)).toHaveLength(4);
      expect(html.match(/data-motion="hero.shot" aria-hidden="false"/g)).toHaveLength(1);
      expect(html).not.toContain('aria-live');
    }
  });

  it('chữ hero đủ tiếng Anh', async () => {
    await i18n.changeLanguage('en');
    const html = renderToStaticMarkup(<Hero tier="static" {...props} />);
    expect(html).toContain('Where to? And where next?');
    expect(html).toContain('Create a room');
    expect(html).toContain('The whole night, in order, no detours');
  });

  it('HomePage dùng hero, có khẩu hiệu và 2 CTA', () => {
    const html = renderToStaticMarkup(<HomePage onNavigateToRoom={noop} />);
    expect(html).toContain('Đi đâu? Rồi đi đâu nữa?');
    expect(html).toContain('Tạo phòng');
    expect(html).toContain('Nhập mã');
  });
});
