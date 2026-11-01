import React from 'react';
import { useTranslation } from 'react-i18next';

export interface MapEmbedProps {
  /** URL đã dựng bằng `mapEmbedUrl()` (room/placeView.ts); null → không render. */
  src: string | null;
  name: string;
}

/**
 * Tầng 3 của trang chi tiết quán (DESIGN gđ5 §6): iframe Maps Embed API chế độ `place` — bản đồ nhỏ, sao và số
 * review do Google vẽ. Miễn phí nhưng cần key; chỉ render khi có key và tầng 2 (UI Kit) không thành.
 * `loading="lazy"`: panel cuộn tới mới tải. Khung giữ tỉ lệ 16:9 nên không xô bố cục.
 */
export const MapEmbed: React.FC<MapEmbedProps> = ({ src, name }) => {
  const { t } = useTranslation();
  if (!src) return null;
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface-2 aspect-video" data-testid="map-embed">
      <iframe
        src={src}
        title={t('place.detail.embedTitle', { name })}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
        className="h-full w-full border-0"
      />
    </div>
  );
};
