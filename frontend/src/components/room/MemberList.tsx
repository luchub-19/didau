import React from 'react';
import { Badge } from '../common';
import type { Member } from '../../types';

export interface MemberListProps {
  members: Member[];
  currentMemberId?: string;
  className?: string;
}

export const MemberList: React.FC<MemberListProps> = ({
  members,
  currentMemberId,
  className = '',
}) => {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 p-4 shadow-xs ${className}`}>
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <span>👥 Thành viên</span>
          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[11px] font-bold">
            {members.length}
          </span>
        </h3>
        <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Realtime
        </span>
      </div>

      <div className="mt-3 divide-y divide-slate-50 max-h-72 overflow-y-auto">
        {members.map((member) => {
          const isMe = member.id === currentMemberId;
          const avatarUrl =
            member.avatar_url ||
            `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
              member.nickname,
            )}`;

          return (
            <div
              key={member.id}
              className={`flex items-center justify-between py-2 px-1 rounded-xl transition ${
                isMe ? 'bg-sky-50/50' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative">
                  <img
                    src={avatarUrl}
                    alt={member.nickname}
                    className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 object-cover"
                  />
                  {member.is_active && (
                    <span
                      title="Online"
                      className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white"
                    />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-800 truncate">
                      {member.nickname}
                    </span>
                    {isMe && (
                      <span className="text-[10px] text-sky-600 font-bold bg-sky-100/70 px-1.5 py-0.2 rounded">
                        Bạn
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {member.is_active ? 'Đang hoạt động' : 'Đã rời phòng'}
                  </div>
                </div>
              </div>

              <div>
                <Badge variant={member.role} size="sm">
                  {member.role}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
