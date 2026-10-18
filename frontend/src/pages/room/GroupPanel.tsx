import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Member, Room } from '../../types';
import { MemberList } from '../../components/room';
import { Button, LanguageSwitcher } from '../../components/ui';
import { formatMoney } from '../../i18n/format';
import { useLanguage } from '../../i18n/useLanguage';

export interface GroupPanelProps {
  room: Room;
  members: Member[];
  currentMember?: Member | null;
  isHost: boolean;
  placesCount: number;
  scheduleCount: number;
  onOpenTieBreakModal?: () => void;
}

export const GroupPanel: React.FC<GroupPanelProps> = ({
  room,
  members,
  currentMember,
  isHost,
  placesCount,
  scheduleCount,
  onOpenTieBreakModal,
}) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();

  const formattedDate = (() => {
    try {
      const [year, month, day] = room.event_date.split('-');
      if (year && month && day) {
        return lang === 'en'
          ? `${month}/${day}/${year}`
          : `${day}/${month}/${year}`;
      }
    } catch {
      // Giữ nguyên chuỗi ngày nếu không parse được
    }
    return room.event_date;
  })();

  return (
    <div className="space-y-6">
      {/* Danh sách thành viên */}
      <MemberList members={members} currentMemberId={currentMember?.id} />

      {/* Thông tin chuyến đi */}
      <div className="bg-surface rounded-card border border-line p-4 shadow-xs space-y-3">
        <h3 className="text-label font-bold uppercase tracking-wider text-ink-2">
          {t('room.summary.title')}
        </h3>

        <div className="space-y-2 text-caption">
          <div className="flex justify-between py-1.5 border-b border-line">
            <span className="text-ink-2">{t('room.summary.status')}:</span>
            <span className="font-semibold text-ink">{room.status}</span>
          </div>

          <div className="flex justify-between py-1.5 border-b border-line">
            <span className="text-ink-2">{t('room.summary.eventDate')}:</span>
            <span className="font-semibold text-ink">{formattedDate}</span>
          </div>

          <div className="flex justify-between py-1.5 border-b border-line">
            <span className="text-ink-2">{t('room.summary.totalPlaces')}:</span>
            <span className="font-semibold text-ink">{placesCount}</span>
          </div>

          <div className="flex justify-between py-1.5 border-b border-line">
            <span className="text-ink-2">{t('room.summary.totalSchedule')}:</span>
            <span className="font-semibold text-ink">{scheduleCount}</span>
          </div>

          <div className="flex justify-between py-1.5 border-b border-line">
            <span className="text-ink-2">{t('room.summary.tieBreakStrategy')}:</span>
            <span className="font-semibold text-ink">{room.tie_break_strategy}</span>
          </div>

          {room.budget_limit && (
            <div className="flex justify-between py-1.5 border-b border-line">
              <span className="text-ink-2">{t('room.summary.budgetPerPerson')}:</span>
              <span className="font-semibold text-ink">
                {formatMoney(room.budget_limit, lang)}
              </span>
            </div>
          )}
        </div>

        {isHost && onOpenTieBreakModal && room.status !== 'FINALIZED' && (
          <div className="pt-2">
            <Button
              variant="secondary"
              fullWidth
              onClick={onOpenTieBreakModal}
            >
              {t('room.summary.tieBreakAction')}
            </Button>
          </div>
        )}
      </div>

      {/* Cài đặt ngôn ngữ */}
      <div className="bg-surface rounded-card border border-line p-4 shadow-xs flex items-center justify-between">
        <span className="text-label text-ink-2 font-medium">
          {lang === 'en' ? t('lang.en') : t('lang.vi')}
        </span>
        <LanguageSwitcher />
      </div>
    </div>
  );
};
