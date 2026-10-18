import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './i18n';
import { Coffee, WarningCircle } from './components/ui/Icon';
import { HomePage } from './pages/HomePage';
import { RoomPage } from './pages/RoomPage';
import { coldStartManager, type ColdStartState } from './services/api/coldStart';
import { Button, ToastViewport } from './components/ui';
import { StyleGuide } from './dev/StyleGuide';
import { ErrorBoundary } from './components/common/ErrorBoundary';

function parseRoomIdFromPath(): string | null {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname;
  // Khớp /rooms/:id hoặc /room/:id
  const match = path.match(/^\/rooms?\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

function getInitialColdStartState(): ColdStartState {
  let initial: ColdStartState = { status: 'idle', message: '' };
  const unsub = coldStartManager.subscribe((s) => {
    initial = s;
  });
  unsub();
  return initial;
}

export default function App(): React.ReactElement {
  const { t } = useTranslation();
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(() =>
    parseRoomIdFromPath(),
  );
  const [coldStart, setColdStart] = useState<ColdStartState>(() =>
    getInitialColdStartState(),
  );

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
      <div className="min-h-screen min-h-dvh bg-bg flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 mb-4 rounded-2xl bg-danger-soft flex items-center justify-center text-danger">
          <WarningCircle size={32} aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-ink mb-2">{t('app.coldStart.errorTitle')}</h2>
        <p className="text-sm text-ink-2 max-w-sm mb-6">
          {t('app.coldStart.errorDesc')}
        </p>
        <Button onClick={() => window.location.reload()}>{t('common.retry')}</Button>
      </div>
    );
  }

  if (coldStart.status === 'waking') {
    return (
      <div className="min-h-screen min-h-dvh bg-bg flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 mb-4 rounded-2xl bg-accent-soft flex items-center justify-center text-accent-text">
          <Coffee size={32} aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-ink mb-2">
          {t('app.coldStart.wakingTitle')}
        </h2>
        <p className="text-sm text-ink-2 max-w-sm mb-6">
          {t('app.coldStart.wakingDesc')}
        </p>
        <div className="flex items-center gap-2 text-xs text-accent-text font-medium">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>{t('app.coldStart.retrying')}</span>
        </div>
      </div>
    );
  }

  let mainContent: React.ReactElement;
  if (import.meta.env.DEV && typeof window !== 'undefined' && window.location.pathname === '/_styleguide') {
    mainContent = <StyleGuide />;
  } else if (currentRoomId) {
    mainContent = <RoomPage roomId={currentRoomId} onGoHome={handleGoHome} />;
  } else {
    mainContent = <HomePage onNavigateToRoom={handleNavigateToRoom} />;
  }

  return (
    <ErrorBoundary>
      {mainContent}
      <ToastViewport />
    </ErrorBoundary>
  );
}
