/**
 * Nạp thư viện Google Places (UI Kit / Places element) lười biếng.
 * Chỉ thực hiện khi có VITE_GOOGLE_MAPS_BROWSER_KEY.
 * Nếu không có key hoặc chạy ngoài trình duyệt, trả về false và không chèn script.
 */
import { GOOGLE_MAPS_BROWSER_KEY } from '../../config';

let loadPromise: Promise<boolean> | null = null;

export async function loadPlacesUiKit(): Promise<boolean> {
  const apiKey =
    GOOGLE_MAPS_BROWSER_KEY ||
    (typeof import.meta !== 'undefined' ? import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY : '');
  if (!apiKey) {
    return false;
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  // Đã có sẵn trên window
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).google?.maps?.places) {
    return true;
  }

  if (loadPromise) return loadPromise;

  loadPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector('script[data-gmp-places]');
    if (existing) {
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.setAttribute('data-gmp-places', 'true');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=beta&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      resolve(true);
    };
    script.onerror = () => {
      resolve(false);
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

/** Reset loader phục vụ testing. */
export function resetPlacesUiKitLoader(): void {
  loadPromise = null;
}
