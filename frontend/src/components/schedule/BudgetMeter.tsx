import React from 'react';
import { useTranslation } from 'react-i18next';
import type { PlaceCategory } from '../../types';
import type { PlanBudget } from '../../room/budget';
import { formatMoney } from '../../i18n/format';
import { useLanguage } from '../../i18n/useLanguage';

export interface BudgetMeterProps {
  budget: PlanBudget;
  className?: string;
}

// Đoạn màu theo danh mục của điểm (token cat-*), vượt ngân sách thì cả thanh chuyển warning
const SEGMENT_BG: Record<PlaceCategory, string> = {
  FOOD: 'bg-cat-food',
  DRINK: 'bg-cat-drink',
  ENTERTAINMENT: 'bg-cat-entertainment',
  SIGHTSEEING: 'bg-cat-sightseeing',
  ACCOMMODATION: 'bg-cat-accommodation',
  SHOPPING: 'bg-cat-shopping',
  OTHER: 'bg-cat-other',
};

/**
 * Ngân sách cả buổi (mỗi người): "295.000 ₫ / 400.000 ₫", thanh chia đoạn theo từng điểm, dòng phụ còn dư/vượt.
 * Không có `budget_limit`: chỉ hiện tổng. Điểm chưa rõ giá không có đoạn trên thanh (không coi là miễn phí).
 */
export const BudgetMeter: React.FC<BudgetMeterProps> = ({ budget, className = '' }) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { spent, limit, remaining, unknownCount, segments, over, priciest } = budget;

  const priced = segments.filter((s) => s.cost !== null);
  // Thanh dài bằng max(ngân sách, đã chi) để đoạn vượt vẫn nằm trong khung
  const scale = Math.max(limit ?? 0, spent);

  const unknownText = unknownCount > 0 ? t('budget.unknown', { count: unknownCount }) : null;
  let sub: string | null = null;
  if (over && remaining !== null) {
    sub = priciest
      ? t('budget.overBy', { amount: formatMoney(-remaining, lang), name: priciest.name })
      : t('budget.overByPlain', { amount: formatMoney(-remaining, lang) });
  } else if (remaining !== null) {
    sub = t('budget.left', { amount: formatMoney(remaining, lang) });
  }

  return (
    <section
      aria-label={t('budget.title')}
      data-testid="budget-meter"
      data-over={over ? 'true' : 'false'}
      className={`rounded-card border border-line bg-surface p-4 ${className}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 className="text-label font-semibold text-ink-2">{t('budget.title')}</h3>
        <p className={`whitespace-nowrap text-heading font-semibold tabular-nums ${over ? 'text-warning' : 'text-ink'}`}>
          {limit !== null
            ? t('budget.ratio', { spent: formatMoney(spent, lang), limit: formatMoney(limit, lang) })
            : t('budget.total', { spent: formatMoney(spent, lang) })}
        </p>
      </div>

      {scale > 0 && (
        <div
          role="img"
          aria-label={t('budget.barLabel', { count: priced.length })}
          className="mt-3 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-2"
        >
          {priced.map((s) => (
            <span
              key={s.placeId}
              title={`${s.name} · ${formatMoney(s.cost ?? 0, lang)}`}
              className={`h-full min-w-[3px] ${over ? 'bg-warning' : SEGMENT_BG[s.category ?? 'OTHER']}`}
              style={{ width: `${((s.cost ?? 0) / scale) * 100}%` }}
            />
          ))}
        </div>
      )}

      {(sub || unknownText) && (
        <p className={`mt-2 text-caption ${over ? 'text-warning' : 'text-ink-2'}`}>
          {[sub, unknownText].filter(Boolean).join(' · ')}
        </p>
      )}
      {segments.length === 0 && <p className="mt-1 text-caption text-ink-2">{t('budget.empty')}</p>}
    </section>
  );
};
