import React, { useState } from 'react';
import { Button, Header } from '../components/common';
import { CreateRoomModal, JoinRoomModal } from '../components/room';
import { tokenStorage } from '../services/storage/tokenStorage';

export interface HomePageProps {
  onNavigateToRoom: (roomId: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigateToRoom }) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [quickRoomCode, setQuickRoomCode] = useState('');

  const savedRoomCode = tokenStorage.getRoomCode();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header
        rightAction={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsJoinOpen(true)}
            >
              Vào phòng
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsCreateOpen(true)}
            >
              + Tạo phòng
            </Button>
          </div>
        }
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
        {/* Hero Banner */}
        <div className="text-center max-w-3xl mx-auto space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-50 border border-sky-100 text-sky-700 text-xs font-semibold">
            <span>✨</span>
            <span>Ứng dụng lên kế hoạch đi chơi nhóm thông minh</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tight leading-tight">
            Hôm nay nhóm mình <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-500 to-indigo-600">
              Đi Đâu?
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto">
            Khỏi lo đau đầu cãi nhau &ldquo;Ăn gì? Ở đâu?&rdquo;. Hãy để cả nhóm cùng đề xuất địa điểm,
            bình chọn dân chủ trong thời gian thực và tự động phát hiện xung đột lịch trình.
          </p>

          {/* Quick Action Box */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
            <Button
              variant="primary"
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => setIsCreateOpen(true)}
              leftIcon={<span>🚀</span>}
            >
              Tạo phòng ngay
            </Button>

            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => setIsJoinOpen(true)}
              leftIcon={<span>🔑</span>}
            >
              Nhập mã phòng
            </Button>
          </div>

          {/* Saved room banner if available */}
          {savedRoomCode && (
            <div className="pt-2">
              <span className="text-xs text-slate-500">
                Phòng bạn đã tham gia gần đây:{' '}
                <button
                  type="button"
                  onClick={() => {
                    setQuickRoomCode(savedRoomCode);
                    setIsJoinOpen(true);
                  }}
                  className="font-mono font-bold text-sky-600 hover:underline"
                >
                  {savedRoomCode}
                </button>
              </span>
            </div>
          )}
        </div>

        {/* Feature Cards Grid */}
        <div className="mt-16 sm:mt-24 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3">
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-2xl">
              🍜
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Tự động phân loại danh mục
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Dán tên quán hoặc đường link ShopeeFood/Grab, hệ thống tự động nhận diện quán ăn, cà phê,
              rạp chiếu phim hay điểm check-in.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3">
            <div className="w-12 h-12 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-2xl">
              🗳️
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Bình chọn Realtime & TieBreak
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Vote +1 hoặc -1 cập nhật ngay tức thì cho mọi thành viên qua WebSocket. Tự động phân định
              công bằng khi các quán bằng điểm nhau.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3">
            <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-2xl">
              ⚠️
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Phát hiện xung đột thông minh
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Cảnh báo ngay khi lịch trình bị đè giờ, không kịp thời gian di chuyển giữa các điểm, hoặc
              vượt ngân sách đã định của cả nhóm.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400 bg-white">
        Đi Đâu &copy; 2026 - Collaborative Outing Planner
      </footer>

      {/* Modals */}
      <CreateRoomModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={onNavigateToRoom}
      />

      <JoinRoomModal
        isOpen={isJoinOpen}
        onClose={() => {
          setIsJoinOpen(false);
          setQuickRoomCode('');
        }}
        initialCode={quickRoomCode}
        onSuccess={onNavigateToRoom}
      />
    </div>
  );
};
