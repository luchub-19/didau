import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createSoundEngine,
  SOUND_DURATIONS,
  MASTER_GAIN,
  type AudioContextLike,
  type SoundName,
} from '../sound/sound';
import {
  SOUND_STORAGE_KEY,
  isSoundOn,
  setSoundOn,
  playSound,
  resetSoundForTest,
} from '../sound/useSound';

// AudioContext giả: ghi lại số nút được tạo và trạng thái đóng/mở
function fakeContextFactory() {
  const created: FakeCtx[] = [];
  const param = () => ({
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const node = () => {
    const n: Record<string, unknown> = {
      gain: param(),
      frequency: param(),
      Q: param(),
      type: '',
      buffer: null,
      start: vi.fn(),
      stop: vi.fn(),
    };
    n.connect = vi.fn(() => n);
    return n;
  };
  class FakeCtx {
    currentTime = 0;
    state: AudioContextState = 'running';
    sampleRate = 8000;
    destination = node();
    nodes = 0;
    createOscillator = vi.fn(() => (this.nodes++, node()));
    createGain = vi.fn(() => (this.nodes++, node()));
    createBiquadFilter = vi.fn(() => (this.nodes++, node()));
    createBufferSource = vi.fn(() => (this.nodes++, node()));
    createBuffer = vi.fn((_c: number, frames: number) => ({ getChannelData: () => new Float32Array(frames) }));
    resume = vi.fn(async () => {
      this.state = 'running';
    });
    close = vi.fn(async () => {
      this.state = 'closed';
    });
  }
  const factory = vi.fn(() => {
    const c = new FakeCtx();
    created.push(c);
    return c as unknown as AudioContextLike;
  });
  return { factory, created };
}

describe('T-58: sound engine', () => {
  it('mọi âm ≤ 400 ms và âm lượng tổng thấp', () => {
    for (const [name, len] of Object.entries(SOUND_DURATIONS)) {
      expect(len, name).toBeGreaterThan(0);
      expect(len, name).toBeLessThanOrEqual(0.4);
    }
    expect(MASTER_GAIN).toBeLessThanOrEqual(0.25);
  });

  it('mặc định tắt: play không tạo AudioContext', () => {
    const { factory } = fakeContextFactory();
    const engine = createSoundEngine(factory);
    engine.play('chime');
    expect(engine.isEnabled()).toBe(false);
    expect(factory).not.toHaveBeenCalled();
    expect(engine.hasContext()).toBe(false);
  });

  it('enable tạo đúng một context; cả 3 âm phát được', () => {
    const { factory, created } = fakeContextFactory();
    const engine = createSoundEngine(factory);
    engine.enable();
    (['tick', 'chime', 'whoosh'] as SoundName[]).forEach((n) => engine.play(n));
    expect(factory).toHaveBeenCalledTimes(1);
    expect(created[0].nodes).toBeGreaterThan(3);
  });

  it('disable đóng AudioContext ngay và không phát nữa', () => {
    const { factory, created } = fakeContextFactory();
    const engine = createSoundEngine(factory);
    engine.enable();
    engine.disable();
    expect(created[0].close).toHaveBeenCalledTimes(1);
    expect(engine.hasContext()).toBe(false);
    engine.play('tick');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('trình duyệt không có WebAudio: im lặng, không ném lỗi', () => {
    const engine = createSoundEngine(() => null);
    engine.enable();
    expect(() => engine.play('whoosh')).not.toThrow();
  });
});

describe('T-58: useSound (localStorage didau.sound)', () => {
  const originalWindow = globalThis.window;
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      },
    };
  });

  afterEach(() => {
    (globalThis as unknown as { window: unknown }).window = originalWindow;
  });

  it('mặc định tắt khi chưa lưu gì', () => {
    resetSoundForTest(createSoundEngine(fakeContextFactory().factory));
    expect(isSoundOn()).toBe(false);
  });

  it('bật/tắt lưu on/off; tắt đóng context', () => {
    const { factory, created } = fakeContextFactory();
    resetSoundForTest(createSoundEngine(factory));
    setSoundOn(true);
    expect(store.get(SOUND_STORAGE_KEY)).toBe('on');
    playSound('tick');
    expect(factory).toHaveBeenCalledTimes(1);
    setSoundOn(false);
    expect(store.get(SOUND_STORAGE_KEY)).toBe('off');
    expect(created[0].close).toHaveBeenCalled();
  });

  it('đã bật từ phiên trước: context chỉ tạo ở lần phát đầu tiên', () => {
    store.set(SOUND_STORAGE_KEY, 'on');
    const { factory } = fakeContextFactory();
    resetSoundForTest(createSoundEngine(factory));
    expect(isSoundOn()).toBe(true);
    expect(factory).not.toHaveBeenCalled();
    playSound('chime');
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
