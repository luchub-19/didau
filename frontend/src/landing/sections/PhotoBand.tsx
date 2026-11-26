// Phần 3 "Dải ảnh Bùi Viện" (T-126, PLAN §4.1 dòng 3, §4.8): ảnh thật toàn chiều ngang, phủ tối trên/dưới hoà vào nền,
// một câu lớn, ghi công CC BY-SA 4.0 ngay trên ảnh. width/height có sẵn nên CLS = 0.
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnceInView } from '../shell/useOnceInView';
import { PHOTO_CREDIT_URL, PHOTO_SRC } from './photo';
import './sections.css';

export const PhotoBand: React.FC = () => {
  const { t } = useTranslation();
  const ref = useRef<HTMLElement>(null);
  const state = useOnceInView(ref, { threshold: 0.2 });
  return (
    <section
      id="photo"
      ref={ref}
      aria-labelledby="photo-caption"
      className="landing-photo border-y border-night-line"
      data-zoom={state}
    >
      <img
        src={PHOTO_SRC.small}
        srcSet={`${PHOTO_SRC.small} ${PHOTO_SRC.smallW}w, ${PHOTO_SRC.large} ${PHOTO_SRC.largeW}w`}
        sizes="100vw"
        width={PHOTO_SRC.width}
        height={PHOTO_SRC.height}
        alt={t('landing.photo.alt')}
        loading="lazy"
        decoding="async"
      />
      <div className="landing-photo-cap">
        <div className="landing-wrap">
          <p id="photo-caption">{t('landing.photo.caption')}</p>
        </div>
      </div>
      <div className="landing-photo-credit">
        <div className="landing-wrap">
          <a href={PHOTO_CREDIT_URL} target="_blank" rel="noopener">
            {t('landing.photo.credit')}
          </a>
        </div>
      </div>
    </section>
  );
};
