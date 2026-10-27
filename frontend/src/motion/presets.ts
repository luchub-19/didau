// Preset chuyển động có tên của vùng Stage. Phần tử chuyển động mang `data-motion="<tên>"`
// để grep một tên ra đủ CSS, TS và DOM (docs/phase4/DESIGN.md §4).
import { duration, easing, type DurationToken, type EasingToken } from './tokens';
import type { MotionTier } from './useMotionTier';

export interface MotionPreset {
  /** Việc của hiệu ứng (PLAN §2.3): giới thiệu, xác nhận, giải thích, cao trào. */
  purpose: string;
  duration: DurationToken;
  easing: EasingToken;
  /** Ở mức 'lite': hệ số rút ngắn thời lượng (giữ di chuyển). */
  liteScale: number;
  /** Tổng chuỗi thời gian tối đa của khoảnh khắc (ms, chưa nhân ?motion=slow). */
  maxSequenceMs: number;
}

export const MOTION_PRESETS = {
  'hero.shot': {
    purpose: 'intro: camera moves between hero shots',
    duration: 'shot',
    easing: 'camera',
    // lite: mỗi cảnh một flyTo ≈1,2 s (T-59), không scrub theo cuộn
    liteScale: 0.86,
    maxSequenceMs: 1600,
  },
  'hero.intro': {
    purpose: 'intro: one slow orbit as the hero map appears (plays once, never loops)',
    duration: 'reveal',
    easing: 'out',
    // lite: không xoay (bản đồ đứng yên ở cảnh 1)
    liteScale: 0,
    maxSequenceMs: 2000,
  },
  'vote.swipe': {
    purpose: 'confirm: card follows the pointer, then leaves',
    duration: 'swipe',
    easing: 'throw',
    liteScale: 1,
    maxSequenceMs: 320,
  },
  'vote.flyIn': {
    purpose: 'explain: a vote lands on the tally',
    duration: 'fly',
    easing: 'out',
    liteScale: 0.6,
    maxSequenceMs: 700,
  },
  'decide.reveal': {
    purpose: 'climax: the winning place is revealed',
    duration: 'reveal',
    easing: 'out',
    liteScale: 0.5,
    maxSequenceMs: 2400,
  },
  'tab.switch': {
    purpose: 'continuity: room tab changes',
    duration: 'tab',
    easing: 'inOut',
    liteScale: 1,
    maxSequenceMs: 300,
  },
  'presence.pulse': {
    purpose: 'explain: someone joined or acted (plays once, never loops)',
    duration: 'moment',
    easing: 'out',
    liteScale: 0.6,
    maxSequenceMs: 600,
  },
} as const satisfies Record<string, MotionPreset>;

export type MotionPresetName = keyof typeof MOTION_PRESETS;

export const MOTION_PRESET_NAMES = Object.keys(MOTION_PRESETS) as MotionPresetName[];

export interface ResolvedMotion {
  name: MotionPresetName;
  /** false ở mức 'static': chỉ đổi màu/opacity, không dịch chuyển/scale. */
  move: boolean;
  durationMs: number;
  easing: string;
}

/** Thời lượng + easing thật của preset ở một mức. 'static' dùng nhịp UI ngắn cho đổi opacity. */
export function resolvePreset(name: MotionPresetName, tier: MotionTier): ResolvedMotion {
  const p = MOTION_PRESETS[name];
  if (tier === 'static') {
    return { name, move: false, durationMs: duration('ui'), easing: easing('out') };
  }
  const scale = tier === 'lite' ? p.liteScale : 1;
  return { name, move: true, durationMs: Math.round(duration(p.duration) * scale), easing: easing(p.easing) };
}

/** Thuộc tính gắn lên phần tử: `<div {...motionAttrs('vote.swipe')}>`. */
export function motionAttrs(name: MotionPresetName): { 'data-motion': MotionPresetName } {
  return { 'data-motion': name };
}
