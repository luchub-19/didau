import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from '../ui';
import { PHASE_STEPS, type PhaseStep } from '../../room/phase';

export interface PhaseStepperProps {
  /** Bước hiện tại tính từ dữ liệu. */
  step: PhaseStep;
  /** Bước đang xem (≤ step). */
  viewStep: PhaseStep;
  onViewStep: (s: PhaseStep | null) => void;
  /** `full` = 4 nút (desktop), `compact` = chữ "Bước x/4" (mobile). */
  variant?: 'full' | 'compact';
  className?: string;
}

const KEYS = ['gather', 'vote', 'lock', 'send'] as const;

export const PhaseStepper: React.FC<PhaseStepperProps> = ({ step, viewStep, onViewStep, variant = 'full', className = '' }) => {
  const { t } = useTranslation();
  const name = (s: PhaseStep) => t(`phase.step.${KEYS[s - 1]}`);

  if (variant === 'compact') {
    return (
      <p className={`text-caption text-ink-2 tabular-nums ${className}`}>
        {t('phase.mobile', { n: viewStep, name: name(viewStep) })}
      </p>
    );
  }

  return (
      <nav aria-label={t('phase.ariaLabel')} className={className}>
        <ol className="flex items-center gap-1">
          {PHASE_STEPS.map((s) => {
            const done = s < step;
            const future = s > step;
            const current = s === viewStep;
            const reason = future ? t('phase.needs', { step: name((s - 1) as PhaseStep) }) : undefined;
            return (
              <li key={s}>
                <button
                  type="button"
                  aria-current={current ? 'step' : undefined}
                  aria-disabled={future ? true : undefined}
                  title={reason}
                  onClick={() => {
                    if (future) return;
                    onViewStep(s === step ? null : s);
                  }}
                  className={[
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-semibold transition-colors',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text',
                    current ? 'bg-accent-soft text-accent-text' : future ? 'text-ink-3 cursor-not-allowed' : 'text-ink-2 hover:bg-surface-2',
                  ].join(' ')}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] tabular-nums ${
                      done ? 'bg-success-soft text-success' : 'bg-surface-2'
                    }`}
                  >
                    {done ? <Check size={12} weight="bold" /> : s}
                  </span>
                  <span>{name(s)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
  );
};
