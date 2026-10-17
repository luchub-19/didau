import React, { useEffect, useState } from 'react';
import { HomePage } from './pages/HomePage';
import { RoomPage } from './pages/RoomPage';
import { coldStartManager, type ColdStartState } from './services/api/coldStart';
import { Button } from './components/common';

function parseRoomIdFromPath(): string | null {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname;
  // Match /rooms/:id or /room/:id
  const match = path.match(/^\/rooms?\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

export default function App(): React.ReactElement {
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(() =>
    parseRoomIdFromPath(),
  );
  const [coldStart, setColdStart] = useState<ColdStartState>({ status: 'idle', message: '' });

  useEffect(() => {
    const unsub = coldStartManager.subscribe(setColdStart);
    return unsub;
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoomId(parseRoomIdFromPath());
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const handleNavigateToRoom = (roomId: string) => {
    setCurrentRoomId(roomId);
    window.history.pushState(null, '', `/rooms/${roomId}`);
  };

  const handleGoHome = () => {
    setCurrentRoomId(null);
    window.history.pushState(null, '', '/');
  };

  if (coldStart.status === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 mb-4 rounded-2xl bg-rose-100 flex items-center justify-center text-3xl">
          ⚠️
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Không kết nối được máy chủ</h2>
        <p className="text-sm text-slate-500 max-w-sm mb-6">{coldStart.message}</p>
        <Button onClick={() => window.location.reload()}>Thử lại</Button>
      </div>
    );
  }

  if (coldStart.status === 'waking') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 mb-4 rounded-2xl bg-sky-100 flex items-center justify-center text-3xl animate-bounce">
          ☕
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">
          Đang đánh thức máy chủ, chờ khoảng 1 phút nhé…
        </h2>
        <p className="text-sm text-slate-500 max-w-sm mb-6">
          Máy chủ đang khởi động lại sau thời gian nghỉ. Hệ thống sẽ tự động tải lại ngay khi máy chủ sẵn sàng.
        </p>
        <div className="flex items-center gap-2 text-xs text-sky-600 font-medium">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Đang thử lại kết nối mỗi 5 giây...</span>
        </div>
      </div>
    );
  }

  if (currentRoomId) {
    return <RoomPage roomId={currentRoomId} onGoHome={handleGoHome} />;
  }

  return <HomePage onNavigateToRoom={handleNavigateToRoom} />;
}
