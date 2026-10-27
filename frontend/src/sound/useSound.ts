// Công tắc âm thanh toàn app, lưu ở localStorage 'didau.sound' ('on' | 'off', mặc định tắt).
// Nút bật/tắt: góc header trang chủ + Cài đặt tab Nhóm (làm ở T-61, docs/phase4/DESIGN.md §5).
import { useCallback, useSyncExternalStore } from 'react';
import { createSoundEngine, type SoundEngine, type SoundName } from './sound';

export const SOUND_STORAGE_KEY = 'didau.sound';

function readSaved(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage?.getItem(SOUND_STORAGE_KEY) === 'on';
  } catch {
    // localStorage bị chặn (trình duyệt riêng tư): coi như tắt
    return false;
  }
}

let engine: SoundEngine = createSoundEngine();
let soundOn = readSaved();
const listeners = new Set<() => void>();

export function isSoundOn(): boolean {
  return soundOn;
}

/**
 * Bật/tắt âm thanh. Gọi từ handler click để AudioContext được tạo trong cử chỉ người dùng.
 * Tắt thì đóng AudioContext ngay.
 */
export function setSoundOn(next: boolean): void {
  soundOn = next;
  try {
    window.localStorage?.setItem(SOUND_STORAGE_KEY, next ? 'on' : 'off');
  } catch {
    // Bỏ qua nếu không lưu được
  }
  if (next) engine.enable();
  else engine.disable();
  listeners.forEach((l) => l());
}

/**
 * Phát âm của khoảnh khắc. Nếu người dùng đã bật từ phiên trước, AudioContext được tạo lười ở lần phát
 * đầu tiên (lúc đó trang đã có thao tác người dùng: quẹt thẻ, bấm chốt).
 */
export function playSound(name: SoundName): void {
  if (!soundOn) return;
  if (!engine.isEnabled()) engine.enable();
  engine.play(name);
}

/** Chỉ dùng trong test: thay engine (AudioContext giả) và đọc lại localStorage. */
export function resetSoundForTest(next: SoundEngine): void {
  engine = next;
  soundOn = readSaved();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useSound() {
  const on = useSyncExternalStore(subscribe, isSoundOn, () => false);
  const toggle = useCallback(() => setSoundOn(!isSoundOn()), []);
  return { on, setOn: setSoundOn, toggle, play: playSound };
}
