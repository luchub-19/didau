import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDecisionStore } from '../../store/useDecisionStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import {
  Sheet,
  Segmented,
  Button,
  Sparkle,
  Shuffle,
  HandSwipeLeft,
  SlidersHorizontal,
} from '../ui';
import { SmartPickCard } from './SmartPickCard';
import { SpinWheel } from './SpinWheel';
import { SwipeDeck } from './SwipeDeck';
import { LuckyLadder } from './LuckyLadder';
import type { DecisionMode, Member, Place, ScoredPick } from '../../types';

export interface DecideModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  isHost: boolean;
  selectedMode?: DecisionMode;
  smartPicks?: ScoredPick[];
  places?: Place[];
  members?: Member[];
}

export const DecideModal: React.FC<DecideModalProps> = ({
  isOpen,
  onClose,
  roomId,
  isHost,
  selectedMode: propSelectedMode,
  smartPicks,
  places: propPlaces,
  members,
}) => {
  const { t } = useTranslation();
  const storeSelectedMode = useDecisionStore((s) => s.selectedMode);
  const setSelectedMode = useDecisionStore((s) => s.setSelectedMode);
  const selectedMode = propSelectedMode ?? storeSelectedMode ?? 'SMART';

  const storePlaces = usePlaceStore((s) => s.places);
  const places = propPlaces ?? storePlaces;

  // View state: cho phép chuyển giữa danh sách chọn chế độ và màn chơi trực tiếp
  const [isChoosingMode, setIsChoosingMode] = useState(false);

  // Mở lại sheet luôn bắt đầu ở màn chơi, không kẹt ở danh sách chế độ
  useEffect(() => {
    if (!isOpen) setIsChoosingMode(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const modeDefinitions: {
    mode: DecisionMode;
    icon: React.ReactNode;
    name: string;
    shortName: string;
    desc: string;
    eligible: boolean;
    disabledReason?: string;
  }[] = [
    {
      mode: 'SMART',
      icon: <Sparkle size={18} />,
      name: t('decide.modal.modes.SMART.name'),
      shortName: t('decide.modal.modes.SMART.shortName'),
      desc: t('decide.modal.modes.SMART.desc'),
      eligible: places.length >= 1,
      disabledReason: places.length < 1 ? t('decide.modal.needPlaces_one') : undefined,
    },
    {
      mode: 'WHEEL',
      icon: <Shuffle size={18} />,
      name: t('decide.modal.modes.WHEEL.name'),
      shortName: t('decide.modal.modes.WHEEL.shortName'),
      desc: t('decide.modal.modes.WHEEL.desc'),
      eligible: places.length >= 2,
      disabledReason: places.length < 2 ? t('decide.modal.needPlaces_other', { count: 2 }) : undefined,
    },
    {
      mode: 'SWIPE',
      icon: <HandSwipeLeft size={18} />,
      name: t('decide.modal.modes.SWIPE.name'),
      shortName: t('decide.modal.modes.SWIPE.shortName'),
      desc: t('decide.modal.modes.SWIPE.desc'),
      eligible: places.length >= 2,
      disabledReason: places.length < 2 ? t('decide.modal.needPlaces_other', { count: 2 }) : undefined,
    },
    {
      mode: 'LADDER',
      icon: <SlidersHorizontal size={18} />,
      name: t('decide.modal.modes.LADDER.name'),
      shortName: t('decide.modal.modes.LADDER.shortName'),
      desc: t('decide.modal.modes.LADDER.desc'),
      eligible: places.length >= 2,
      disabledReason: places.length < 2 ? t('decide.modal.needPlaces_other', { count: 2 }) : undefined,
    },
  ];

  // Chế độ đã lưu mà không còn đủ điều kiện (ví dụ < 2 quán) thì lùi về Gợi ý thông minh
  const requestedDef = modeDefinitions.find((m) => m.mode === selectedMode);
  const currentModeDef =
    requestedDef && requestedDef.eligible
      ? requestedDef
      : modeDefinitions.find((m) => m.eligible) || modeDefinitions[0];
  const activeMode = currentModeDef.mode;
  const firstLocked = modeDefinitions.find((m) => !m.eligible);

  const segmentedOptions = modeDefinitions.map((m) => ({
    value: m.mode,
    label: m.shortName,
    icon: m.icon,
    disabled: !m.eligible,
  }));

  const handleSelectMode = (mode: DecisionMode) => {
    setSelectedMode(mode);
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('decide.modal.title')}
      description={t('decide.modal.description')}
      closeLabel={t('decide.modal.close')}
      className="md:max-w-xl"
    >
      <div className="space-y-4">
        {/* Thanh chuyển chế độ nhanh Segmented */}
        <div className="overflow-x-auto pb-1 no-scrollbar">
          <Segmented
            options={segmentedOptions}
            value={activeMode}
            onChange={(mode) => {
              handleSelectMode(mode);
              setIsChoosingMode(false);
            }}
            size="sm"
            className="w-full flex justify-between"
          />
          {firstLocked?.disabledReason && (
            <p className="text-caption text-ink-2 mt-2">{firstLocked.disabledReason}</p>
          )}
        </div>

        {/* Danh sách chọn chế độ khi bật isChoosingMode */}
        {isChoosingMode ? (
          <div className="space-y-3">
            <div className="space-y-2" role="radiogroup" aria-label={t('decide.modal.title')}>
              {modeDefinitions.map((item) => {
                const isSelected = activeMode === item.mode;
                return (
                  <label
                    key={item.mode}
                    className={`p-3.5 min-h-11 rounded-card border transition-colors flex items-start gap-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                      !item.eligible
                        ? 'opacity-60 cursor-not-allowed border-line bg-surface-2'
                        : isSelected
                          ? 'border-accent bg-accent-soft/30 cursor-pointer shadow-xs'
                          : 'border-line bg-surface hover:bg-surface-2 cursor-pointer'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
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
                          {item.name}
                        </span>
                        <input
                          type="radio"
                          name="decision-mode"
                          checked={isSelected}
                          disabled={!item.eligible}
                          onChange={() => {
                            if (item.eligible) setSelectedMode(item.mode);
                          }}
                          className="accent-accent h-5 w-5"
                        />
                      </div>
                      <p className="text-caption text-ink-2 mt-0.5">{item.desc}</p>
                      {!item.eligible && item.disabledReason && (
                        <p className="text-caption font-medium text-danger mt-1">
                          {item.disabledReason}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                variant="primary"
                onClick={() => setIsChoosingMode(false)}
                disabled={!currentModeDef.eligible}
              >
                {t('decide.modal.start')}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            {/* Tóm tắt chế độ hiện tại + nút xem danh sách chế độ */}
            <div className="flex items-center justify-between mb-3 px-1 text-caption text-ink-2">
              <span className="font-medium truncate">{currentModeDef.desc}</span>
              <button
                type="button"
                onClick={() => setIsChoosingMode(true)}
                className="min-h-11 px-2 text-caption font-semibold text-accent-text hover:underline flex-shrink-0 ml-2"
              >
                {t('decide.modal.changeMode')}
              </button>
            </div>

            {/* Nội dung theo chế độ đã chọn */}
            {activeMode === 'SMART' && (
              <SmartPickCard
                roomId={roomId}
                isHost={isHost}
                smartPicks={smartPicks}
                places={places}
                onOpenWheel={() => {
                  setSelectedMode('WHEEL');
                  setIsChoosingMode(false);
                }}
              />
            )}

            {activeMode === 'WHEEL' && (
              <SpinWheel roomId={roomId} isHost={isHost} places={places} />
            )}

            {activeMode === 'SWIPE' && (
              <SwipeDeck roomId={roomId} isHost={isHost} places={places} />
            )}

            {activeMode === 'LADDER' && (
              <LuckyLadder
                roomId={roomId}
                isHost={isHost}
                places={places}
                members={members}
              />
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
};

export const DecideSheet = DecideModal;
