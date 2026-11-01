import React from 'react';
import { useTranslation } from 'react-i18next';
import { Chip } from '../ui';
import { BUDGET_CHIPS, type BudgetChoice } from '../../room/createRoom';

export interface BudgetChipsProps {
  value: BudgetChoice;
  onChange: (value: BudgetChoice) => void;
  className?: string;
}

/** Chip ngân sách cả buổi (DESIGN gđ5 §9). Ô số "Tự nhập" do nơi gọi dựng khi `value === 'custom'`. */
export const BudgetChips: React.FC<BudgetChipsProps> = ({ value, onChange, className = '' }) => {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t('room.create.budget')} className={`flex flex-wrap gap-2 ${className}`}>
      {BUDGET_CHIPS.map((c) => (
        <Chip key={c.id} selected={value === c.id} onClick={() => onChange(c.id)}>
          {t(`room.create.budgetChip.${c.id}`)}
        </Chip>
      ))}
    </div>
  );
};
