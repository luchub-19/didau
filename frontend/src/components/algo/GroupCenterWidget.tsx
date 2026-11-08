// Widget tâm nhóm (ALGO-01, DESIGN gđ6 §8). Thu gọn = một chip; mở rộng = thẻ 320px (desktop, góc trái dưới bản đồ)
// hoặc Sheet (mobile, chip nằm đỉnh tab Khám phá). Ẩn khi <2 vị trí. Không bao giờ vẽ/hiện vị trí từng người.
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Sheet } from '../ui';
import type { GroupCenterResponse } from '../../types';
import { MapPin } from '../ui/Icon';
import { useAlgoStore } from '../../store/useAlgoStore';
import { formatDistance } from '../../i18n/format';
import { useLanguage } from '../../i18n/useLanguage';
import { CENTER_RADIUS_KM, centerVisible } from '../../room/groupCenter';
import { flyToPlace } from '../map/flyToPlace';
import { getMotionTier } from '../../motion/useMotionTier';
import { duration } from '../../motion/tokens';
import { WhyPanel } from './WhyPanel';

export interface GroupCenterWidgetProps {
  /** `map`: nổi góc trái dưới bản đồ (desktop). `inline`: chip trong dòng chảy cột trái, mở bằng Sheet (mobile). */
  variant: 'map' | 'inline';
  /** Ghi đè nguồn dữ liệu (test, vì SSR đọc store ở trạng thái đầu); thiếu thì đọc từ `useAlgoStore`. */
  source?: { groupCenter?: GroupCenterResponse | null; showRadius?: boolean };
  /** Mở sẵn thẻ mở rộng (test, hoặc nơi muốn bắt đầu ở dạng mở). */
  defaultExpanded?: boolean;
  /** `map`: chủ phòng có nút "Đặt điểm hẹn" ở góc trái dưới → đẩy widget lên trên nút đó. */
  aboveHostButton?: boolean;
  /** `inline`: chuyển sang tab Bản đồ sau khi bấm "Xem quán gần đây" (bản đồ ở tab khác trên mobile). */
  onShowOnMap?: () => void;
  className?: string;
}

const CenterBody: React.FC<{
  gc: GroupCenterResponse | null;
  showRadius: boolean;
  onCollapse?: () => void;
  onShow: () => void;
  placement: 'top' | 'bottom';
}> = ({ gc, showRadius, onCollapse, onShow, placement }) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const setShowRadius = useAlgoStore((s) => s.setShowRadius);
  if (!centerVisible(gc)) return null;

  const area = gc.area_label ?? t('algo.center.areaUnknown');
  const radius = formatDistance(CENTER_RADIUS_KM, lang);
  const nearby = gc.nearby_pois.length;

  return (
    <div className="space-y-3" data-testid="center-body">
      <p className="text-body text-ink">{t('algo.center.summary', { count: gc.member_count, area })}</p>
      <p className="text-caption text-ink-2" data-testid="center-nearby">
        {nearby > 0 ? t('algo.center.nearby', { count: nearby, radius }) : t('algo.center.noNearby', { radius })}
      </p>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        <Button
          variant="secondary"
          onClick={() => (showRadius ? setShowRadius(false) : onShow())}
          leftIcon={<MapPin size={16} weight="fill" aria-hidden="true" />}
          aria-pressed={showRadius}
          data-testid="center-show"
        >
          {showRadius ? t('algo.center.hide') : t('algo.center.show')}
        </Button>
        <WhyPanel title={t('algo.center.whyTitle')} placement={placement} data-testid="center-why">
          <p>{t('algo.center.whyBody', { count: gc.member_count })}</p>
          <p className="mt-2 text-ink-2">{t('algo.center.whyPrivacy')}</p>
        </WhyPanel>
        {onCollapse && (
          <Button variant="ghost" onClick={onCollapse} data-testid="center-collapse">
            {t('algo.center.collapse')}
          </Button>
        )}
      </div>
    </div>
  );
};

