import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoom } from '../hooks/useRoom';
import { usePlaceStore } from '../store/usePlaceStore';
import { useRoomStore } from '../store/useRoomStore';
import { useMapStore } from '../store/useMapStore';
import { useDecisionStore } from '../store/useDecisionStore';
import type { Place, PlaceCategory } from '../types';

import {
  Button,
  IconButton,
  EmptyState,
  Skeleton,
  ConfirmSheet,
  ArrowLeft,
  Info,
  WarningCircle,
  toast,
} from '../components/ui';

import { RoomShell, useRoomTab } from '../components/shell';
import { PlacesPanel, MapPanel, SchedulePanel, GroupPanel } from './room';
import { PlaceForm } from '../components/places';
import { TieBreakSelectorModal } from '../components/voting';
import { AddScheduleItemModal } from '../components/schedule';
import { ConflictAlertBanner } from '../components/conflicts';
import { DecideModal } from '../components/decide';
import { JoinRoomModal } from '../components/room';

export interface RoomPageProps {
  roomId: string;
  onGoHome: () => void;
}

export const RoomPage: React.FC<RoomPageProps> = ({ roomId, onGoHome }) => {
  const { t } = useTranslation();
  const { activeTab, setTab } = useRoomTab();

  const {
    room,
    members,
    currentMember,
    isHost,
    places,
    schedule,
    conflicts,
    isInitializing,
    initError,
    needsJoin,
    ws,
  } = useRoom(roomId);

  const deletePlace = usePlaceStore((s) => s.deletePlace);
  const updateRoom = useRoomStore((s) => s.updateRoom);
  const selectedCategory = usePlaceStore((s) => s.selectedCategory);
  const setSelectedCategory = usePlaceStore((s) => s.setSelectedCategory);

  const isDecideModalOpen = useDecisionStore((s) => s.isDecideModalOpen);
  const setDecideModalOpen = useDecisionStore((s) => s.setDecideModalOpen);

  const [isAddPlaceOpen, setIsAddPlaceOpen] = useState(false);
  const [isAddScheduleOpen, setIsAddScheduleOpen] = useState(false);
  const [isTieBreakOpen, setIsTieBreakOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(true);

  // Quản lý xác nhận xoá quán qua ConfirmSheet (DESIGN §5)
  const [placeToDelete, setPlaceToDelete] = useState<string | null>(null);
  const [isDeletingPlace, setIsDeletingPlace] = useState(false);

  // Tab bản đồ giữ mounted sau lần mở đầu tiên (PLAN §7)
  const [hasMountedMap, setHasMountedMap] = useState<boolean>(
    () => activeTab === 'map',
  );

  useEffect(() => {
    if (activeTab === 'map' && !hasMountedMap) {
      setHasMountedMap(true);
    }
  }, [activeTab, hasMountedMap]);

  const handleOriginChange = async (lat: number, lng: number) => {
    try {
      await updateRoom(roomId, { origin_lat: lat, origin_lng: lng });
      toast.success(t('room.originChangeSuccess'));
    } catch (err: unknown) {
      toast.error(
        (err as { message?: string })?.message || t('room.originChangeError'),
      );
    }
  };

  const handleRequestDeletePlace = (placeId: string) => {
    setPlaceToDelete(placeId);
  };

  const handleConfirmDeletePlace = async () => {
    if (!placeToDelete) return;
    setIsDeletingPlace(true);
    try {
      await deletePlace(roomId, placeToDelete);
      toast.success(t('room.deletePlaceSuccess'));
      setPlaceToDelete(null);
    } catch (err: unknown) {
      toast.error(
        (err as { message?: string })?.message || t('room.deletePlaceError'),
      );
    } finally {
      setIsDeletingPlace(false);
    }
  };

  // Màn hình đang tải phòng bằng Skeleton (DESIGN §7)
  if (isInitializing) {
    return (
      <div className="min-h-dvh bg-bg flex flex-col">
        {/* Khung thanh trên skeleton */}
        <header className="bg-surface border-b border-line h-14 px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-surface-2 animate-pulse" />
            <div className="h-5 w-32 bg-surface-2 animate-pulse rounded" />
            <div className="h-5 w-16 bg-surface-2 animate-pulse rounded-field" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-6 w-16 rounded-full bg-surface-2 animate-pulse" />
            <div className="w-10 h-10 rounded-full bg-surface-2 animate-pulse" />
          </div>
        </header>

        {/* Nội dung skeleton */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
          <div className="h-10 w-full max-w-md bg-surface-2 animate-pulse rounded-card" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            <Skeleton.PlaceCard />
            <Skeleton.PlaceCard />
            <Skeleton.PlaceCard />
          </div>
          <p className="text-caption text-ink-3 text-center pt-2">
            {t('room.loading')}
          </p>
        </main>
      </div>
    );
  }

  // Màn hình chưa tham gia phòng bằng EmptyState
  if (needsJoin) {
    const codeFromLink =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('code') ?? ''
        : '';

    return (
      <div className="min-h-dvh bg-bg flex flex-col">
        <header className="bg-surface border-b border-line h-14 px-4 flex items-center">
          <IconButton
            icon={<ArrowLeft size={20} />}
            aria-label={t('common.back')}
            onClick={onGoHome}
          />
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <EmptyState
            icon={<Info size={28} className="text-accent-text" />}
            title={t('room.notJoined.title')}
            description={t('room.notJoined.desc')}
            action={
              <div className="flex gap-3">
                <Button variant="secondary" onClick={onGoHome}>
                  {t('common.back')}
                </Button>
                <Button variant="primary" onClick={() => setIsJoinOpen(true)}>
                  {t('room.notJoined.enterCode')}
                </Button>
              </div>
            }
          />
        </main>

        <JoinRoomModal
          isOpen={isJoinOpen}
          onClose={() => setIsJoinOpen(false)}
          onSuccess={(joinedRoomId) =>
            window.location.assign(`/rooms/${joinedRoomId}`)
          }
          initialCode={codeFromLink}
        />
      </div>
    );
  }

  // Màn hình lỗi tải phòng bằng EmptyState
  if (initError || !room) {
    return (
      <div className="min-h-dvh bg-bg flex flex-col">
        <header className="bg-surface border-b border-line h-14 px-4 flex items-center">
          <IconButton
            icon={<ArrowLeft size={20} />}
            aria-label={t('common.back')}
            onClick={onGoHome}
          />
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <EmptyState
            icon={<WarningCircle size={28} className="text-danger" />}
            title={t('room.error.title')}
            description={initError || t('room.error.defaultDesc')}
            action={
              <div className="flex gap-3">
                <Button variant="secondary" onClick={onGoHome}>
                  {t('common.back')}
                </Button>
                <Button variant="primary" onClick={() => window.location.reload()}>
                  {t('common.retry')}
                </Button>
              </div>
            }
          />
        </main>
      </div>
    );
  }

  const isVotingDisabled = room.status === 'FINALIZED';

  return (
    <RoomShell
      room={room}
      isConnected={ws.isConnected}
      activeTab={activeTab}
      onTabChange={setTab}
      onGoHome={onGoHome}
      placesCount={places.length}
      scheduleCount={schedule.length}
      hasConflicts={conflicts.length > 0}
      topBanner={
        <ConflictAlertBanner
          roomId={roomId}
          conflicts={conflicts}
          onSwitchToSchedule={() => setTab('schedule')}
        />
      }
    >
      {/* Panel 1: Quán & Bỏ phiếu */}
      {activeTab === 'places' && (
        <PlacesPanel
          roomId={roomId}
          places={places}
          selectedCategory={selectedCategory}
          onSelectCategory={(cat: PlaceCategory | 'ALL') =>
            setSelectedCategory(cat)
          }
          currentMemberId={currentMember?.id}
          isHost={isHost}
          isVotingDisabled={isVotingDisabled}
          onOpenAddModal={() => setIsAddPlaceOpen(true)}
          onDeletePlace={handleRequestDeletePlace}
          onViewOnMap={(p: Place) => {
            setTab('map');
            useMapStore.getState().selectPlace(p.id);
          }}
          onOpenDecide={() => setDecideModalOpen(true)}
        />
      )}

      {/* Panel 2: Bản đồ (giữ mounted sau lần mở đầu) */}
      {hasMountedMap && (
        <MapPanel
          room={room}
          places={places}
          isHost={isHost}
          isVotingDisabled={isVotingDisabled}
          onOriginChange={handleOriginChange}
          isActive={activeTab === 'map'}
        />
      )}

      {/* Panel 3: Lịch trình */}
      {activeTab === 'schedule' && (
        <SchedulePanel
          roomId={roomId}
          items={schedule}
          places={places}
          members={members}
          isHost={isHost}
          onOpenAddModal={() => setIsAddScheduleOpen(true)}
          onOpenDecideModal={() => setIsTieBreakOpen(true)}
        />
      )}

      {/* Panel 4: Nhóm & Thành viên */}
      {activeTab === 'group' && (
        <GroupPanel
          room={room}
          members={members}
          currentMember={currentMember}
          isHost={isHost}
          isConnected={ws.isConnected}
          placesCount={places.length}
          scheduleCount={schedule.length}
          onOpenTieBreakModal={() => setIsTieBreakOpen(true)}
        />
      )}

      {/* Modals & Sheets tương tác */}
      <PlaceForm
        isOpen={isAddPlaceOpen}
        onClose={() => setIsAddPlaceOpen(false)}
        roomId={roomId}
      />

      <TieBreakSelectorModal
        isOpen={isTieBreakOpen}
        onClose={() => setIsTieBreakOpen(false)}
        roomId={roomId}
        defaultStrategy={room.tie_break_strategy}
      />

      <AddScheduleItemModal
        isOpen={isAddScheduleOpen}
        onClose={() => setIsAddScheduleOpen(false)}
        roomId={roomId}
        places={places}
      />

      <DecideModal
        isOpen={isDecideModalOpen}
        onClose={() => setDecideModalOpen(false)}
        roomId={roomId}
        isHost={isHost}
      />

      <ConfirmSheet
        isOpen={Boolean(placeToDelete)}
        onClose={() => setPlaceToDelete(null)}
        onConfirm={handleConfirmDeletePlace}
        title={t('room.deletePlaceTitle')}
        description={t('room.deletePlaceConfirm')}
        confirmLabel={t('room.deletePlaceAction')}
        loading={isDeletingPlace}
      />
    </RoomShell>
  );
};
