import React from 'react';
import { useDecisionStore } from '../../store/useDecisionStore';
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
  places,
  members,
}) => {
  const storeSelectedMode = useDecisionStore((s) => s.selectedMode);
  const selectedMode = propSelectedMode ?? storeSelectedMode;
  const setSelectedMode = useDecisionStore((s) => s.setSelectedMode);

  if (!isOpen) return null;

  const tabs: { mode: DecisionMode; label: string; icon: string; isReady: boolean }[] = [
    { mode: 'SMART', label: 'Gợi ý 1 chạm', icon: '💡', isReady: true },
    { mode: 'WHEEL', label: 'Vòng quay', icon: '🎡', isReady: true },
    { mode: 'SWIPE', label: 'Quẹt thẻ', icon: '👆', isReady: true },
    { mode: 'LADDER', label: 'Thang may mắn', icon: '🪜', isReady: true },
  ];

  return (
    <div
      data-testid="decide-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto animate-fade-in"
    >
      <div
        data-testid="decide-modal-content"
        className="bg-slate-50 rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden"
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-lg font-bold">
              🎲
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 leading-tight">
                Chọn hộ khi phân vân
              </h2>
              <p className="text-xs text-slate-500">
                Quyết định nhanh chóng bằng thuật toán hoặc trò chơi công bằng
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng chọn hộ"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center gap-1.5 px-6 pt-3 pb-1 border-b border-slate-200 bg-white overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const isActive = selectedMode === tab.mode;
            return (
              <button
                key={tab.mode}
                type="button"
                onClick={() => {
                  if (tab.isReady) setSelectedMode(tab.mode);
                }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {selectedMode === 'SMART' && (
            <SmartPickCard
              roomId={roomId}
              isHost={isHost}
              smartPicks={smartPicks}
              places={places}
              onOpenWheel={() => setSelectedMode('WHEEL')}
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
      </div>
    </div>
  );
};
