import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, CaretDown, CharacterAvatar, Chip, Sheet, Shuffle, TextField, randomSeed, toast } from '../ui';
import { useRoomStore } from '../../store/useRoomStore';
import { describeRoomError } from './roomErrors';
import { BudgetChips } from './BudgetChips';
import { OriginPicker } from './OriginPicker';
import { minuteToTimeString, timeStringToMinute } from '../../i18n/format';
import { cityFromCoords } from '../../room/city';
import { buildCreatePayload, localIsoDate, type BudgetChoice, type OriginPoint } from '../../room/createRoom';
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
  const [seed, setSeed] = useState(randomSeed);
  const [showMore, setShowMore] = useState(false);
  const [dateChoice, setDateChoice] = useState<'today' | 'tomorrow' | 'pick'>('tomorrow');
  const [pickedDate, setPickedDate] = useState(() => localIsoDate(2));
  const [origin, setOrigin] = useState<OriginPoint | null>(null);
  const [budget, setBudget] = useState<BudgetChoice>('none');
  const [city, setCity] = useState('HCM');
  const [startTime, setStartTime] = useState(minuteToTimeString(DEFAULT_START));
  const [endTime, setEndTime] = useState(minuteToTimeString(DEFAULT_END));
  const [customBudget, setCustomBudget] = useState('');
  const [strategy, setStrategy] = useState<TieBreakStrategyName>('EARLIEST_SUBMISSION');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    const next: FieldErrors = {};
    const eventDate =
      dateChoice === 'today' ? localIsoDate(0) : dateChoice === 'tomorrow' ? localIsoDate(1) : pickedDate;
    const startMinute = timeStringToMinute(startTime);
    const endMinute = timeStringToMinute(endTime);
    if (!title.trim()) next.title = t('room.create.errTitle');
    if (!nickname.trim()) next.nickname = t('room.create.errNickname');
    if (!eventDate) next.date = t('room.create.errDate');
    if (endMinute <= startMinute) next.time = t('room.create.errTime');
    setErrors(next);
    if (Object.keys(next).length > 0) {
      
      return;
    }

    try {
      const res = await createRoom(
        buildCreatePayload({
          title,
          nickname,
          avatarSeed: seed,
          eventDate,
          startMinute,
          endMinute,
          origin,
          city,
          budget,
          customBudget,
          strategy,
          description,
        }),
      );

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
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-5 pb-2" noValidate>
        <div className="flex items-end gap-3">
          <div className="flex flex-col items-center gap-1.5">
            <CharacterAvatar fallbackSeed={seed} name={t('avatar.preview')} size={56} />
          </div>
          <div className="min-w-0 flex-1">
            <TextField
              label={t('room.create.nicknameLabel')}
              placeholder={t('room.create.nicknamePlaceholder')}
              error={errors.nickname}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={30}
              required
            />
          </div>
        </div>
        <Button
          variant="secondary"
          type="button"
          leftIcon={<Shuffle size={18} aria-hidden="true" />}
          onClick={() => setSeed(randomSeed())}
          disabled={isLoading}
        >
          {t('avatar.reroll')}
        </Button>

        <TextField
          label={t('room.create.titleLabel')}
          placeholder={t('room.create.titlePlaceholder')}
          error={errors.title}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          required
        />

        <fieldset className="space-y-2">
          <legend className="text-label font-semibold text-ink-2">{t('room.create.when')}</legend>
          <div className="flex flex-wrap gap-2">
            <Chip selected={dateChoice === 'today'} onClick={() => setDateChoice('today')}>
              {t('room.create.today')}
            </Chip>
            <Chip selected={dateChoice === 'tomorrow'} onClick={() => setDateChoice('tomorrow')}>
              {t('room.create.tomorrow')}
            </Chip>
            <Chip selected={dateChoice === 'pick'} onClick={() => setDateChoice('pick')}>
              {t('room.create.pickDate')}
            </Chip>
          </div>
          {dateChoice === 'pick' && (
            <TextField
              label={t('room.create.date')}
              type="date"
              error={errors.date}
              value={pickedDate}
              min={localIsoDate(0)}
              onChange={(e) => setPickedDate(e.target.value)}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
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
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-label font-semibold text-ink-2">{t('room.create.originLabel')}</legend>
          <OriginPicker value={origin} onChange={setOrigin} />
          {!(origin && cityFromCoords(origin.lat, origin.lng)) && (
            <TextField
              as="select"
              label={t('room.create.city')}
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              <option value="HCM">{t('room.create.cityHcm')}</option>
              <option value="HN">{t('room.create.cityHn')}</option>
            </TextField>
          )}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-label font-semibold text-ink-2">{t('room.create.budget')}</legend>
          <BudgetChips value={budget} onChange={setBudget} />
          {budget === 'custom' && (
            <TextField
              label={t('room.create.budgetCustom')}
              type="number"
              inputMode="numeric"
              min="0"
              step="10000"
              value={customBudget}
              onChange={(e) => setCustomBudget(e.target.value)}
            />
          )}
          <p className="text-caption text-ink-3">{t('room.create.budgetHint')}</p>
        </fieldset>

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
