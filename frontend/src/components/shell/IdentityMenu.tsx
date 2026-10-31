// Góc phải thanh đỉnh: "N đang xem" + menu avatar (DESIGN gđ5 §4). Thay tab "Nhóm" cũ.
// Desktop: popover neo dưới nút; mobile: Sheet. Esc đóng, focus trả về nút.
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Member, Room } from '../../types';
import { Avatar, Button, Card, CaretDown, LanguageSwitcher, Segmented, Sheet } from '../ui';
import { InviteCard } from '../room/InviteCard';
import { formatMoney, formatTimeRange } from '../../i18n/format';
import { useLanguage } from '../../i18n/useLanguage';
import { useTheme, type Theme } from '../../theme/useTheme';
import { SoundToggle } from '../../sound';
import { usePresenceStore } from '../../store/usePresenceStore';
import { MemberList } from '../room/MemberList';
import { identityMenuItems, splitViewers, viewerIds } from './identity';
import { useWorkspaceLayout } from './workspace';

/* ---------- Khung chung: popover (desktop) hoặc Sheet (mobile) ---------- */

interface TriggerProps {
  ref: React.RefObject<HTMLButtonElement>;
  onClick: () => void;
  'aria-expanded': boolean;
  'aria-haspopup': 'dialog';
  'aria-controls': string | undefined;
}

interface PanelHostProps {
  title: string;
  /** Bề rộng popover desktop (class Tailwind); mặc định rộng cho menu avatar. */
  widthClass?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  renderTrigger: (p: TriggerProps) => React.ReactNode;
  children: React.ReactNode;
}

const PanelHost: React.FC<PanelHostProps> = ({ title, widthClass = 'w-[24rem]', open, onOpenChange, renderTrigger, children }) => {
  const layout = useWorkspaceLayout();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const asSheet = layout === 'mobile';

  // Popover: bấm ra ngoài hoặc Esc thì đóng; Esc trả focus về nút
  useEffect(() => {
    if (!open || asSheet) return;
    panelRef.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onOpenChange(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, asSheet, onOpenChange]);

  const trigger = renderTrigger({
    ref: triggerRef,
    onClick: () => onOpenChange(!open),
    'aria-expanded': open,
    'aria-haspopup': 'dialog',
    'aria-controls': open && !asSheet ? panelId : undefined,
  });

  if (asSheet) {
    return (
      <>
        {trigger}
        <Sheet isOpen={open} onClose={() => onOpenChange(false)} title={title}>
          <div className="space-y-4 pb-2">{children}</div>
        </Sheet>
      </>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      {trigger}
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={title}
          tabIndex={-1}
          className={`absolute right-0 top-full mt-2 ${widthClass} max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-card bg-surface border border-line shadow-float p-3 space-y-3 focus:outline-none`}
        >
          <h2 className="text-heading text-ink px-1">{title}</h2>
          {children}
        </div>
      )}
    </div>
  );
};

/* ---------- "N đang xem" ---------- */

export interface ViewersButtonProps {
  members: Member[];
  currentMember?: Member | null;
  isConnected: boolean;
}

export const ViewersButton: React.FC<ViewersButtonProps> = ({ members, currentMember, isConnected }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const peers = usePresenceStore((s) => s.peers);
  const meId = currentMember?.id;

  // `peers` đổi khi có người mới/hết hạn (channel.ts prune đúng lúc) nên không cần timer ở đây
  const ids = useMemo(() => viewerIds(peers, meId, members, Date.now()), [peers, meId, members]);
  const { viewing, away } = useMemo(() => splitViewers(members, ids), [members, ids]);
  const stack = viewing.slice(0, 3);
  // Đếm theo `ids` (mình luôn có mặt dù danh sách thành viên chưa tải xong)
  const label = t('identity.viewingCount', { count: ids.length });

  return (
    <PanelHost
      title={t('identity.viewersTitle')}
      widthClass="w-[18rem]"
      open={open}
      onOpenChange={setOpen}
      renderTrigger={(p) => (
        <button
          type="button"
          {...p}
          aria-label={label}
          className="inline-flex items-center gap-2 min-h-[44px] px-2 rounded-field text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
        >
          <span className="flex -space-x-2" aria-hidden="true">
            {stack.map((m) => (
              <Avatar
                key={m.id}
                name={m.nickname}
                avatarUrl={m.avatar_url}
                seed={m.id}
                size="sm"
                showTitle={false}
                className="ring-2 ring-surface"
              />
            ))}
          </span>
          <span className="hidden sm:inline text-label tabular-nums" data-testid="viewers-count">
            {label}
          </span>
          <span className="sm:hidden text-label tabular-nums" aria-hidden="true">
            {ids.length}
          </span>
        </button>
      )}
    >
      <ViewersList
        title={t('identity.viewing', { count: viewing.length })}
        members={viewing}
        meId={meId}
        isConnected={isConnected}
      />
      {away.length > 0 && (
        <ViewersList title={t('identity.away', { count: away.length })} members={away} meId={meId} isConnected />
      )}
    </PanelHost>
  );
};

