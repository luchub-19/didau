import React, { useMemo } from 'react';
import { characterDataUri, resolveAvatarSeed } from './characterAvatar';

export interface CharacterAvatarProps {
  /** `member.avatar_url` (URL DiceBear lưu sẵn); chỉ đọc seed, không tải. */
  avatarUrl?: string | null;
  /** Seed khi `avatarUrl` rỗng/lạ — thường `member.id`. */
  fallbackSeed: string;
  /** Tên hiển thị, dùng làm `alt`. */
  name: string;
  /** Cạnh vuông, px. */
  size?: number;
  className?: string;
}

/** Nhân vật hoạt hình sinh tại máy: cùng seed → cùng hình trên mọi máy. */
export const CharacterAvatar: React.FC<CharacterAvatarProps> = ({
  avatarUrl,
  fallbackSeed,
  name,
  size = 40,
  className = '',
}) => {
  const seed = resolveAvatarSeed(avatarUrl, fallbackSeed);
  const src = useMemo(() => characterDataUri(seed), [seed]);

  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      draggable={false}
      className={`block bg-surface-2 rounded-field select-none ${className}`}
      style={{ width: size, height: size }}
    />
  );
};
