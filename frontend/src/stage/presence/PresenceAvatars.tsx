// Ai đang xem quán này (CR-08): tối đa 3 avatar + "+N". Người vừa bỏ phiếu phát `presence.pulse` một lần.
import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MOTION_PRESETS, motionAttrs, resolvePreset, useMotionTier } from '../../motion';
import { Avatar } from '../../components/ui/Avatar';
import { usePresenceStore, type VotePulse } from '../../store/usePresenceStore';
import { useRoomStore } from '../../store/useRoomStore';
import { avatarStack, viewersByPlace } from './rules';

/** Nhịp vừa xảy ra chưa quá một chuỗi `presence.pulse` (avatar mới hiện vì chính phiếu đó). */
const isFresh = (at: number | undefined) =>
  at !== undefined && Date.now() - at < MOTION_PRESETS['presence.pulse'].maxSequenceMs;

/** Nhịp một lần quanh avatar khi `seq` đổi; 'static' chỉ chớp opacity. */
const PulseRing: React.FC<{ seq: number | undefined; at: number | undefined }> = ({ seq, at }) => {
  const tier = useMotionTier();
  const ref = useRef<HTMLSpanElement>(null);
  // Lần mount: phiếu cũ coi như đã thấy, phiếu vừa xong vẫn phát
  const seen = useRef(isFresh(at) ? undefined : seq);

  useEffect(() => {
    const el = ref.current;
    if (seq === undefined || seq === seen.current) return;
    seen.current = seq;
    if (!el || typeof el.animate !== 'function') return;
    const m = resolvePreset('presence.pulse', tier);
    const frames: Keyframe[] = m.move
      ? [
          { opacity: 0.9, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(1.6)' },
        ]
      : [{ opacity: 0.9 }, { opacity: 0 }];
    const anim = el.animate(frames, { duration: m.durationMs, easing: m.easing });
    return () => anim.cancel();
  }, [seq, tier]);

  return (
    <span
      ref={ref}
      {...motionAttrs('presence.pulse')}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-field ring-2 ring-accent opacity-0"
    />
  );
};

export interface PresenceAvatarStackProps {
  placeId: string;
  /** Người đang xem quán, theo thứ tự đến (không gồm chính mình). */
  viewers: { id: string; name: string }[];
  pulses: Record<string, VotePulse>;
  className?: string;
}

/** Phần hiển thị thuần (test được không cần store). */
export const PresenceAvatarStack: React.FC<PresenceAvatarStackProps> = ({ placeId, viewers, pulses, className = '' }) => {
  const { t } = useTranslation();
  if (viewers.length === 0) return null;

  const { shown, extra } = avatarStack(viewers);
  const label = t('presence.viewing', { count: viewers.length, names: viewers.map((v) => v.name).join(', ') });

  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      data-testid="presence-avatars"
      className={`flex items-center -space-x-2 ${className}`}
    >
      {shown.map(({ id, name }) => {
        const p = pulses[id];
        return (
          <span key={id} className="relative inline-flex rounded-field ring-2 ring-surface">
            <Avatar name={name} size="sm" showTitle={false} />
            <PulseRing seq={p?.placeId === placeId ? p.seq : undefined} at={p?.at} />
          </span>
        );
      })}
      {extra > 0 && (
        <span className="relative inline-flex h-8 min-w-8 items-center justify-center rounded-field bg-surface-2 px-1 text-caption font-semibold text-ink-2 ring-2 ring-surface tabular-nums">
          {t('presence.more', { count: extra })}
        </span>
      )}
    </div>
  );
};

export interface PresenceAvatarsProps {
  placeId: string;
  className?: string;
}

/** Bản nối store: dùng trong PlaceCard. */
export const PresenceAvatars: React.FC<PresenceAvatarsProps> = ({ placeId, className }) => {
  const { t } = useTranslation();
  const meId = useRoomStore((s) => s.currentMember?.id);
  const members = useRoomStore((s) => s.members);
  const peers = usePresenceStore((s) => s.peers);
  const pulses = usePresenceStore((s) => s.pulses);

  const viewers = useMemo(
    () =>
      (viewersByPlace(peers, meId)[placeId] ?? []).map((id) => ({
        id,
        name: members.find((m) => m.id === id)?.nickname ?? t('place.defaultMember'),
      })),
    [peers, meId, placeId, members, t],
  );

  return <PresenceAvatarStack placeId={placeId} viewers={viewers} pulses={pulses} className={className} />;
};
