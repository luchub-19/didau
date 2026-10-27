import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '@fontsource/bricolage-grotesque/latin-800.css';
import '@fontsource/bricolage-grotesque/vietnamese-800.css';
import { HomeHeader } from '../components/shell';
import { CreateRoomModal, JoinRoomModal } from '../components/room';
import { tokenStorage } from '../services/storage/tokenStorage';
import { Hero } from '../stage/hero/Hero';

export interface HomePageProps {
  onNavigateToRoom: (roomId: string) => void;
}

/** Trang chủ (vùng Stage): phim cuộn qua TP.HCM 3D, CTA Tạo phòng / Nhập mã thấy ở mọi cảnh. */
export const HomePage: React.FC<HomePageProps> = ({ onNavigateToRoom }) => {
  const { t } = useTranslation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [quickRoomCode, setQuickRoomCode] = useState('');

  const savedRoomCode = tokenStorage.getRoomCode();

  return (
    <div className="min-h-dvh bg-[rgb(var(--stage-paper))] flex flex-col">
      <main className="flex-1">
        <Hero
          header={<HomeHeader variant="stage" />}
          onCreate={() => setIsCreateOpen(true)}
          onJoin={() => {
            setQuickRoomCode('');
            setIsJoinOpen(true);
          }}
          resumeCode={savedRoomCode}
          onResume={() => {
            if (!savedRoomCode) return;
            setQuickRoomCode(savedRoomCode);
            setIsJoinOpen(true);
          }}
        />
      </main>

      <footer className="border-t border-[rgb(var(--stage-ink)/0.12)] py-5 text-center text-caption text-[rgb(var(--stage-ink-2))]">
        {t('home.footer', { name: t('app.name') })}
      </footer>

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
