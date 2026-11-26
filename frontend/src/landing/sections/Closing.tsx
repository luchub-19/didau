// Phần 7 "Kết" (T-129, PLAN §3 mục 14): tiêu đề lớn + 2 CTA thật (do LandingPage dựng, giữ ref cho IO thanh đỉnh)
// + dàn nhân vật + QR tới bản deploy (chỉ ≥ 960px, ẩn bằng CSS nên màn hẹp không tải ảnh QR).
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CAST, avatarFor } from '../cast';
import { useReveal } from '../shell/useReveal';
import './sections.css';

export const QR_SRC = '/landing/qr-deploy.svg';
export const DEPLOY_HOST = 'didau-omega.vercel.app';

export interface ClosingProps {
  /** Hàng CTA (cùng handler với hero, T-124). */
  cta: React.ReactNode;
}

export const Closing: React.FC<ClosingProps> = ({ cta }) => {
  const { t } = useTranslation();
  const headRef = useRef<HTMLDivElement>(null);
  const reveal = useReveal(headRef, { threshold: 0.2 });
  return (
    <section id="end" aria-labelledby="end-title" className="end-sec relative">
      <div className="landing-wrap end-grid">
        <div ref={headRef} {...reveal}>
          <h2 id="end-title" className="end-h2">
            {t('landing.end.title')}
          </h2>
          <p className="mt-[18px] max-w-[34em] text-lg text-night-moon-2">{t('landing.end.sub')}</p>
          {cta}
          <div className="end-cast" aria-hidden="true">
            {CAST.map((m) => (
              <img key={m.id} src={avatarFor(m.id)} alt="" width={44} height={44} loading="lazy" />
            ))}
          </div>
        </div>
        <figure className="end-qr">
          <img src={QR_SRC} alt={t('landing.end.qrLabel')} width={200} height={200} loading="lazy" />
          <figcaption>
            <strong>{t('landing.end.qrTitle')}</strong>
            <small>{DEPLOY_HOST}</small>
          </figcaption>
        </figure>
      </div>
    </section>
  );
};
