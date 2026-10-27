import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Member, Room } from '../../types';
import { InviteCard, MemberList } from '../../components/room';
import { Button, Card, LanguageSwitcher, Segmented } from '../../components/ui';
import { formatMoney } from '../../i18n/format';
import { useLanguage } from '../../i18n/useLanguage';
import { useTheme, type Theme } from '../../theme/useTheme';
import { SoundToggle } from '../../sound';

export interface GroupPanelProps {
  room: Room;
  members: Member[];
  currentMember?: Member | null;
  isHost: boolean;
  isConnected?: boolean;
  placesCount: number;
  scheduleCount: number;
  onOpenTieBreakModal?: () => void;
}

export const GroupPanel: React.FC<GroupPanelProps> = ({
  room,
  members,
  currentMember,
  isHost,
  isConnected = true,
  placesCount,
  scheduleCount,
  onOpenTieBreakModal,
}) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { theme, setTheme } = useTheme();

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

  const alone = members.length <= 1;

  const summaryRows: Array<[string, React.ReactNode]> = [
    [t('room.summary.status'), t(`group.status.${room.status}`)],
    [t('room.summary.eventDate'), formattedDate],
    [t('room.summary.totalPlaces'), placesCount],
    [t('room.summary.totalSchedule'), scheduleCount],
    [t('room.summary.tieBreakStrategy'), t(`group.strategy.${room.tie_break_strategy}`)],
  ];
  if (room.budget_limit) {
    summaryRows.push([
      t('room.summary.budgetPerPerson'),
      formatMoney(room.budget_limit, lang),
    ]);
  }

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 lg:items-start">
      <div className="space-y-4">
        <InviteCard
          roomId={room.id}
          code={room.code}
          title={room.title}
          alone={alone}
        />
        <MemberList
          members={members}
          currentMemberId={currentMember?.id}
          isConnected={isConnected}
        />
      </div>

      <div className="space-y-4">
        {/* Thông tin chuyến đi */}
        <Card as="section" aria-labelledby="trip-heading">
          <h2 id="trip-heading" className="text-heading text-ink">
            {t('room.summary.title')}
          </h2>
          <dl className="mt-2 text-body">
            {summaryRows.map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between gap-4 py-2 border-b border-line last:border-b-0"
              >
                <dt className="text-ink-2">{label}</dt>
                <dd className="font-medium text-ink text-right tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          {isHost && onOpenTieBreakModal && room.status !== 'FINALIZED' && (
            <div className="pt-3">
              <Button variant="secondary" fullWidth onClick={onOpenTieBreakModal}>
                {t('room.summary.tieBreakAction')}
              </Button>
            </div>
          )}
        </Card>

        {/* Cài đặt */}
        <Card as="section" aria-labelledby="settings-heading">
          <h2 id="settings-heading" className="text-heading text-ink">
            {t('group.settings')}
          </h2>
          <div className="mt-2 flex items-center justify-between gap-4 min-h-[44px]">
            <span className="text-body text-ink">{t('group.language')}</span>
            <LanguageSwitcher />
          </div>
          <div className="pt-2 border-t border-line flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-h-[44px]">
            <span className="text-body text-ink">{t('group.theme')}</span>
            <Segmented<Theme>
              value={theme}
              onChange={setTheme}
              aria-label={t('theme.ariaLabel')}
              options={[
                { value: 'system', label: t('theme.system') },
                { value: 'light', label: t('theme.light') },
                { value: 'dark', label: t('theme.dark') },
              ]}
            />
          </div>
          <div className="pt-2 border-t border-line flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-h-[44px]">
            <div className="min-w-0">
              <span className="text-body text-ink">{t('group.sound')}</span>
              <p className="text-caption text-ink-2">{t('sound.hint')}</p>
            </div>
            <SoundToggle variant="label" className="self-start sm:self-auto flex-shrink-0" />
          </div>
        </Card>
      </div>
    </div>
  );
};
