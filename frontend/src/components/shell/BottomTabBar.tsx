import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MapTrifold, CalendarBlank } from '../ui';
import type { RoomTab } from './useRoomTab';

export interface BottomTabBarProps {
  activeTab: RoomTab;
  onTabChange: (tab: RoomTab) => void;
  /** Lịch có xung đột → chấm đỏ trên tab Kế hoạch (T-73 đưa cảnh báo vào mục lịch). */
  hasConflicts?: boolean;
}

interface TabDef {
  id: RoomTab;
  icon: typeof MapTrifold;
  labelKey: 'room.tab.explore' | 'room.tab.plan';
  hasAlert?: boolean;
}

export const BottomTabBar: React.FC<BottomTabBarProps> = ({
  activeTab,
  onTabChange,
  hasConflicts,
}) => {
  const { t } = useTranslation();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // Phát hiện bàn phím ảo trên điện thoại để ẩn thanh tab cố định
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        setIsKeyboardOpen(true);
      }
    };

    const handleFocusOut = () => {
      setIsKeyboardOpen(false);
    };

    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);

    const vv = window.visualViewport;
    const handleViewportResize = () => {
      if (vv && vv.height < window.innerHeight * 0.75) {
        setIsKeyboardOpen(true);
      } else {
        setIsKeyboardOpen(false);
      }
    };

    if (vv) {
      vv.addEventListener('resize', handleViewportResize);
    }

    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
      if (vv) {
        vv.removeEventListener('resize', handleViewportResize);
      }
    };
  }, []);

  // Mobile 2 tab có nhãn (DESIGN gđ5 §2); desktop không có tab
  const tabs: TabDef[] = [
    { id: 'explore', icon: MapTrifold, labelKey: 'room.tab.explore' },
    { id: 'plan', icon: CalendarBlank, labelKey: 'room.tab.plan', hasAlert: hasConflicts },
  ];

  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);

  return (
    <footer
      className={`room-tabbar-vt fixed bottom-0 left-0 right-0 z-tabbar bg-surface border-t border-line lg:hidden transition-transform duration-[var(--t-ui)] ${
        isKeyboardOpen ? 'translate-y-full pointer-events-none' : 'translate-y-0'
      }`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <nav
        role="tablist"
        aria-label={t('room.tab.ariaLabel')}
        className="relative h-14 flex items-stretch justify-around px-2"
      >
        {/* Vạch chọn trượt giữa các tab trên mobile (DESIGN.md §8, T-52) */}
        <div
          className="absolute top-0 left-2 right-2 h-0.5 pointer-events-none flex"
          aria-hidden="true"
        >
          <div
            className="tab-indicator h-full flex justify-center"
            style={{
              width: `${100 / tabs.length}%`,
              transform: `translateX(${activeIndex >= 0 ? activeIndex * 100 : 0}%)`,
            }}
          >
            <span className="w-8 h-full rounded-full bg-accent" />
          </div>
        </div>

        {tabs.map((tab) => {
          const isSelected = activeTab === tab.id;
          const IconComponent = tab.icon;
          const label = t(tab.labelKey);

          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              id={`tab-${tab.id}`}
              aria-selected={isSelected}
              aria-controls={`panel-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex-1 min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-caption pressable ${
                isSelected ? 'text-ink font-semibold' : 'text-ink-2 font-normal'
              }`}
            >
              <div className="relative inline-flex items-center justify-center">
                <IconComponent
                  size={24}
                  weight={isSelected ? 'fill' : 'regular'}
                  className={isSelected ? 'text-accent-text' : 'text-ink-2'}
                />
                {tab.hasAlert && (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-danger"
                    aria-hidden="true"
                  />
                )}
              </div>

              <span className="truncate max-w-[96px] leading-tight">{label}</span>
              {tab.hasAlert && <span className="sr-only">{t('room.workspace.hasConflicts')}</span>}
            </button>
          );
        })}
      </nav>
    </footer>
  );
};
