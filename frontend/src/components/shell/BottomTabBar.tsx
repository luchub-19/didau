import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ForkKnife, MapTrifold, CalendarBlank, Users } from '../ui';
import type { RoomTab } from './useRoomTab';

export interface BottomTabBarProps {
  activeTab: RoomTab;
  onTabChange: (tab: RoomTab) => void;
  placesCount?: number;
  scheduleCount?: number;
  hasConflicts?: boolean;
}

interface TabDef {
  id: RoomTab;
  icon: typeof ForkKnife;
  labelKey: 'room.tab.places' | 'room.tab.map' | 'room.tab.schedule' | 'room.tab.group';
  count?: number;
  hasAlert?: boolean;
}

export const BottomTabBar: React.FC<BottomTabBarProps> = ({
  activeTab,
  onTabChange,
  placesCount,
  scheduleCount,
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

  const tabs: TabDef[] = [
    {
      id: 'places',
      icon: ForkKnife,
      labelKey: 'room.tab.places',
      count: placesCount,
    },
    {
      id: 'map',
      icon: MapTrifold,
      labelKey: 'room.tab.map',
    },
    {
      id: 'schedule',
      icon: CalendarBlank,
      labelKey: 'room.tab.schedule',
      count: scheduleCount,
      hasAlert: hasConflicts,
    },
    {
      id: 'group',
      icon: Users,
      labelKey: 'room.tab.group',
    },
  ];

  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);

  return (
    <footer
      className={`fixed bottom-0 left-0 right-0 z-tabbar bg-surface border-t border-line lg:hidden transition-transform duration-[var(--t-ui)] ${
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
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-danger animate-pulse"
                    aria-hidden="true"
                  />
                )}
              </div>

              <span className="truncate max-w-[72px] leading-tight">{label}</span>
            </button>
          );
        })}
      </nav>
    </footer>
  );
};

export const DesktopTabBar: React.FC<BottomTabBarProps> = ({
  activeTab,
  onTabChange,
  placesCount,
  scheduleCount,
  hasConflicts,
}) => {
  const { t } = useTranslation();

  const tabs: TabDef[] = [
    {
      id: 'places',
      icon: ForkKnife,
      labelKey: 'room.tab.places',
      count: placesCount,
    },
    {
      id: 'map',
      icon: MapTrifold,
      labelKey: 'room.tab.map',
    },
    {
      id: 'schedule',
      icon: CalendarBlank,
      labelKey: 'room.tab.schedule',
      count: scheduleCount,
      hasAlert: hasConflicts,
    },
    {
      id: 'group',
      icon: Users,
      labelKey: 'room.tab.group',
    },
  ];

  return (
    <nav
      role="tablist"
      aria-label={t('room.tab.ariaLabel')}
      className="hidden lg:flex items-center gap-2 border-t border-line bg-surface max-w-7xl mx-auto px-6"
    >
      {tabs.map((tab) => {
        const isSelected = activeTab === tab.id;
        const IconComponent = tab.icon;
        const label = t(tab.labelKey);

        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            id={`desktop-tab-${tab.id}`}
            aria-selected={isSelected}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
            className={`relative flex items-center gap-2 px-4 py-3 text-label font-medium pressable border-b-2 -mb-[1px] min-h-[44px] ${
              isSelected
                ? 'border-accent text-ink font-semibold'
                : 'border-transparent text-ink-2 hover:text-ink hover:border-line'
            }`}
          >
            <IconComponent
              size={20}
              weight={isSelected ? 'fill' : 'regular'}
              className={isSelected ? 'text-accent-text' : 'text-ink-2'}
            />
            <span>{label}</span>

            {typeof tab.count === 'number' && (
              <span
                className={`text-caption px-2 py-0.5 rounded-full ${
                  isSelected
                    ? 'bg-accent-soft text-accent-text font-semibold'
                    : 'bg-surface-2 text-ink-2'
                }`}
              >
                {tab.count}
              </span>
            )}

            {tab.hasAlert && (
              <span
                className="w-2 h-2 rounded-full bg-danger animate-pulse"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
};
