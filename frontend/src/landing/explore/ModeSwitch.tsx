// Công tắc 2 chế độ phá hoà (PLAN §4.1 phần 5): "Cộng tổng km" (trái) / "Ưu tiên người xa nhất" (phải).
// Hai cột bằng nhau nên núm trượt chỉ cần translateX(0 | 100%), không phải đo nút. Phím ←/→ đổi chế độ + dời focus.
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExploreMode } from '../logic/explore';
import { modeForKey } from './model';

export interface ModeSwitchProps {
  mode: ExploreMode;
  onChange: (m: ExploreMode) => void;
}

const MODES: readonly ExploreMode[] = ['sum', 'far'];

export const ModeSwitch: React.FC<ModeSwitchProps> = ({ mode, onChange }) => {
  const { t } = useTranslation();
  const refs = useRef<Partial<Record<ExploreMode, HTMLButtonElement | null>>>({});
  const onKeyDown = (e: React.KeyboardEvent) => {
    const m = modeForKey(e.key);
    if (!m) return;
    e.preventDefault();
    onChange(m);
    refs.current[m]?.focus();
  };
  return (
    <div
      className="tie-seg"
      role="group"
      aria-label={t('landing.tie.modeLabel')}
      data-mode={mode}
      onKeyDown={onKeyDown}
    >
      <span className="tie-seg-knob" aria-hidden="true" />
      {MODES.map((m) => (
        <button
          key={m}
          ref={(el) => {
            refs.current[m] = el;
          }}
          type="button"
          data-mode={m}
          aria-pressed={mode === m}
          onClick={() => onChange(m)}
        >
          {t(m === 'sum' ? 'landing.tie.modeSum' : 'landing.tie.modeFar')}
        </button>
      ))}
    </div>
  );
};
