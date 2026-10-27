import React from 'react';
import type { Room } from '../../types';
import { RoomTopBar } from './RoomTopBar';
import { BottomTabBar, DesktopTabBar } from './BottomTabBar';
import { ConnectionBanner } from './ConnectionBanner';
import type { RoomTab } from './useRoomTab';
import { motionAttrs } from '../../motion/presets';

export interface RoomShellProps {
  room: Room;
  isConnected: boolean;
  activeTab: RoomTab;
  onTabChange: (tab: RoomTab) => void;
  onGoHome: () => void;
  placesCount?: number;
  scheduleCount?: number;
  hasConflicts?: boolean;
  topBanner?: React.ReactNode;
  children: React.ReactNode;
}

export const RoomShell: React.FC<RoomShellProps> = ({
  room,
  isConnected,
  activeTab,
  onTabChange,
  onGoHome,
  placesCount,
  scheduleCount,
  hasConflicts,
  topBanner,
  children,
}) => {
  return (
    <div className="room-shell-vt min-h-dvh bg-bg flex flex-col">
      {/* Thanh đỉnh cố định (TopBar + Desktop TabBar) */}
      <RoomTopBar
        title={room.title}
        code={room.code}
        roomId={room.id}
        isConnected={isConnected}
        onGoHome={onGoHome}
      >
        <DesktopTabBar
          activeTab={activeTab}
          onTabChange={onTabChange}
          placesCount={placesCount}
          scheduleCount={scheduleCount}
          hasConflicts={hasConflicts}
        />
      </RoomTopBar>

      {/* Dải thông báo trạng thái kết nối */}
      <ConnectionBanner isConnected={isConnected} />

      {/* Banner cảnh báo ghim (ví dụ xung đột lịch) */}
      {topBanner}

      {/* Khu vực nội dung chính; `room-panel-vt` là nhóm trượt khi đổi tab (T-62, motion.css) */}
      <main
        {...motionAttrs('tab.switch')}
        className="room-panel-vt flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 pb-20 lg:pb-8"
      >
        {children}
      </main>

      {/* Thanh tab đáy cố định cho mobile */}
      <BottomTabBar
        activeTab={activeTab}
        onTabChange={onTabChange}
        placesCount={placesCount}
        scheduleCount={scheduleCount}
        hasConflicts={hasConflicts}
      />
    </div>
  );
};
