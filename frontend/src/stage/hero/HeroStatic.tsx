import React from 'react';
import { useTranslation } from 'react-i18next';
import { HeroActions, type HeroActionsProps } from './HeroActions';
import { HeroCaption } from './HeroCaption';
import { HeroPoster } from './HeroPoster';
import { HERO_SHOTS } from './shots';

export interface HeroStaticProps extends HeroActionsProps {
  header: React.ReactNode;
  /** Chỉ màn đầu (khung chờ trong lúc chunk phim tải): cùng bố cục màn đầu của HeroScroll, không lệch layout. */
  introOnly?: boolean;
}

/**
 * Mức 'static' (reduced-motion, không WebGL, `?motion=off`) và khung chờ khi chunk phim chưa tải:
 * poster cảnh 1 + 5 khối chữ xếp dọc, CTA ở khối đầu và khối cuối. Không bản đồ động.
 */
export const HeroStatic: React.FC<HeroStaticProps> = ({ header, introOnly = false, ...actions }) => {
  const { t } = useTranslation();
  const [first, ...rest] = HERO_SHOTS;

  return (
    <section aria-label={t('hero.sectionLabel')} data-hero-tier={introOnly ? 'loading' : 'static'} className="bg-[rgb(var(--stage-paper))]">
      <div className="relative h-[100svh] w-full overflow-hidden">
        <div className="absolute inset-0">
          <HeroPoster />
        </div>
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ background: 'var(--stage-sunlight)' }} />
        <div className="absolute inset-x-0 top-0 z-10">{header}</div>
        <div className="absolute inset-x-0 bottom-0 z-10 p-3 md:p-6">
          <div className="mx-auto max-w-7xl rounded-card border border-[rgb(var(--stage-ink)/0.12)] bg-[rgb(var(--stage-paper)/0.94)] shadow-[var(--stage-shadow-long)] p-4 md:p-7">
            <HeroCaption shot={first} />
            <div className="mt-4 md:mt-6 md:w-[26rem]">
              <HeroActions {...actions} />
            </div>
          </div>
        </div>
      </div>

      {!introOnly && (
        <div className="mx-auto max-w-7xl px-4 md:px-6 py-12 md:py-16 flex flex-col gap-10 md:gap-14">
          {rest.map((s) => (
            <div key={s.id} className="max-w-3xl">
              <HeroCaption shot={s} />
            </div>
          ))}
          <div className="md:w-[26rem]">
            <HeroActions onCreate={actions.onCreate} onJoin={actions.onJoin} />
          </div>
        </div>
      )}
    </section>
  );
};
