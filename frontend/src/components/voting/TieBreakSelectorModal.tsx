import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sheet,
  Button,
  TextField,
  toast,
  ThumbsUp,
  Clock,
  Sparkle,
  BowlFood,
  Shuffle,
} from '../ui';
import { usePlaceStore } from '../../store/usePlaceStore';
import { useRoomStore } from '../../store/useRoomStore';
import { describeApiError } from '../../i18n/serverText';
import type { TieBreakStrategyName } from '../../types';

export interface TieBreakSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  defaultStrategy?: TieBreakStrategyName;
  onSuccess?: () => void;
  isHost?: boolean;
}

export const TieBreakSelectorModal: React.FC<TieBreakSelectorModalProps> = ({
  isOpen,
  onClose,
  roomId,
  defaultStrategy = 'MOST_UPVOTES',
  onSuccess,
  isHost: propIsHost,
}) => {
  const { t } = useTranslation();
  const resolveVoting = usePlaceStore((s) => s.resolveVoting);
  const isLoading = usePlaceStore((s) => s.isLoading);
  const storeCurrentMember = useRoomStore((s) => s.currentMember);

  const isHost =
    propIsHost ?? (storeCurrentMember ? storeCurrentMember.role === 'HOST' : true);

  const [strategy, setStrategy] = useState<TieBreakStrategyName>(defaultStrategy);
  const [maxAcceptedPlaces, setMaxAcceptedPlaces] = useState<number>(3);
  const [error, setError] = useState<string | null>(null);

  const strategies: {
    id: TieBreakStrategyName;
    title: string;
    desc: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'MOST_UPVOTES',
      title: t('tiebreak.strategy.MOST_UPVOTES.title'),
      desc: t('tiebreak.strategy.MOST_UPVOTES.desc'),
      icon: <ThumbsUp size={18} />,
    },
    {
      id: 'EARLIEST_SUBMISSION',
      title: t('tiebreak.strategy.EARLIEST_SUBMISSION.title'),
      desc: t('tiebreak.strategy.EARLIEST_SUBMISSION.desc'),
      icon: <Clock size={18} />,
    },
    {
      id: 'CREATOR_PRIORITY',
      title: t('tiebreak.strategy.CREATOR_PRIORITY.title'),
      desc: t('tiebreak.strategy.CREATOR_PRIORITY.desc'),
      icon: <Sparkle size={18} />,
    },
    {
      id: 'CATEGORY_DIVERSITY',
      title: t('tiebreak.strategy.CATEGORY_DIVERSITY.title'),
      desc: t('tiebreak.strategy.CATEGORY_DIVERSITY.desc'),
      icon: <BowlFood size={18} />,
    },
    {
      id: 'RANDOM',
      title: t('tiebreak.strategy.RANDOM.title'),
      desc: t('tiebreak.strategy.RANDOM.desc'),
      icon: <Shuffle size={18} />,
    },
  ];

  const handleConfirm = async () => {
    setError(null);
    if (maxAcceptedPlaces < 1) {
      setError(t('tiebreak.minPlacesError'));
      return;
    }

    try {
      await resolveVoting(roomId, {
        strategy,
        max_accepted_places: maxAcceptedPlaces,
      });
      toast.success(t('tiebreak.success'));
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      setError(describeApiError(err, t, 'VOTE_FAILED'));
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('tiebreak.title')}
      description={t('tiebreak.description')}
      className="md:max-w-lg"
      footer={
        isHost ? (
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isLoading}
            >
              {t('tiebreak.cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirm}
              loading={isLoading}
              leftIcon={<Shuffle size={16} />}
            >
              {t('tiebreak.confirm')}
            </Button>
          </>
        ) : (
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('tiebreak.cancel')}
          </Button>
        )
      }
    >
      {isHost ? (
        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-danger-soft border border-danger/20 text-danger rounded-card text-caption font-medium">
              {error}
            </div>
          )}

          <div className="w-full">
            <TextField
              label={t('tiebreak.maxPlacesLabel')}
              type="number"
              min={1}
              max={20}
              value={maxAcceptedPlaces}
              onChange={(e) =>
                setMaxAcceptedPlaces(parseInt(e.target.value, 10) || 1)
              }
              hint={t('tiebreak.maxPlacesHelper')}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-caption font-semibold text-ink uppercase tracking-wider">
              {t('tiebreak.strategyLabel')}
            </label>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {strategies.map((item) => {
                const isSelected = strategy === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setStrategy(item.id)}
                    className={`p-3 rounded-card border text-left cursor-pointer transition flex items-start gap-3 ${
                      isSelected
                        ? 'border-accent bg-accent-soft/30 shadow-xs'
                        : 'border-line hover:border-accent/40 bg-surface'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isSelected
                          ? 'bg-accent text-ink'
                          : 'bg-surface-2 text-ink-2'
                      }`}
                    >
                      {item.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-body font-bold text-ink">
                          {item.title}
                        </span>
                        <input
                          type="radio"
                          name="tiebreak-strategy"
                          checked={isSelected}
                          onChange={() => setStrategy(item.id)}
                          className="accent-accent h-4 w-4"
                        />
                      </div>
                      <p className="text-caption text-ink-2 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="py-8 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-surface-2 text-ink-2 flex items-center justify-center mb-3">
            <Clock size={24} />
          </div>
          <h3 className="text-heading font-semibold text-ink mb-1.5">
            {t('tiebreak.waitingTitle')}
          </h3>
          <p className="text-body text-ink-2 max-w-sm">
            {t('tiebreak.waitingDesc')}
          </p>
        </div>
      )}
    </Sheet>
  );
};

export const TieBreakSelectorSheet = TieBreakSelectorModal;
