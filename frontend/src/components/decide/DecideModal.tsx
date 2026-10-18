import React, { useState } from 'react';
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

  const currentModeDef =
    modeDefinitions.find((m) => m.mode === selectedMode) || modeDefinitions[0];

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
            value={selectedMode}
            onChange={(mode) => {
              handleSelectMode(mode);
              setIsChoosingMode(false);
            }}
            size="sm"
            className="w-full flex justify-between"
          />
        </div>

        {/* Danh sách chọn chế độ khi bật isChoosingMode */}
        {isChoosingMode ? (
          <div className="space-y-3">
            <div className="space-y-2">
              {modeDefinitions.map((item) => {
                const isSelected = selectedMode === item.mode;
                return (
                  <div
                    key={item.mode}
                    onClick={() => {
                      if (item.eligible) {
                        setSelectedMode(item.mode);
                      }
                    }}
                    className={`p-3.5 rounded-card border transition flex items-start gap-3 ${
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
                          className="accent-accent h-4 w-4"
                        />
                      </div>
                      <p className="text-caption text-ink-2 mt-0.5">{item.desc}</p>
                      {!item.eligible && item.disabledReason && (
                        <p className="text-[11px] font-medium text-danger mt-1">
                          {item.disabledReason}
                        </p>
                      )}
                    </div>
                  </div>
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
                className="text-caption font-semibold text-accent-text hover:underline flex-shrink-0 ml-2"
              >
                {t('decide.modal.changeMode')}
              </button>
            </div>

            {/* Nội dung theo chế độ đã chọn */}
            {selectedMode === 'SMART' && (
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

            {selectedMode === 'WHEEL' && (
              <SpinWheel roomId={roomId} isHost={isHost} places={places} />
            )}

            {selectedMode === 'SWIPE' && (
              <SwipeDeck roomId={roomId} isHost={isHost} places={places} />
            )}

            {selectedMode === 'LADDER' && (
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
