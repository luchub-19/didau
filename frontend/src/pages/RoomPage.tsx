import React, { Suspense, lazy, useState } from 'react';
import { useRoom } from '../hooks/useRoom';
import { Button, Header } from '../components/common';
import { RoomHeader, MemberList, JoinRoomModal } from '../components/room';
import { CategoryFilter, PlaceForm, PlaceList } from '../components/places';
import { TieBreakSelectorModal } from '../components/voting';
import { ScheduleTimeline, AddScheduleItemModal } from '../components/schedule';
import { ConflictAlertBanner } from '../components/conflicts';
import { DeciderBanner, DecideModal } from '../components/decide';
import { usePlaceStore } from '../store/usePlaceStore';
import { useRoomStore } from '../store/useRoomStore';
import { useMapStore } from '../store/useMapStore';
import { useDecisionStore } from '../store/useDecisionStore';
import type { PlaceCategory } from '../types';

// maplibre-gl nặng: tách thành chunk riêng, chỉ tải khi mở tab Bản đồ
const MapView = lazy(() => import('../components/map/MapView'));

export interface RoomPageProps {
  roomId: string;
  onGoHome: () => void;
}

export const RoomPage: React.FC<RoomPageProps> = ({ roomId, onGoHome }) => {
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

  const [activeTab, setActiveTab] = useState<'PLACES' | 'SCHEDULE' | 'MAP'>('PLACES');
  const [isAddPlaceOpen, setIsAddPlaceOpen] = useState(false);
  const [isAddScheduleOpen, setIsAddScheduleOpen] = useState(false);
  const [isTieBreakOpen, setIsTieBreakOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(true);

  const handleOriginChange = async (lat: number, lng: number) => {
    try {
      await updateRoom(roomId, { origin_lat: lat, origin_lng: lng });
    } catch (err: unknown) {
      alert((err as { message?: string })?.message || 'Không thể đặt điểm hẹn. Chỉ Host mới được đổi.');
    }
  };

  const handleDeletePlace = async (placeId: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa địa điểm này không?')) {
      try {
        await deletePlace(roomId, placeId);
      } catch (err: unknown) {
        alert(
          (err as { message?: string })?.message ||
            'Không thể xóa địa điểm. Bạn cần là Host hoặc người đề xuất.',
        );
      }
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header onGoHome={onGoHome} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4">
          <svg
            className="animate-spin h-8 w-8 text-sky-500"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
          <p className="text-sm font-semibold text-slate-600">
            Đang tải dữ liệu chuyến đi...
          </p>
        </div>
      </div>
    );
  }

  if (needsJoin) {
    const codeFromLink = new URLSearchParams(window.location.search).get('code') ?? '';
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header onGoHome={onGoHome} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto space-y-4">
          <div className="text-4xl">🔑</div>
          <h2 className="text-lg font-bold text-slate-900">Bạn chưa tham gia phòng này</h2>
          <p className="text-xs text-slate-500">
            Nhập mã phòng (6 ký tự) và biệt danh của bạn để vào phòng.
          </p>
          <div className="pt-2 flex gap-3">
            <Button variant="outline" size="sm" onClick={onGoHome}>
              Về trang chủ
            </Button>
            <Button variant="primary" size="sm" onClick={() => setIsJoinOpen(true)}>
              Nhập mã phòng
            </Button>
          </div>
        </div>
        <JoinRoomModal
          isOpen={isJoinOpen}
          onClose={() => setIsJoinOpen(false)}
          // Token đã được lưu khi join; tải lại để dữ liệu phòng và WebSocket khởi tạo với token mới.
          onSuccess={(joinedRoomId) => window.location.assign(`/rooms/${joinedRoomId}`)}
          initialCode={codeFromLink}
        />
      </div>
    );
  }

  if (initError || !room) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header onGoHome={onGoHome} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto space-y-4">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-lg font-bold text-slate-900">
            Không thể tải thông tin phòng
          </h2>
          <p className="text-xs text-slate-500">
            {initError || 'Phòng không tồn tại hoặc bạn không có quyền truy cập.'}
          </p>
          <div className="pt-2 flex gap-3">
            <Button variant="outline" size="sm" onClick={onGoHome}>
              Về trang chủ
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Thử lại
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isVotingDisabled = room.status === 'FINALIZED';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header bar */}
      <Header
        onGoHome={onGoHome}
        rightAction={
          <div className="flex items-center gap-2">
            {ws.isConnected ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Offline
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddScheduleOpen(true)}
              leftIcon={<span>📅</span>}
            >
              Xếp lịch
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsAddPlaceOpen(true)}
              leftIcon={<span>+</span>}
            >
              Gợi ý quán
            </Button>
          </div>
        }
      />

      {/* Room Detail Header with Share & Code */}
      <RoomHeader
        room={room}
        currentMember={currentMember}
        onGoHome={onGoHome}
        onOpenTieBreakModal={() => setIsTieBreakOpen(true)}
      />

      {/* Pinned Conflict Alert Banner */}
      <ConflictAlertBanner
        roomId={roomId}
        conflicts={conflicts}
        onSwitchToSchedule={() => setActiveTab('SCHEDULE')}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Column: Tabs, Places & Schedule */}
          <div className="lg:col-span-3 space-y-5">
            {/* Decider Banner */}
            <DeciderBanner
              roomId={roomId}
              onOpenDecide={() => setDecideModalOpen(true)}
            />

            {/* View Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <button
                type="button"
                onClick={() => setActiveTab('PLACES')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  activeTab === 'PLACES'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>📍</span>
                <span>Gợi ý & Bỏ phiếu</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    activeTab === 'PLACES'
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {places.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('MAP')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  activeTab === 'MAP'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>🗺️</span>
                <span>Bản đồ</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('SCHEDULE')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  activeTab === 'SCHEDULE'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>📅</span>
                <span>Lịch trình chuyến đi</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    activeTab === 'SCHEDULE'
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {schedule.length}
                </span>
                {conflicts.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                )}
              </button>
            </div>

            {/* Tab 1: Places & Voting */}
            {activeTab === 'PLACES' && (
              <div className="space-y-5">
                {/* Category filter pills */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                  <CategoryFilter
                    places={places}
                    selectedCategory={selectedCategory}
                    onSelectCategory={(cat: PlaceCategory | 'ALL') =>
                      setSelectedCategory(cat)
                    }
                  />
                </div>

                {/* Places List with Voting */}
                <PlaceList
                  places={places}
                  roomId={roomId}
                  selectedCategory={selectedCategory}
                  currentMemberId={currentMember?.id}
                  isHost={isHost}
                  isVotingDisabled={isVotingDisabled}
                  onOpenAddModal={() => setIsAddPlaceOpen(true)}
                  onDeletePlace={handleDeletePlace}
                  onViewOnMap={(p) => {
                    setActiveTab('MAP');
                    useMapStore.getState().selectPlace(p.id);
                  }}
                />
              </div>
            )}

            {/* Tab bản đồ */}
            {activeTab === 'MAP' && (
              <Suspense
                fallback={
                  <div className="h-[70vh] min-h-[420px] flex items-center justify-center rounded-2xl bg-white border border-slate-200 text-sm text-slate-500">
                    Đang tải bản đồ...
                  </div>
                }
              >
                <MapView
                  room={room}
                  places={places}
                  isHost={isHost}
                  isVotingDisabled={isVotingDisabled}
                  onOriginChange={handleOriginChange}
                />
              </Suspense>
            )}

            {/* Tab 2: Schedule Timeline */}
            {activeTab === 'SCHEDULE' && (
              <ScheduleTimeline
                roomId={roomId}
                items={schedule}
                places={places}
                members={members}
                isHost={isHost}
                onOpenAddModal={() => setIsAddScheduleOpen(true)}
                onOpenDecideModal={() => setIsTieBreakOpen(true)}
              />
            )}
          </div>

          {/* Sidebar: Members and Room Summary */}
          <div className="space-y-6">
            <MemberList
              members={members}
              currentMemberId={currentMember?.id}
            />

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                ℹ️ Thông tin chuyến đi
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Trạng thái:</span>
                  <span className="font-semibold text-slate-800">{room.status}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Tổng địa điểm:</span>
                  <span className="font-semibold text-slate-800">{places.length}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Mục lịch trình:</span>
                  <span className="font-semibold text-slate-800">{schedule.length}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Quy tắc hòa phiếu:</span>
                  <span className="font-semibold text-slate-800">
                    {room.tie_break_strategy}
                  </span>
                </div>
                {room.budget_limit && (
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Ngân sách/người:</span>
                    <span className="font-semibold text-slate-800">
                      {room.budget_limit.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
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
    </div>
  );
};
