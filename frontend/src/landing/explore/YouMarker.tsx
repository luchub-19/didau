// Điểm "Bạn" trên bản đồ hoà phiếu: một <button> HTML do React đặt theo toạ độ đã chiếu (không phải maplibregl.Marker,
// nên không có bẫy ghi đè class `maplibregl-marker`). Kéo bằng pointer (chuột/cảm ứng, gộp theo requestAnimationFrame),
// hoặc focus + phím mũi tên (bước 0,005°, PLAN §4.7). Đặt mới → rơi xuống 520 ms (khoá `drop`).
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { YOU_SEED, avatarFor } from '../cast';
import { isArrowKey } from './model';

export interface YouMarkerProps {
  /** Toạ độ px (góc trên trái khung bản đồ) của điểm. */
  pt: readonly [number, number];
  /** Đổi giá trị = rơi xuống lại một lần; 0 hoặc `still` = không diễn. */
  drop: number;
  still: boolean;
  /** Kéo: toạ độ px trong khung (đã trừ độ lệch chỗ nắm). */
  onDrag: (pt: readonly [number, number]) => void;
  onDragEnd: () => void;
  onNudge: (key: string) => void;
}

export const YouMarker: React.FC<YouMarkerProps> = ({ pt, drop, still, onDrag, onDragEnd, onNudge }) => {
  const { t } = useTranslation();
  const drag = useRef<{ id: number; dx: number; dy: number; left: number; top: number } | null>(null);
  const raf = useRef(0);
  const pending = useRef<readonly [number, number] | null>(null);
  // Giữ hàm mới nhất cho handler pointer (không gắn lại listener mỗi lần render)
  const cb = useRef({ onDrag, onDragEnd });
  cb.current = { onDrag, onDragEnd };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const flush = () => {
    raf.current = 0;
    if (pending.current) {
      cb.current.onDrag(pending.current);
      pending.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const card = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!card) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    // Độ lệch giữa chỗ nắm và tâm avatar: thả ra thì tâm avatar (không phải đầu ngón tay) là điểm của bạn
    drag.current = {
      id: e.pointerId,
      dx: e.clientX - card.left - pt[0],
      dy: e.clientY - card.top - pt[1],
      left: card.left,
      top: card.top,
    };
    e.currentTarget.focus({ preventScroll: true });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    pending.current = [e.clientX - d.left - d.dx, e.clientY - d.top - d.dy];
    if (!raf.current) raf.current = requestAnimationFrame(flush);
  };

  const end = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    cancelAnimationFrame(raf.current);
    flush();
    cb.current.onDragEnd();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!isArrowKey(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    onNudge(e.key);
  };

  return (
    <button
      type="button"
      className="tie-you"
      style={{ left: pt[0], top: pt[1] }}
      aria-label={t('landing.tie.pinLabel')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
    >
      <span key={drop} className="tie-you-in" data-drop={drop > 0 && !still ? 'true' : undefined}>
        <img src={avatarFor(YOU_SEED)} alt="" width={44} height={44} draggable={false} />
        <span className="tie-you-label">{t('landing.you')}</span>
      </span>
    </button>
  );
};
