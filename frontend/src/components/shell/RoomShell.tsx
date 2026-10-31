import React from 'react';
import type { Room } from '../../types';
import { RoomTopBar } from './RoomTopBar';
import { BottomTabBar } from './BottomTabBar';
import { ConnectionBanner } from './ConnectionBanner';
import type { RoomTab } from './useRoomTab';
import type { UseRoomPhaseResult } from '../../room/useRoomPhase';
import { motionAttrs } from '../../motion/presets';

export interface RoomShellProps {
  room: Room;
  isConnected: boolean;
  /** Tab mobile (<1024px); desktop không có tab. */
  activeTab: RoomTab;
  onTabChange: (tab: RoomTab) => void;
  onGoHome: () => void;
  /** Giai đoạn dùng chung với RoomWorkspace (một nguồn `viewStep`); thiếu thì thanh đỉnh tự tính. */
  phase?: UseRoomPhaseResult;
  /** Lịch có xung đột → chấm đỏ trên tab Kế hoạch. */
  hasConflicts?: boolean;
  /** "N đang xem" trên thanh đỉnh (ViewersButton). */
  topBarViewers?: React.ReactNode;
  /** Menu avatar trên thanh đỉnh (IdentityMenu). */
  topBarIdentity?: React.ReactNode;
  children: React.ReactNode;
}

/** Khung trang phòng: cao đúng một màn (`100dvh`), trang không cuộn — từng cột/tab tự cuộn (DESIGN gđ5 §2). */
export const RoomShell: React.FC<RoomShellProps> = ({
  room,
  isConnected,
  activeTab,
  onTabChange,
  onGoHome,
  phase,
  hasConflicts,
  topBarViewers,
  topBarIdentity,
  children,
}) => {
  return (
    <div className="room-shell-vt h-dvh bg-bg flex flex-col overflow-hidden">
      <RoomTopBar
        title={room.title}
        code={room.code}
        roomId={room.id}
        onGoHome={onGoHome}
        phase={phase}
        viewers={topBarViewers}
        identity={topBarIdentity}
      />

      {/* Dải thông báo mất kết nối lâu */}
      <ConnectionBanner isConnected={isConnected} />

      {/* Không gian làm việc; `room-panel-vt` là nhóm trượt khi đổi tab mobile (T-62, motion.css).
          Mobile chừa đáy cho thanh tab cố định. */}
      <main
        {...motionAttrs('tab.switch')}
        className="room-panel-vt relative flex-1 min-h-0 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0"
      >
        {children}
      </main>

      {/* Thanh tab đáy 2 mục cho mobile */}
      <BottomTabBar activeTab={activeTab} onTabChange={onTabChange} hasConflicts={hasConflicts} />
    </div>
  );
};
