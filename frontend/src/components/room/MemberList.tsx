import React from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Card } from '../ui';
import type { Member } from '../../types';

export interface MemberListProps {
  members: Member[];
  currentMemberId?: string;
  /** WebSocket đang kết nối; mất kết nối thì trạng thái online chuyển thành "không rõ" */
  isConnected?: boolean;
  className?: string;
}

type Presence = 'online' | 'offline' | 'unknown';

function presenceOf(member: Member, isConnected: boolean): Presence {
  if (!isConnected) return 'unknown';
  return member.is_active ? 'online' : 'offline';
}

const DOT_CLASS: Record<Presence, string> = {
  online: 'bg-success',
  offline: 'bg-ink-3',
  unknown: 'bg-warning',
};

export const MemberList: React.FC<MemberListProps> = ({
  members,
  currentMemberId,
  isConnected = true,
  className = '',
}) => {
  const { t } = useTranslation();

  // Online trước; Array.sort ổn định nên thứ tự cũ được giữ trong cùng nhóm
  const sorted = [...members].sort(
    (a, b) => Number(b.is_active) - Number(a.is_active),
  );

  return (
    <Card as="section" aria-labelledby="member-heading" className={className}>
      <h2 id="member-heading" className="text-heading text-ink flex items-center gap-2">
        {t('member.title')}
        <span className="text-label text-ink-2 tabular-nums">{members.length}</span>
      </h2>

      <ul className="mt-2 divide-y divide-line">
        {sorted.map((member) => {
          const isMe = member.id === currentMemberId;
          const presence = presenceOf(member, isConnected);
          const presenceLabel = t(`member.presence.${presence}`);

          return (
            <li key={member.id} className="flex items-center gap-3 py-3 min-h-[56px]">
              <Avatar name={member.nickname} showTitle={false} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-body font-medium text-ink truncate">
                    {member.nickname}
                  </span>
                  {isMe && (
                    <span className="text-caption text-ink-2 flex-shrink-0">
                      ({t('member.you')})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-caption text-ink-2">
                  <span
                    aria-hidden="true"
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_CLASS[presence]}`}
                  />
                  <span>{presenceLabel}</span>
                </div>
              </div>

              {member.role === 'HOST' && (
                <span className="text-caption font-medium text-ink bg-surface-2 border border-line rounded-full px-2.5 py-0.5 flex-shrink-0">
                  {t('member.host')}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
};
