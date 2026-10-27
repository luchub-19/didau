// Âm thanh khoảnh khắc, tự tổng hợp bằng WebAudio (không file, không bản quyền). docs/phase4/DESIGN.md §5.
// Luật: mặc định tắt; AudioContext chỉ tạo khi đang bật VÀ có thao tác người dùng; tắt là đóng ngay;
// mỗi âm ≤ 400 ms, âm lượng thấp, không lặp.

export type SoundName = 'tick' | 'chime' | 'whoosh';

/** Thời lượng (giây) của từng âm, kể cả đuôi tắt dần. Test kiểm ≤ 0,4 s. */
export const SOUND_DURATIONS: Record<SoundName, number> = {
  tick: 0.06,
  chime: 0.38,
  whoosh: 0.32,
};

/** Âm lượng tổng (0..1), cố ý thấp. */
export const MASTER_GAIN = 0.18;

// Kiểu tối thiểu của AudioContext mà engine dùng (để test thay bằng bản giả)
export type AudioContextLike = Pick<
  AudioContext,
  'currentTime' | 'state' | 'sampleRate' | 'destination' | 'createOscillator' | 'createGain' |
  'createBiquadFilter' | 'createBuffer' | 'createBufferSource' | 'resume' | 'close'
>;

export type AudioContextFactory = () => AudioContextLike | null;

function defaultFactory(): AudioContextLike | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

// Đường bao âm lượng: lên nhanh rồi tắt dần theo hàm mũ (không click ở đầu/cuối)
function envelope(ctx: AudioContextLike, peak: number, attack: number, length: number): GainNode {
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  return g;
}

function playTick(ctx: AudioContextLike, out: AudioNode): void {
  const len = SOUND_DURATIONS.tick;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1800, t);
  osc.frequency.exponentialRampToValueAtTime(1100, t + len);
  const g = envelope(ctx, 0.5, 0.004, len);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + len);
}

function playChime(ctx: AudioContextLike, out: AudioNode): void {
  const len = SOUND_DURATIONS.chime;
  const t = ctx.currentTime;
  // Hai nốt quãng năm (A5 + E6), nốt sau vào trễ 60 ms: nghe như "ting-ting" nhẹ
  [
    { freq: 880, delay: 0, peak: 0.45 },
    { freq: 1318.5, delay: 0.06, peak: 0.3 },
  ].forEach(({ freq, delay, peak }) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.setValueAtTime(0.0001, t + delay);
    g.gain.exponentialRampToValueAtTime(peak, t + delay + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + len);
  });
}

function playWhoosh(ctx: AudioContextLike, out: AudioNode): void {
  const len = SOUND_DURATIONS.whoosh;
  const t = ctx.currentTime;
  // Nhiễu trắng qua bộ lọc band-pass quét lên: tiếng gió lướt qua
  const frames = Math.max(1, Math.floor(ctx.sampleRate * len));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.setValueAtTime(1.2, t);
  filter.frequency.setValueAtTime(400, t);
  filter.frequency.exponentialRampToValueAtTime(2400, t + len);
  const g = envelope(ctx, 0.35, 0.08, len);
  src.connect(filter).connect(g).connect(out);
  src.start(t);
  src.stop(t + len);
}

const PLAYERS: Record<SoundName, (ctx: AudioContextLike, out: AudioNode) => void> = {
  tick: playTick,
  chime: playChime,
  whoosh: playWhoosh,
};

export interface SoundEngine {
  isEnabled(): boolean;
  /** Gọi trong handler của thao tác người dùng (click nút bật) để trình duyệt cho phép phát. */
  enable(): void;
  /** Tắt và đóng AudioContext ngay (không giữ tài nguyên khi tắt). */
  disable(): void;
  /** Phát một âm; im lặng nếu đang tắt hoặc trình duyệt không hỗ trợ. */
  play(name: SoundName): void;
  /** Có AudioContext đang mở không (để test/đo). */
  hasContext(): boolean;
}

export function createSoundEngine(factory: AudioContextFactory = defaultFactory): SoundEngine {
  let enabled = false;
  let ctx: AudioContextLike | null = null;
  let master: GainNode | null = null;

  function ensureContext(): AudioContextLike | null {
    if (ctx) return ctx;
    try {
      ctx = factory();
    } catch {
      ctx = null;
    }
    if (!ctx) return null;
    master = ctx.createGain();
    master.gain.setValueAtTime(MASTER_GAIN, ctx.currentTime);
    master.connect(ctx.destination);
    return ctx;
  }

  return {
    isEnabled: () => enabled,
    enable() {
      enabled = true;
      // Tạo ngay trong cử chỉ người dùng để không bị chính sách autoplay chặn
      const c = ensureContext();
      if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
    },
    disable() {
      enabled = false;
      const c = ctx;
      ctx = null;
      master = null;
      if (c && c.state !== 'closed') void c.close().catch(() => undefined);
    },
    play(name) {
      if (!enabled) return;
      const c = ensureContext();
      if (!c || !master) return;
      if (c.state === 'suspended') void c.resume().catch(() => undefined);
      try {
        PLAYERS[name](c, master);
      } catch {
        // Âm thanh là phần phụ: lỗi WebAudio không được làm hỏng khoảnh khắc
      }
    },
    hasContext: () => ctx !== null,
  };
}
