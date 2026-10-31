import React from 'react';
import { CharacterAvatar } from './CharacterAvatar';

export interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showTitle?: boolean;
  /** `member.avatar_url`; thiếu thì vẽ theo `seed`. */
  avatarUrl?: string | null;
  /** Seed dự phòng (thường `member.id`); thiếu thì dùng tên. */
  seed?: string;
}

const PX = { sm: 32, md: 40, lg: 48 } as const;
const BOX = { sm: 'w-8 h-8', md: 'w-10 h-10', lg: 'w-12 h-12' } as const;

/** Avatar thành viên: nhân vật hoạt hình (CharacterAvatar) trong khung bo `rounded-field`. */
export const Avatar: React.FC<AvatarProps> = ({
  name,
  size = 'md',
  className = '',
  showTitle = true,
  avatarUrl,
  seed,
}) => {
  const trimmed = name.trim();
  return (
    <div
      title={showTitle ? name : undefined}
      className={`rounded-field inline-flex flex-shrink-0 overflow-hidden ${BOX[size]} ${className}`}
    >
      <CharacterAvatar
        avatarUrl={avatarUrl}
        fallbackSeed={seed ?? (trimmed || 'anonymous')}
        name={name}
        size={PX[size]}
      />
    </div>
  );
};
