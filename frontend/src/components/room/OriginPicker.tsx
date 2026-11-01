import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapSearchBox } from '../map/MapSearchBox';
import { Segmented } from '../ui';
import { locateOnce, type OriginPoint } from '../../room/createRoom';

export interface OriginPickerProps {
  value: OriginPoint | null;
  onChange: (value: OriginPoint | null) => void;
  className?: string;
}

type Mode = 'here' | 'search' | 'later';

// Tâm TP.HCM: chỉ để xếp kết quả tìm kiếm khi chưa có toạ độ nào.
const FALLBACK_CENTER = { lat: 10.7769, lng: 106.7009 };

/** "Nhóm hẹn nhau ở đâu?": Chỗ tôi đang đứng / Tìm địa điểm / Để sau. Hỏi vị trí chỉ SAU khi bấm. */
export const OriginPicker: React.FC<OriginPickerProps> = ({ value, onChange, className = '' }) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('later');
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const choose = async (next: Mode) => {
    setNote(null);
    if (next === 'later') {
      setMode('later');
      onChange(null);
      return;
    }
    if (next === 'search') {
      setMode('search');
      return;
    }
    setMode('here');
    setLocating(true);
    const res = await locateOnce();
    setLocating(false);
    if (res.ok) {
      onChange({ lat: res.lat, lng: res.lng, label: t('room.create.originHereLabel') });
    } else {
      // Từ chối/lỗi: chuyển sang tìm địa điểm, giọng nhẹ — không báo lỗi đỏ.
      setMode('search');
      setNote(t(res.reason === 'denied' ? 'room.create.originDenied' : 'room.create.originFailed'));
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <Segmented<Mode>
        aria-label={t('room.create.originLabel')}
        value={mode}
        onChange={(m) => void choose(m)}
        disabled={locating}
        options={[
          { value: 'here', label: locating ? t('room.create.originLocating') : t('room.create.originHere') },
          { value: 'search', label: t('room.create.originSearch') },
          { value: 'later', label: t('room.create.originLater') },
        ]}
        className="max-w-full flex-wrap"
      />
      {note && (
        <p role="status" className="text-caption text-ink-2">
          {note}
        </p>
      )}
      {mode === 'search' && (
        <MapSearchBox
          getCenter={() => (value ? { lat: value.lat, lng: value.lng } : FALLBACK_CENTER)}
          onPick={(poi) => {
            setNote(null);
            onChange({ lat: poi.lat, lng: poi.lng, label: poi.name });
          }}
        />
      )}
      {value && mode !== 'later' && (
        <p className="text-label text-ink" data-testid="origin-chosen">
          <span className="text-ink-2">{t('room.create.originChosen')}: </span>
          <span className="font-medium">{value.label}</span>
        </p>
      )}
      {mode === 'later' && <p className="text-caption text-ink-3">{t('room.create.originLaterHint')}</p>}
    </div>
  );
};
