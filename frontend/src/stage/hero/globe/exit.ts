// Cầu rời sân khấu và bản đồ hiện ra (T-114, PLAN gđ9 §4.1–§4.2, §4.4). Hàm thuần ⇒ test được không cần DOM.
// Dòng thời gian, tính từ lúc bản đồ báo `ready`:
//   leaveAt = min(biên đạo kể xong, GLOBE_STORY_CAP_MS)  ← hạn chót cứng, dù cầu đang ở pha nào (tab ẩn, rAF dừng…)
//   'dive' : cầu phóng to vào ghim rồi tan, bản đồ từ nhoè + hơi to về bình thường, cùng `--t-shot`; intro orbit SAU đó
//   'fade' : (lite) cầu mờ `--t-shot`, bản đồ mờ chéo `--t-moment` như trước gđ9; không lao xuống
//   'none' : cầu chưa từng hiện (ready trước 300 ms) ⇒ y như trước gđ9: bản đồ mờ chéo ngay ở `ready`

/** Trần trễ (G1 câu 3): sau `ready`, cầu bắt đầu rời sân khấu muộn nhất 600 ms dù biên đạo chưa xong. */
export const GLOBE_STORY_CAP_MS = 600;

export type GlobeExit = 'dive' | 'fade' | 'none';

/** Cách cầu rời sân khấu: chưa hiện ⇒ 'none'; lite/reduced ⇒ 'fade' (không lao xuống, PLAN §4.4); còn lại ⇒ 'dive'. */
export function globeExitMode(shown: boolean, slow: boolean): GlobeExit {
  if (!shown) return 'none';
  return slow ? 'fade' : 'dive';
}

/** Trễ (ms, sau `ready`) tới lúc cầu bắt đầu rời: biên đạo xong sớm thì theo nó, không bao giờ quá trần. */
export function exitDelayMs(exit: GlobeExit, storyEndMs: number | null): number {
  if (exit === 'none') return 0;
  return Math.min(GLOBE_STORY_CAP_MS, Math.max(0, storyEndMs ?? GLOBE_STORY_CAP_MS));
}

export interface RevealMs {
  /** Thời lượng lao xuống / mờ cầu (`--t-shot`) và mờ chéo bản đồ kiểu cũ (`--t-moment`), đã nhân `?motion=slow`. */
  shot: number;
  moment: number;
}

export interface RevealTimeline {
  /** Cầu bắt đầu rời (lớp bản đồ bắt đầu hiện). */
  leaveAt: number;
  /** Lớp bản đồ hiện xong (opacity 1, hết nhoè). */
  mapDoneAt: number;
  /** Intro orbit của HeroMap được phép bắt đầu: 'dive' thì đúng lúc lao xuống xong, không sớm hơn. */
  introAt: number;
  /** Cầu được gỡ khỏi DOM. */
  globeGoneAt: number;
}

/** Dòng thời gian (ms, tính từ `ready`) cho một nhánh. */
export function revealTimeline(exit: GlobeExit, storyEndMs: number | null, ms: RevealMs): RevealTimeline {
  const leaveAt = exitDelayMs(exit, storyEndMs);
  if (exit === 'dive') return { leaveAt, mapDoneAt: leaveAt + ms.shot, introAt: leaveAt + ms.shot, globeGoneAt: leaveAt + ms.shot };
  return { leaveAt, mapDoneAt: leaveAt + ms.moment, introAt: leaveAt, globeGoneAt: exit === 'none' ? 0 : leaveAt + ms.shot };
}

/** Trễ (ms) từ lúc cầu bắt đầu rời tới lúc gọi intro orbit. */
export const introDelayMs = (exit: GlobeExit, ms: RevealMs): number => (exit === 'dive' ? ms.shot : 0);

// Keyframes lao xuống (như mock `startDive`). Chạy bằng WAAPI với easing cho CẢ chuỗi: keyframes CSS áp easing cho từng đoạn
// nên cầu sẽ khựng ở mốc 35 %. Chỉ transform / opacity / filter (composite).
/** Cầu: phóng to quanh mũi ghim (= tâm cầu khi đã dừng ở TP.HCM) rồi tan. */
export const GLOBE_DIVE_KEYFRAMES: Keyframe[] = [
  { transform: 'scale(1)', opacity: 1 },
  { transform: 'scale(2.2)', opacity: 1, offset: 0.35 },
  { transform: 'scale(16)', opacity: 0 },
];
/** Lớp bản đồ: chờ 35 % đầu (cầu còn đang phóng to), rồi từ hơi nhoè + hơi to về bình thường. */
export const MAP_DIVE_KEYFRAMES: Keyframe[] = [
  { opacity: 0, transform: 'scale(1.18)', filter: 'blur(8px)' },
  { opacity: 0, transform: 'scale(1.14)', filter: 'blur(8px)', offset: 0.35 },
  { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' },
];

/** Chạy keyframes nếu trình duyệt có WAAPI; không có thì bỏ qua (phần tử đứng ở trạng thái cuối). */
export function playDive(el: Element | null, keyframes: Keyframe[], durationMs: number, easing: string): Animation | null {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return null;
  return (el as HTMLElement).animate(keyframes, { duration: durationMs, easing, fill: 'forwards' });
}
