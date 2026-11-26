// Hộp "Bạn ở quận nào?" + 12 chip quận: đường thay thế cho kéo thả (WCAG 2.5.7), cuộn ngang ở màn hẹp.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { YOU_SEED, avatarFor, type DistrictCode } from '../cast';
import { CHIP_ORDER } from './model';

export interface DistrictChipsProps {
  area: DistrictCode | null;
  onPick: (area: DistrictCode) => void;
}

export const DistrictChips: React.FC<DistrictChipsProps> = ({ area, onPick }) => {
  const { t } = useTranslation();
  return (
    <div className="tie-ask">
      <p className="tie-ask-q" id="tie-ask-q">
        <img src={avatarFor(YOU_SEED)} alt="" width={26} height={26} className="rounded-full" />
        <span>{t('landing.tie.askQ')}</span>
      </p>
      <div className="tie-chips" role="group" aria-labelledby="tie-ask-q">
        {CHIP_ORDER.map((code) => (
          <button key={code} type="button" data-area={code} aria-pressed={area === code} onClick={() => onPick(code)}>
            {t(`landing.district.${code}`)}
          </button>
        ))}
      </div>
      <p className="tie-ask-hint">{t('landing.tie.askHint')}</p>
    </div>
  );
};
