import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, CaretDown, Sheet, TextField, toast } from '../ui';
import { useRoomStore } from '../../store/useRoomStore';
import { describeRoomError } from './roomErrors';
import { minuteToTimeString, timeStringToMinute } from '../../i18n/format';
import type { TieBreakStrategyName } from '../../types';

export interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (roomId: string) => void;
}

const FORM_ID = 'create-room-form';

// Khung giờ mặc định của phòng: 17:00–23:00 (CLAUDE.md)
const DEFAULT_START = 1020;
const DEFAULT_END = 1380;

const STRATEGIES: { value: TieBreakStrategyName; key: 'room.create.strategyEarliest' | 'room.create.strategyUpvotes' | 'room.create.strategyCreator' | 'room.create.strategyDiversity' | 'room.create.strategyRandom' }[] = [
  { value: 'EARLIEST_SUBMISSION', key: 'room.create.strategyEarliest' },
  { value: 'MOST_UPVOTES', key: 'room.create.strategyUpvotes' },
  { value: 'CREATOR_PRIORITY', key: 'room.create.strategyCreator' },
  { value: 'CATEGORY_DIVERSITY', key: 'room.create.strategyDiversity' },
  { value: 'RANDOM', key: 'room.create.strategyRandom' },
];

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

type FieldErrors = Partial<Record<'title' | 'date' | 'nickname' | 'time' | 'form', string>>;

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const createRoom = useRoomStore((s) => s.createRoom);
  const isLoading = useRoomStore((s) => s.isLoading);

  const [title, setTitle] = useState('');
  const [nickname, setNickname] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [eventDate, setEventDate] = useState(tomorrowIso);
  const [city, setCity] = useState('HCM');
  const [startTime, setStartTime] = useState(minuteToTimeString(DEFAULT_START));
  const [endTime, setEndTime] = useState(minuteToTimeString(DEFAULT_END));
  const [budgetLimit, setBudgetLimit] = useState('');
  const [strategy, setStrategy] = useState<TieBreakStrategyName>('EARLIEST_SUBMISSION');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    const next: FieldErrors = {};
    const startMinute = timeStringToMinute(startTime);
    const endMinute = timeStringToMinute(endTime);
    if (!title.trim()) next.title = t('room.create.errTitle');
    if (!nickname.trim()) next.nickname = t('room.create.errNickname');
    if (!eventDate) next.date = t('room.create.errDate');
    if (endMinute <= startMinute) next.time = t('room.create.errTime');
    setErrors(next);
    if (Object.keys(next).length > 0) {
      // Lỗi nằm trong phần thu gọn thì mở ra để người dùng thấy
      if (next.date || next.time) setShowMore(true);
      return;
    }

    try {
      const res = await createRoom({
        title: title.trim(),
        event_date: eventDate,
        creator_nickname: nickname.trim(),
        creator_avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
          nickname.trim(),
        )}`,
        description: description.trim() || undefined,
        budget_limit: budgetLimit ? Number(budgetLimit) : undefined,
        tie_break_strategy: strategy,
        city,
        start_minute: startMinute,
        end_minute: endMinute,
      });

      onClose();
      toast.success(t('room.create.success'));
      onSuccess(res.room.id);
    } catch (err: unknown) {
      setErrors({ form: describeRoomError(err, t, 'room.create.errGeneric') });
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('room.create.title')}
      description={t('room.create.desc')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} loading={isLoading}>
            {t('room.create.submit')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4 pb-2" noValidate>
        <TextField
          label={t('room.create.titleLabel')}
          placeholder={t('room.create.titlePlaceholder')}
          error={errors.title}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          required
        />
        <TextField
          label={t('room.create.nicknameLabel')}
          placeholder={t('room.create.nicknamePlaceholder')}
          error={errors.nickname}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={30}
          required
        />

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          aria-controls="create-room-more"
          className="inline-flex items-center gap-1.5 min-h-[44px] text-label font-medium text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text rounded-field"
        >
          {t('room.create.more')}
          <CaretDown size={16} className={showMore ? 'rotate-180' : ''} />
        </button>

        {showMore && (
          <div id="create-room-more" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField
                label={t('room.create.date')}
                type="date"
                error={errors.date}
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
              <TextField
                as="select"
                label={t('room.create.city')}
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                <option value="HCM">{t('room.create.cityHcm')}</option>
                <option value="HN">{t('room.create.cityHn')}</option>
              </TextField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <TextField
                label={t('room.create.startTime')}
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <TextField
                label={t('room.create.endTime')}
                type="time"
                error={errors.time}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>

            <TextField
              label={t('room.create.budget')}
              hint={t('room.create.budgetHint')}
              type="number"
              inputMode="numeric"
              min="0"
              step="10000"
              value={budgetLimit}
              onChange={(e) => setBudgetLimit(e.target.value)}
            />

            <TextField
              as="select"
              label={t('room.create.strategy')}
              hint={t('room.create.strategyHint')}
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as TieBreakStrategyName)}
            >
              {STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {t(s.key)}
                </option>
              ))}
            </TextField>

            <TextField
              as="textarea"
              label={t('room.create.note')}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        )}

        {errors.form && (
          <p role="alert" className="text-caption text-danger">
            {errors.form}
          </p>
        )}
      </form>
    </Sheet>
  );
};
