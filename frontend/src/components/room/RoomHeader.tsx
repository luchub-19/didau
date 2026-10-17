import React, { useState } from 'react';
import { Badge, Button } from '../common';
import type { Member, Room } from '../../types';

export interface RoomHeaderProps {
  room: Room;
  currentMember: Member | null;
  onGoHome: () => void;
  onOpenTieBreakModal?: () => void;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  room,
  currentMember,
  onGoHome,
  onOpenTieBreakModal,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyLink = async () => {
    try {
      const shareUrl = `${window.location.origin}/rooms/${room.id}?code=${room.code}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  const isHost = currentMember?.role === 'HOST';

  // Format date: YYYY-MM-DD -> DD/MM/YYYY
  const formattedDate = (() => {
    try {
      const [year, month, day] = room.event_date.split('-');
      return `${day}/${month}/${year}`;
    } catch {
      return room.event_date;
    }
  })();

  return (
    <div className="bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Room info */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onGoHome}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium transition"
              >
                &larr; Trang chủ
              </button>
              <span className="text-slate-300">•</span>
              <Badge variant={room.status}>{room.status}</Badge>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                📅 <strong>{formattedDate}</strong>
              </span>
              {room.budget_limit && (
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  💰{' '}
                  <span className="font-semibold text-slate-700">
                    {room.budget_limit.toLocaleString('vi-VN')} đ
                  </span>
                  /người
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {room.title}
            </h1>

            {room.description && (
              <p className="text-sm text-slate-600 max-w-2xl">{room.description}</p>
            )}
          </div>

          {/* Action buttons & current member */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Room code tag */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Mã phòng:
              </span>
              <span className="font-mono font-bold text-slate-900 text-sm tracking-wider">
                {room.code}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                title="Sao chép mã phòng"
                className="text-slate-400 hover:text-sky-600 p-1 transition"
              >
                {copiedCode ? (
                  <span className="text-xs text-emerald-600 font-semibold">✓</span>
                ) : (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                )}
              </button>
            </div>

            {/* Share link button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              leftIcon={
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                  />
                </svg>
              }
            >
              {copiedLink ? 'Đã chép link!' : 'Chia sẻ'}
            </Button>

            {/* Host TieBreak action trigger if Host */}
            {isHost && onOpenTieBreakModal && room.status !== 'FINALIZED' && (
              <Button
                variant="primary"
                size="sm"
                onClick={onOpenTieBreakModal}
                leftIcon={<span>⚖️</span>}
              >
                Chốt kết quả (TieBreak)
              </Button>
            )}

            {/* Current user pill */}
            {currentMember && (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                <img
                  src={
                    currentMember.avatar_url ||
                    `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
                      currentMember.nickname,
                    )}`
                  }
                  alt={currentMember.nickname}
                  className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200"
                />
                <div className="text-left">
                  <div className="text-xs font-bold text-slate-800 leading-tight">
                    {currentMember.nickname}
                  </div>
                  <Badge variant={currentMember.role} size="sm">
                    {currentMember.role}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