const ViewersList: React.FC<{ title: string; members: Member[]; meId?: string; isConnected: boolean }> = ({
  title,
  members,
  meId,
}) => {
  const { t } = useTranslation();
  return (
    <section>
      <h3 className="text-label text-ink-2 px-1">{title}</h3>
      <ul className="mt-1">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2 px-1 min-h-[44px]">
            <Avatar name={m.nickname} avatarUrl={m.avatar_url} seed={m.id} size="sm" showTitle={false} />
            <span className="text-body text-ink truncate flex-1">
              {m.nickname}
              {m.id === meId && <span className="text-caption text-ink-2"> ({t('member.you')})</span>}
            </span>
            {m.role === 'HOST' && <span className="text-caption text-ink-2 flex-shrink-0">{t('member.host')}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
};

/* ---------- Menu avatar ---------- */

export interface IdentityMenuProps {
  room: Room;
  members: Member[];
  currentMember?: Member | null;
  isHost: boolean;
  isConnected: boolean;
  placesCount: number;
  scheduleCount: number;
  onOpenTieBreakModal?: () => void;
  /** Link cũ `?tab=group`: mở sẵn menu. */
  defaultOpen?: boolean;
}

export const IdentityMenu: React.FC<IdentityMenuProps> = ({
  room,
  members,
  currentMember,
  isHost,
  isConnected,
  placesCount,
  scheduleCount,
  onOpenTieBreakModal,
  defaultOpen = false,
}) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const items = identityMenuItems(isHost, room.status);

  const name = currentMember?.nickname ?? t('place.defaultMember');
  const role = isHost ? t('member.host') : t('member.guest');
  const conn = isConnected ? t('connection.live') : t('connection.offline');

  const formattedDate = (() => {
    const [year, month, day] = room.event_date.split('-');
    if (year && month && day) return lang === 'en' ? `${month}/${day}/${year}` : `${day}/${month}/${year}`;
    return room.event_date;
  })();

  const rows: Array<[string, React.ReactNode]> = [
    [t('room.summary.status'), t(`group.status.${room.status}`)],
    [t('room.summary.eventDate'), formattedDate],
  ];
  if (room.start_minute !== undefined && room.end_minute !== undefined) {
    rows.push([t('room.summary.timeWindow'), formatTimeRange(room.start_minute, room.end_minute, lang)]);
  }
  rows.push(
    [t('room.summary.totalPlaces'), placesCount],
    [t('room.summary.totalSchedule'), scheduleCount],
    [t('room.summary.tieBreakStrategy'), t(`group.strategy.${room.tie_break_strategy}`)],
  );
  if (room.budget_limit) rows.push([t('room.summary.budgetPerPerson'), formatMoney(room.budget_limit, lang)]);

  return (
    <PanelHost
      title={t('identity.menuTitle')}
      open={open}
      onOpenChange={setOpen}
      renderTrigger={(p) => (
        <button
          type="button"
          {...p}
          aria-label={t('identity.menuLabel', { name, role, status: conn })}
          className="inline-flex items-center gap-2 min-h-[44px] pl-1 pr-2 rounded-field hover:bg-surface-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
        >
          {/* Viền avatar = trạng thái kết nối: xanh khi trực tiếp, vàng khi mất kết nối */}
          <span
            data-testid="identity-ring"
            data-connected={isConnected}
            title={conn}
            className={`inline-flex rounded-field ring-2 ring-offset-2 ring-offset-surface ${
              isConnected ? 'ring-success' : 'ring-warning'
            }`}
          >
            <Avatar
              name={name}
              avatarUrl={currentMember?.avatar_url}
              seed={currentMember?.id}
              size="sm"
              showTitle={false}
            />
          </span>
          <span className="hidden md:flex flex-col items-start text-left min-w-0 max-w-[9rem]" aria-hidden="true">
            <span className="text-label font-semibold text-ink truncate max-w-full">{name}</span>
            <span className="text-caption text-ink-2 leading-tight">{role}</span>
          </span>
          <CaretDown size={14} className="hidden md:block text-ink-2" aria-hidden="true" />
        </button>
      )}
    >
      <InviteCard roomId={room.id} code={room.code} title={room.title} alone={members.length <= 1} />
      <MemberList members={members} currentMemberId={currentMember?.id} isConnected={isConnected} />

      <Card as="section" aria-labelledby="trip-heading">
        <h2 id="trip-heading" className="text-heading text-ink">
          {t('room.summary.title')}
        </h2>
        <dl className="mt-2 text-body">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2 border-b border-line last:border-b-0">
              <dt className="text-ink-2">{label}</dt>
              <dd className="font-medium text-ink text-right tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        {items.tieBreak && onOpenTieBreakModal && (
          <div className="pt-3">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setOpen(false);
                onOpenTieBreakModal();
              }}
            >
              {t('room.summary.tieBreakAction')}
            </Button>
          </div>
        )}
      </Card>

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
    </PanelHost>
  );
};
