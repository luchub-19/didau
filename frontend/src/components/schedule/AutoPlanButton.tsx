import React from 'react';
import type { Member, Place } from '../../types';
import { Button } from '../common/Button';
import { decisionApi } from '../../services/api/decisionApi';

export interface AutoPlanButtonProps {
  roomId: string;
  places: Place[];
  members?: Member[];
  isHost?: boolean;
  allOnlineVoted?: boolean;
  onOpenPreview: () => void;
  onOpenDecideModal?: () => void;
  hasTieHint?: boolean;
  className?: string;
  variant?: 'primary' | 'outline';
  size?: 'sm' | 'md';
  label?: string;
}

/**
 * Kiểm tra điều kiện hiển thị nút '✨ Lên lịch giúp tôi' theo mục 5.1:
 * - Phòng có ≥ 1 quán ACCEPTED
 * - HOẶC khi mọi thành viên online đã vote
 */
// eslint-disable-next-line react-refresh/only-export-components
export function shouldShowAutoPlanButton(
  places: Place[],
  members: Member[] = [],
  allOnlineVoted?: boolean,
): boolean {
  if (!places || places.length === 0) return false;
  if (places.some((p) => p.status === 'ACCEPTED')) return true;
  if (allOnlineVoted) return true;

  if (members.length > 0) {
    const activeMembers = members.filter((m) => m.is_active);
    const totalVotes = places.reduce(
      (sum, p) => sum + (p.upvotes || 0) + (p.downvotes || 0),
      0,
    );
    if (activeMembers.length > 0 && totalVotes >= activeMembers.length) {
      return true;
    }
  }

  return false;
}

export const AutoPlanButton: React.FC<AutoPlanButtonProps> = ({
  roomId,
  places,
  members = [],
  allOnlineVoted,
  onOpenPreview,
  onOpenDecideModal,
  hasTieHint,
  className,
  variant = 'primary',
  size = 'sm',
  label = '✨ Lên lịch giúp tôi',
}) => {
  const visible = shouldShowAutoPlanButton(places, members, allOnlineVoted);

  if (!visible) {
    return null;
  }

  const handleClick = async () => {
    // Nếu có hint TIE_AT_TOP thì mở Chọn hộ trước
    let isTie = hasTieHint;
    if (isTie === undefined && onOpenDecideModal) {
      try {
        const res = await decisionApi.getHints(roomId);
        isTie = res.hints.some((h) => h.type === 'TIE_AT_TOP');
      } catch {
        const sorted = [...places].sort((a, b) => b.score - a.score);
        isTie =
          sorted.length >= 2 &&
          sorted[0].score === sorted[1].score &&
          sorted[0].score > 0;
      }
    }

    if (isTie && onOpenDecideModal) {
      onOpenDecideModal();
      return;
    }

    onOpenPreview();
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleClick}
      data-testid="auto-plan-button"
    >
      {label}
    </Button>
  );
};
