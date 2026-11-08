// "Xuất phát từ đâu?" (DESIGN gđ6 §8, CR-11): hàng trong menu avatar + Sheet nhỏ.
// Chia sẻ là TUỲ CHỌN. Nhóm chỉ thấy khu vực trung tâm; toạ độ của mình chỉ đi lên server, không hiện lại ở đâu cả.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Member, Poi, Room } from '../../types';
import { Button, Sheet, toast } from '../ui';
import { CaretDown, MapPin } from '../ui/Icon';
import { MapSearchBox } from '../map/MapSearchBox';
import { useAlgoStore } from '../../store/useAlgoStore';
import { useMapStore } from '../../store/useMapStore';
import { useRoomStore } from '../../store/useRoomStore';
import { describeApiError } from '../../i18n/serverText';
import { locateOnce, originStatus, searchCenter, type GeoFailure } from '../../room/origin';

/* ---------- Hàng trong menu ---------- */

export interface OriginRowProps {
  onOpen: () => void;
  /** Ghi đè nguồn dữ liệu (test, vì SSR đọc store ở trạng thái đầu). */
  source?: { member?: Member | null; label?: string | null };
}

/** "Xuất phát từ: Chưa chia sẻ / Đã chia sẻ" — bấm mở Sheet. Đứng dưới "Thông tin chuyến". */
export const OriginRow: React.FC<OriginRowProps> = ({ onOpen, source }) => {
  const { t } = useTranslation();
  const storeMe = useRoomStore((s) => s.currentMember);
  const storeLabel = useAlgoStore((s) => s.originLabel);
  const me = source && 'member' in source ? (source.member ?? null) : storeMe;
  const label = source && 'label' in source ? (source.label ?? null) : storeLabel;
  const shared = originStatus(me) === 'shared';
  const value = shared ? (label ?? t('algo.origin.shared')) : t('algo.origin.none');

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="origin-row"
      data-shared={shared}
      className="flex min-h-[44px] w-full items-center gap-3 rounded-card border border-line bg-surface px-4 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
    >
      <MapPin size={20} weight={shared ? 'fill' : 'regular'} className={shared ? 'text-accent-text' : 'text-ink-2'} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-caption text-ink-2">{t('algo.origin.rowLabel')}</span>
        <span className="block truncate text-body font-medium text-ink" data-testid="origin-row-value">
          {value}
        </span>
      </span>
      <CaretDown size={14} className="-rotate-90 text-ink-2" aria-hidden="true" />
    </button>
  );
};

/* ---------- Sheet ---------- */

export interface OriginSettingProps {
  room: Pick<Room, 'id' | 'origin_lat' | 'origin_lng' | 'city'>;
  isOpen: boolean;
  onClose: () => void;
}

type Busy = null | 'locating' | 'saving';

export const OriginSetting: React.FC<OriginSettingProps> = ({ room, isOpen, onClose }) => {
  const { t } = useTranslation();
  const me = useRoomStore((s) => s.currentMember);
  const updateMyOrigin = useRoomStore((s) => s.updateMyOrigin);
  const setOriginLabel = useAlgoStore((s) => s.setOriginLabel);
  const clearSearch = useMapStore((s) => s.clearSearch);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const shared = originStatus(me) === 'shared';

  const close = () => {
    clearSearch();
    setError(null);
    onClose();
  };

  const save = async (point: { lat: number; lng: number } | null, label: string | null) => {
    setBusy('saving');
    setError(null);
    try {
      await updateMyOrigin(room.id, point);
      setOriginLabel(label);
      toast.success(point ? t('algo.origin.saved') : t('algo.origin.cleared'));
      close();
    } catch (err: unknown) {
      setError(describeApiError(err, t, 'UPDATE_ORIGIN_FAILED'));
    } finally {
      setBusy(null);
    }
  };

  const shareCurrent = async () => {
    setBusy('locating');
    setError(null);
    try {
      const point = await locateOnce();
      await save(point, t('algo.origin.currentLabel'));
    } catch (failure: unknown) {
      setBusy(null);
      setError(failure === ('denied' satisfies GeoFailure) ? t('algo.origin.errDenied') : t('algo.origin.errUnavailable'));
    }
  };

  const pick = (poi: Poi) => void save({ lat: poi.lat, lng: poi.lng }, poi.name);

  return (
    <Sheet
      isOpen={isOpen}
      onClose={close}
      title={t('algo.origin.sheetTitle')}
      description={t('algo.origin.privacy')}
    >
      <div className="space-y-4 pb-2" data-testid="origin-setting">
        <Button
          variant="primary"
          fullWidth
          onClick={() => void shareCurrent()}
          loading={busy === 'locating'}
          disabled={busy !== null}
          leftIcon={<MapPin size={18} weight="fill" aria-hidden="true" />}
          data-testid="origin-use-current"
        >
          {busy === 'locating' ? t('algo.origin.locating') : t('algo.origin.useCurrent')}
        </Button>

        <div>
          <p className="mb-1.5 text-label font-semibold text-ink-2">{t('algo.origin.searchLabel')}</p>
          <MapSearchBox getCenter={() => searchCenter(room)} onPick={pick} />
        </div>

        {error && (
          <p role="alert" className="text-caption text-danger" data-testid="origin-error">
            {error}
          </p>
        )}

        {shared && (
          <Button
            variant="ghost"
            fullWidth
            onClick={() => void save(null, null)}
            disabled={busy !== null}
            data-testid="origin-clear"
          >
            {t('algo.origin.clear')}
          </Button>
        )}
      </div>
    </Sheet>
  );
};
