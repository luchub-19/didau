import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaceStore } from '../../store/usePlaceStore';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { MapTrifold, CaretDown, CaretUp } from '../ui/Icon';
import { toast } from '../ui/toastStore';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import { useRoomTab } from '../shell/useRoomTab';
import type { PlaceCategory } from '../../types';

export interface PlaceFormProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  onSwitchToMap?: () => void;
}

// Chuyển chuỗi "HH:mm" thành số phút nguyên (0 - 1439)
function timeToMinutes(timeStr: string): number | undefined {
  if (!timeStr) return undefined;
  const parts = timeStr.split(':');
  if (parts.length !== 2) return undefined;
  const hours = parseInt(parts[0], 10);
  const mins = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(mins)) return undefined;
  return hours * 60 + mins;
}

const CATEGORY_LIST: PlaceCategory[] = [
  'OTHER',
  'FOOD',
  'DRINK',
  'ENTERTAINMENT',
  'SIGHTSEEING',
  'ACCOMMODATION',
  'SHOPPING',
];

export const PlaceForm: React.FC<PlaceFormProps> = ({
  isOpen,
  onClose,
  roomId,
  onSwitchToMap,
}) => {
  const { t } = useTranslation();
  const { setTab } = useRoomTab();
  const addPlace = usePlaceStore((s) => s.addPlace);
  const isLoading = usePlaceStore((s) => s.isLoading);

  const [nameOrUrl, setNameOrUrl] = useState('');
  const [category, setCategory] = useState<PlaceCategory>('OTHER');
  const [address, setAddress] = useState('');
  const [url, setUrl] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [openTime, setOpenTime] = useState('');
  const [closeTime, setCloseTime] = useState('');
  const [notes, setNotes] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setNameOrUrl('');
    setCategory('OTHER');
    setAddress('');
    setUrl('');
    setEstimatedCost('');
    setOpenTime('');
    setCloseTime('');
    setNotes('');
    setShowDetails(false);
    setError(null);
  };

  const handleSwitchToMap = () => {
    resetForm();
    onClose();
    if (onSwitchToMap) {
      onSwitchToMap();
    } else {
      setTab('map');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError(null);

    const trimmedInput = nameOrUrl.trim();
    if (!trimmedInput) {
      setError(t('place.form.errName'));
      return;
    }

    const isUrl = trimmedInput.startsWith('http://') || trimmedInput.startsWith('https://');
    const finalUrl = isUrl ? trimmedInput : (url.trim() || undefined);
    const finalName = isUrl
      ? trimmedInput.replace(/^https?:\/\//i, '').split('/')[0] || trimmedInput
      : trimmedInput;

    try {
      await addPlace(roomId, {
        name: finalName,
        category,
        address: address.trim() || undefined,
        url: finalUrl,
        estimated_cost: estimatedCost ? Number(estimatedCost) : undefined,
        open_minute: timeToMinutes(openTime),
        close_minute: timeToMinutes(closeTime),
        notes: notes.trim() || undefined,
      });

      toast.success(t('place.form.success'));
      resetForm();
      onClose();
    } catch {
      setError(t('place.form.errGeneric'));
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={() => {
        resetForm();
        onClose();
      }}
      title={t('place.form.title')}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              resetForm();
              onClose();
            }}
            disabled={isLoading}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            form="place-form"
            loading={isLoading}
          >
            {t('place.form.submit')}
          </Button>
        </>
      }
    >
      <form id="place-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-danger-soft border border-danger/20 text-danger rounded-card text-caption font-medium">
            {error}
          </div>
        )}

        {/* Ô đầu tiên: Tên quán hoặc link */}
        <TextField
          label={t('place.form.nameOrUrlLabel')}
          placeholder={t('place.form.nameOrUrlPlaceholder')}
          value={nameOrUrl}
          onChange={(e) => setNameOrUrl(e.target.value)}
          required
          autoFocus
        />

        {/* Danh mục tự nhận diện */}
        <div className="space-y-1.5">
          <label
            htmlFor="place-category-select"
            className="block text-label font-medium text-ink"
          >
            {t('place.form.categoryLabel')}
          </label>
          <select
            id="place-category-select"
            value={category}
            onChange={(e) => setCategory(e.target.value as PlaceCategory)}
            className="block w-full min-h-[44px] rounded-field border border-line bg-surface px-3 py-2 text-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
          >
            {CATEGORY_LIST.map((catKey) => (
              <option key={catKey} value={catKey}>
                {catKey === 'OTHER'
                  ? t('place.form.autoCategory')
                  : CATEGORY_METADATA[catKey].label}
              </option>
            ))}
          </select>
        </div>

        {/* Nút bật/tắt Thêm chi tiết */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="inline-flex items-center gap-1.5 text-label font-medium text-ink-2 [@media(hover:hover)]:hover:text-ink cursor-pointer select-none"
          >
            {showDetails ? <CaretUp size={16} /> : <CaretDown size={16} />}
            <span>{showDetails ? t('place.form.hideDetails') : t('place.form.moreDetails')}</span>
          </button>
        </div>

        {/* Vùng chi tiết thu gọn */}
        {showDetails && (
          <div className="space-y-3 pt-1 border-t border-line/60">
            <TextField
              label={t('place.form.addressLabel')}
              placeholder={t('place.form.addressPlaceholder')}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />

            <TextField
              label={t('place.form.costLabel')}
              type="number"
              min="0"
              step="5000"
              placeholder={t('place.form.costPlaceholder')}
              value={estimatedCost}
              onChange={(e) => setEstimatedCost(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-3">
              <TextField
                label={t('place.form.openTimeLabel')}
                type="time"
                value={openTime}
                onChange={(e) => setOpenTime(e.target.value)}
              />
              <TextField
                label={t('place.form.closeTimeLabel')}
                type="time"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
              />
            </div>

            <TextField
              label={t('place.form.urlLabel')}
              placeholder={t('place.form.urlPlaceholder')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />

            <div className="space-y-1.5">
              <label
                htmlFor="place-notes"
                className="block text-label font-medium text-ink"
              >
                {t('place.form.notesLabel')}
              </label>
              <textarea
                id="place-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('place.form.notesPlaceholder')}
                className="block w-full rounded-field border border-line bg-surface p-3 text-body text-ink placeholder:text-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
              />
            </div>
          </div>
        )}

        {/* Gợi ý chọn trên bản đồ */}
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={handleSwitchToMap}
            className="inline-flex items-center gap-1.5 text-caption font-semibold text-accent-text hover:underline cursor-pointer"
          >
            <MapTrifold size={16} />
            <span>{t('place.orPickOnMap')}</span>
          </button>
        </div>
      </form>
    </Sheet>
  );
};
