// Mặt thẻ quán (chỉ trình bày, không chuyển động): dùng cho thẻ trên cùng, thẻ phía sau và bản dự phòng
// khi chunk sân khấu chưa tải xong. Trên ≥1024px có dải màu danh mục lớn thay cho ảnh (quán OSM không có ảnh).
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../i18n/useLanguage';
import { formatMoney } from '../../i18n/format';
import { cuisineLabel } from '../../i18n/osm';
import { Chip, MapPin, CurrencyCircleDollar, ForkKnife } from '../../components/ui';
import { CATEGORY_METADATA } from '../../components/common/categoryMetadata';
import type { Place } from '../../types';

export interface DeckCardFaceProps {
  place: Place;
  /** Thẻ phía sau: chỉ lộ mép, ẩn chi tiết khỏi trình đọc màn hình. */
  behind?: boolean;
}

export const DeckCardFace: React.FC<DeckCardFaceProps> = ({ place, behind = false }) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const meta = CATEGORY_METADATA[place.category] ?? CATEGORY_METADATA.OTHER;
  const CategoryIcon = meta.IconComponent;

  return (
    <div className="flex flex-1 flex-col gap-4" aria-hidden={behind || undefined}>
      {/* Dải danh mục: chỉ ở sân khấu rộng */}
      <div
        className={`hidden lg:flex items-end justify-between -mx-6 -mt-6 px-6 pb-4 pt-10 h-36 ${meta.softBg} ${meta.softText}`}
        aria-hidden="true"
      >
        <CategoryIcon size={56} weight="duotone" />
      </div>

      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <Chip category={place.category} icon={meta.icon}>
            {t(meta.labelKey)}
          </Chip>
          <h4 className="text-title font-bold text-ink mt-2 leading-snug lg:text-[1.75rem] lg:leading-tight">
            {place.name}
          </h4>
        </div>
        <div className="w-10 h-10 rounded-full bg-surface-2 text-ink-2 flex items-center justify-center lg:hidden">
          <CategoryIcon size={20} />
        </div>
      </div>

      <div className="text-caption text-ink-2 space-y-2 bg-surface-2 p-3.5 rounded-field border border-line">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-ink-3 flex-shrink-0" />
          <span className="line-clamp-1">{place.address || t('decide.swipe.centerArea')}</span>
        </div>
        {place.estimated_cost != null && place.estimated_cost > 0 && (
          <div className="flex items-center gap-2">
            <CurrencyCircleDollar size={16} className="text-ink-3 flex-shrink-0" />
            <span>{formatMoney(place.estimated_cost)}</span>
          </div>
        )}
        {place.cuisine && (
          <div className="flex items-center gap-2">
            <ForkKnife size={16} className="text-ink-3 flex-shrink-0" />
            <span>
              {t('decide.swipe.cuisineLabel', {
                cuisine: cuisineLabel(place.cuisine, lang) || place.cuisine,
              })}
            </span>
          </div>
        )}
      </div>

      <div className="mt-auto text-[11px] text-center text-ink-3 pt-1">{t('decide.swipe.dragHelper')}</div>
    </div>
  );
};
