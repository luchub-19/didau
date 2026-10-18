import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/common';
import { CreateRoomModal, JoinRoomModal } from '../components/room';
import { ArrowRight, Button, CalendarBlank, ForkKnife, ThumbsUp } from '../components/ui';
import { tokenStorage } from '../services/storage/tokenStorage';

export interface HomePageProps {
  onNavigateToRoom: (roomId: string) => void;
}

const STEPS = [
  { key: 'home.step1', Icon: ForkKnife },
  { key: 'home.step2', Icon: ThumbsUp },
  { key: 'home.step3', Icon: CalendarBlank },
] as const;

export const HomePage: React.FC<HomePageProps> = ({ onNavigateToRoom }) => {
  const { t } = useTranslation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [quickRoomCode, setQuickRoomCode] = useState('');

  const savedRoomCode = tokenStorage.getRoomCode();

  return (
    <div className="min-h-dvh bg-bg flex flex-col">
      <Header />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 md:px-6 pt-6 pb-12 lg:pt-16 lg:grid lg:grid-cols-2 lg:gap-16 lg:items-start">
        <section>
          <h1 className="text-display text-ink max-w-[14ch] lg:text-[2.75rem] lg:leading-[3.25rem]">
            {t('home.headline')}
          </h1>
          <p className="mt-3 text-body text-ink-2 max-w-md">{t('home.sub')}</p>

          <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:max-w-md">
            <Button size="lg" className="sm:flex-1 whitespace-nowrap" onClick={() => setIsCreateOpen(true)}>
              {t('home.create')}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="sm:flex-1 whitespace-nowrap"
              onClick={() => {
                setQuickRoomCode('');
                setIsJoinOpen(true);
              }}
            >
              {t('home.join')}
            </Button>
          </div>

          {savedRoomCode && (
            <button
              type="button"
              onClick={() => {
                setQuickRoomCode(savedRoomCode);
                setIsJoinOpen(true);
              }}
              className="mt-4 w-full sm:max-w-md min-h-[56px] px-4 flex items-center justify-between gap-3 rounded-card bg-surface border border-line text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
            >
              <span className="min-w-0">
                <span className="block text-caption text-ink-3">{t('home.resumeHint')}</span>
                <span className="block text-label font-semibold text-ink truncate">
                  {t('home.resume', { code: savedRoomCode })}
                </span>
              </span>
              <ArrowRight size={20} className="text-ink-2 flex-shrink-0" aria-hidden="true" />
            </button>
          )}
        </section>

        <section className="mt-12 lg:mt-2" aria-labelledby="how-title">
          <h2 id="how-title" className="text-heading text-ink">
            {t('home.howTitle')}
          </h2>
          <ol className="mt-4 space-y-4">
            {STEPS.map(({ key, Icon }) => (
              <li key={key} className="flex items-start gap-3">
                <span
                  className="w-10 h-10 rounded-field bg-surface-2 text-ink-2 flex items-center justify-center flex-shrink-0"
                  aria-hidden="true"
                >
                  <Icon size={22} />
                </span>
                <p className="text-body text-ink pt-2">{t(key)}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-line py-5 text-center text-caption text-ink-3">
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
