import React, { useEffect, useRef, useState } from 'react';
import { poiApi } from '../../services/api/poiApi';
import { loadPlacesUiKit } from '../../services/google/loadPlacesUiKit';
import { GOOGLE_MAPS_BROWSER_KEY } from '../../config';

export interface GooglePlaceCardProps {
  externalId: string;
  name: string;
  lat: number;
  lng: number;
  googlePlaceId?: string | null;
  /** Báo kết quả cho trang chi tiết: 'failed' (không key, không khớp, lỗi, quá 4 s) → lùi xuống iframe Embed. */
  onStatusChange?: (status: 'ready' | 'failed') => void;
}

/** Hết thời gian chờ khớp + tải thư viện UI Kit thì bỏ tầng 2 (DESIGN gđ5 §6). */
const UI_KIT_TIMEOUT_MS = 4000;

export const GooglePlaceCard: React.FC<GooglePlaceCardProps> = ({
  externalId,
  name,
  lat,
  lng,
  googlePlaceId,
  onStatusChange,
}) => {
  const [resolvedPlaceId, setResolvedPlaceId] = useState<string | null>(googlePlaceId ?? null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'hidden'>('idle');
  // Giữ callback mới nhất mà không chạy lại effect tải
  const onStatusRef = useRef(onStatusChange);
  onStatusRef.current = onStatusChange;

  useEffect(() => {
    if (status === 'ready') onStatusRef.current?.('ready');
    else if (status === 'hidden') onStatusRef.current?.('failed');
  }, [status]);

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

    // Hết 4 s hoặc lỗi: ẩn thẻ, không báo lỗi. Đã quá hạn thì kết quả về muộn cũng bỏ.
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      if (isMounted) setStatus('hidden');
    }, UI_KIT_TIMEOUT_MS);

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

        if (!placeId || timedOut) {
          if (isMounted) setStatus('hidden');
          return;
        }

        const loaded = await loadPlacesUiKit();
        if (!isMounted || timedOut) return;

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
    <div className="rounded-card border border-line bg-surface p-3" data-testid="google-place-card">
      {/* Giao diện + logo do Google vẽ (điều khoản UI Kit); không tự vẽ logo giả */}
      <gmp-place-details data-testid="gmp-place-details" className="block w-full min-h-[120px]">
        <gmp-place-details-place-request
          data-testid="gmp-place-details-place-request"
          place-id={resolvedPlaceId}
        />
      </gmp-place-details>
    </div>
  );
};
