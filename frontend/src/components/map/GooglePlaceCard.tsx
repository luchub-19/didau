import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { poiApi } from '../../services/api/poiApi';
import { loadPlacesUiKit } from '../../services/google/loadPlacesUiKit';
import { GOOGLE_MAPS_BROWSER_KEY } from '../../config';

export interface GooglePlaceCardProps {
  externalId: string;
  name: string;
  lat: number;
  lng: number;
  googlePlaceId?: string | null;
}

export const GooglePlaceCard: React.FC<GooglePlaceCardProps> = ({
  externalId,
  name,
  lat,
  lng,
  googlePlaceId,
}) => {
  const { t } = useTranslation();
  const [resolvedPlaceId, setResolvedPlaceId] = useState<string | null>(googlePlaceId ?? null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'hidden'>('idle');

  useEffect(() => {
    // Neu khong co browser key, khong goi va khong hien thi
    const apiKey =
      GOOGLE_MAPS_BROWSER_KEY ||
      (typeof import.meta !== 'undefined' ? import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY : '');
    if (!apiKey) {
      setStatus('hidden');
      return;
    }

    let isMounted = true;
    setStatus('loading');

    // Timeout 4s theo yeu cau: neu lau hon 4s hoac co loi, an the khong bao loi
    const timeoutId = setTimeout(() => {
      if (isMounted) {
        setStatus('hidden');
      }
    }, 4000);

    const init = async () => {
      try {
        let placeId = googlePlaceId ?? null;
        if (!placeId) {
          const matchRes = await poiApi.matchGooglePlace({
            external_id: externalId,
            name,
            lat,
            lng,
          });
          placeId = matchRes.google_place_id;
        }

        if (!placeId) {
          if (isMounted) setStatus('hidden');
          return;
        }

        const loaded = await loadPlacesUiKit();
        if (!isMounted) return;

        if (loaded) {
          setResolvedPlaceId(placeId);
          setStatus('ready');
        } else {
          setStatus('hidden');
        }
      } catch {
        // Loi goi API hoac timeout -> an the, khong hien loi
        if (isMounted) setStatus('hidden');
      } finally {
        clearTimeout(timeoutId);
      }
    };

    void init();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [externalId, name, lat, lng, googlePlaceId]);

  if (status !== 'ready' || !resolvedPlaceId) {
    return null;
  }

  return (
    <div
      className="my-3 rounded-card border border-line bg-surface-2 p-3.5"
      data-testid="google-place-card"
    >
      <div className="mb-2 flex items-center gap-1.5 text-label font-semibold text-ink">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-info text-caption font-bold text-surface">
          G
        </span>
        <span>{t('map.place.googleReviews')}</span>
      </div>
      <gmp-place-details data-testid="gmp-place-details" className="block w-full min-h-[120px]">
        <gmp-place-details-place-request
          data-testid="gmp-place-details-place-request"
          place-id={resolvedPlaceId}
        />
      </gmp-place-details>
    </div>
  );
};
