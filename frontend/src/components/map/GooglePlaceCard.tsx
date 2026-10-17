import React, { useEffect, useState } from 'react';
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
  const [resolvedPlaceId, setResolvedPlaceId] = useState<string | null>(googlePlaceId ?? null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'hidden'>('idle');

  useEffect(() => {
    // Nếu không có browser key, không gọi và không hiển thị
    const apiKey =
      GOOGLE_MAPS_BROWSER_KEY ||
      (typeof import.meta !== 'undefined' ? import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY : '');
    if (!apiKey) {
      setStatus('hidden');
      return;
    }

    let isMounted = true;
    setStatus('loading');

    // Timeout 4s theo yêu cầu: nếu lâu hơn 4s hoặc có lỗi, ẩn thẻ không báo lỗi đỏ
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
        // Lỗi gọi API hoặc timeout -> ẩn thẻ, không hiện lỗi đỏ
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
      className="my-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3"
      data-testid="google-place-card"
    >
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
          G
        </span>
        <span>Đánh giá từ Google</span>
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