export const GroupCenterWidget: React.FC<GroupCenterWidgetProps> = ({
  variant,
  aboveHostButton = false,
  onShowOnMap,
  source,
  defaultExpanded = false,
  className = '',
}) => {
  const { t } = useTranslation();
  const storeCenter = useAlgoStore((s) => s.groupCenter);
  const storeRadius = useAlgoStore((s) => s.showRadius);
  const gc = source && 'groupCenter' in source ? (source.groupCenter ?? null) : storeCenter;
  const showRadius = source && 'showRadius' in source ? Boolean(source.showRadius) : storeRadius;
  const setShowRadius = useAlgoStore((s) => s.setShowRadius);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const chipRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const visible = centerVisible(gc);

  // Tâm biến mất (còn <2 người) khi đang mở: thu lại
  useEffect(() => {
    if (!visible) setExpanded(false);
  }, [visible]);

  // Mở thẻ → focus vào thẻ; Esc thu lại và trả focus về chip
  useEffect(() => {
    if (!expanded || variant !== 'map') return;
    cardRef.current?.focus();
  }, [expanded, variant]);

  if (!centerVisible(gc)) return null;

  const area = gc.area_label ?? t('algo.center.areaUnknown');

  const showNearby = () => {
    setShowRadius(true);
    flyToPlace(
      { latitude: gc.center.lat, longitude: gc.center.lng },
      {
        zoom: 13.4,
        pitch: 0,
        bearingDelta: 0,
        durationMs: getMotionTier() === 'static' ? 0 : duration('fly'),
        offsetY: 0,
      },
    );
    if (variant === 'inline') {
      setExpanded(false);
      onShowOnMap?.();
    }
  };

  const chip = (
    <button
      ref={chipRef}
      type="button"
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expanded}
      aria-label={t('algo.center.chipAria', { area })}
      data-testid="center-chip"
      className="inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full border border-line bg-surface px-4 text-label font-semibold text-ink shadow-float transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
    >
      <MapPin size={18} weight="fill" className="shrink-0 text-accent-text" aria-hidden="true" />
      <span className="truncate">{t('algo.center.chip', { area, count: gc.member_count })}</span>
    </button>
  );

  if (variant === 'inline') {
    return (
      <div className={className} data-testid="group-center-widget" data-variant="inline">
        {chip}
        <Sheet isOpen={expanded} onClose={() => setExpanded(false)} title={t('algo.center.title')}>
          <div className="pb-2">
            <CenterBody gc={gc} showRadius={showRadius} onShow={showNearby} placement="bottom" />
          </div>
        </Sheet>
      </div>
    );
  }

  return (
    <div
      className={`absolute left-3 z-10 ${aboveHostButton ? 'bottom-[68px]' : 'bottom-3'} ${className}`}
      data-testid="group-center-widget"
      data-variant="map"
    >
      {expanded ? (
        <div
          ref={cardRef}
          role="region"
          aria-label={t('algo.center.title')}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            // Esc trong popover "Vì sao?" chỉ đóng popover; thẻ giữ nguyên
            if ((e.target as HTMLElement).closest('[data-testid="center-why-body"]')) return;
            e.stopPropagation();
            setExpanded(false);
            // Chip được dựng lại sau khi thu lại: trả focus ở khung hình sau
            requestAnimationFrame(() => chipRef.current?.focus());
          }}
          className="w-80 max-w-[calc(100vw-1.5rem)] rounded-card border border-line bg-surface p-4 shadow-float focus:outline-none"
          data-testid="center-card"
        >
          <h2 className="mb-2 flex items-center gap-2 text-heading text-ink">
            <MapPin size={18} weight="fill" className="text-accent-text" aria-hidden="true" />
            {t('algo.center.title')}
          </h2>
          <CenterBody
            gc={gc}
            showRadius={showRadius}
            onCollapse={() => {
              setExpanded(false);
              requestAnimationFrame(() => chipRef.current?.focus());
            }}
            onShow={showNearby}
            placement="top"
          />
        </div>
      ) : (
        chip
      )}
    </div>
  );
};
