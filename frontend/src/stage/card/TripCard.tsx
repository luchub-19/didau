// Thẻ chuyến đi 540×675 CSS px (DESIGN gđ6 §5). Màu theo palette Stage nhưng ĐỘC LẬP với giao diện của ứng dụng
// (người dùng đổi "Sài Gòn nắng" ↔ "Chạng vạng" trong modal) → khai báo biến màu ngay trên thẻ.
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Member, Place, Room, ScheduleItem } from '../../types';
import { CATEGORY_METADATA } from '../../components/common/categoryMetadata';
import { characterDataUri, resolveAvatarSeed } from '../../components/ui/characterAvatar';
import { formatDistance, formatTimeWindow, formatTime } from '../../i18n/format';
import type { Language } from '../../i18n/useLanguage';
import { CARD_HEIGHT, CARD_WIDTH } from './exportCard';
import { MAX_NAMES, describeLongDate, limitList, shortAddress, sortPlanItems } from './planText';
import type { PlanFeasibility, PlanLeg } from './planText';
import { routeSketch } from './routeSketch';

export type CardPalette = 'light' | 'dark';

/** Số điểm, avatar tối đa trên thẻ (DESIGN §5). */
export const MAX_CARD_STOPS = 6;
export const MAX_CARD_AVATARS = 8;
const SKETCH_W = CARD_WIDTH - 72;
const SKETCH_H = 100;

// Coral `accent` (#FF6B4A) và chữ trên coral (#2B1B12) giống nhau ở cả hai palette nên viết thẳng trong thẻ.
// Giá trị lấy nguyên từ token `--stage-*` (DESIGN gđ4 §2); lặp lại ở đây vì thẻ phải đổi palette độc lập với trang.
const PALETTES: Record<CardPalette, Record<string, string>> = {
  light: {
    '--c-paper': '251 243 228',
    '--c-paper-2': '243 227 199',
    '--c-ink': '43 27 18',
    '--c-ink-2': '107 74 54',
    '--c-accent-text': '184 58 34',
    '--c-sky': '31 111 168',
    '--c-sunlight':
      'linear-gradient(115deg, rgb(255 107 74 / 0.18) 0%, rgb(233 164 0 / 0.14) 45%, rgb(251 243 228 / 0) 75%)',
  },
  dark: {
    '--c-paper': '26 20 32',
    '--c-paper-2': '39 29 44',
    '--c-ink': '251 239 224',
    '--c-ink-2': '205 182 164',
    '--c-accent-text': '255 143 112',
    '--c-sky': '134 189 232',
    '--c-sunlight':
      'linear-gradient(115deg, rgb(255 107 74 / 0.16) 0%, rgb(124 58 140 / 0.14) 50%, rgb(26 20 32 / 0) 80%)',
  },
};

const col = (name: string) => `rgb(var(--c-${name}))`;
const BODY_FONT = "'Be Vietnam Pro', system-ui, sans-serif";
const DISPLAY_FONT = "'Bricolage Grotesque', 'Be Vietnam Pro', system-ui, sans-serif";

export interface TripCardProps {
  room: Pick<Room, 'title' | 'event_date' | 'start_minute' | 'end_minute' | 'code'>;
  items: readonly ScheduleItem[];
  places: readonly Pick<Place, 'id' | 'category' | 'latitude' | 'longitude'>[];
  members: readonly Pick<Member, 'id' | 'nickname' | 'avatar_url'>[];
  palette: CardPalette;
  lang: Language;
  /** Ảnh tuyển chọn (cùng origin) cho điểm đầu; thiếu thì bỏ. */
  photo?: string | null;
  legs?: readonly PlanLeg[];
  feasibility?: PlanFeasibility | null;
}

export const TripCard = React.forwardRef<HTMLDivElement, TripCardProps>(function TripCard(
  { room, items, places, members, palette, lang, photo = null, legs = [], feasibility = null },
  ref,
) {
  const { t } = useTranslation();
  const sorted = useMemo(() => sortPlanItems(items), [items]);
  const placeOf = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const { shown, extra } = limitList(sorted, MAX_CARD_STOPS);
  const { shown: avatars, extra: avatarExtra } = limitList(members, MAX_CARD_AVATARS);
  const { shown: names, extra: nameExtra } = limitList(members, MAX_NAMES);
  const legAfter = new Map(legs.map((l) => [l.fromId, l]));

  // Phác thảo chỉ nối các điểm đang hiện trên thẻ; khung SVG co theo chỗ còn trống (viewBox + meet)
  const sketch = routeSketch(
    shown.map((i) => {
      const p = placeOf.get(i.place_id);
      return { lat: p?.latitude, lng: p?.longitude };
    }),
    SKETCH_W,
    SKETCH_H,
    16,
  );

  const date = describeLongDate(room.event_date, lang);
  const windowText = formatTimeWindow(room.start_minute ?? 1020, room.end_minute ?? 1380, lang);
  const spare =
    feasibility && !feasibility.shortfall && feasibility.spareMinutes != null && feasibility.spareMinutes >= 0
      ? Math.round(feasibility.spareMinutes)
      : null;

  return (
    <div
      ref={ref}
      data-testid="trip-card"
      data-palette={palette}
      lang={lang}
      style={{
        ...(PALETTES[palette] as React.CSSProperties),
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: col('paper'),
        backgroundImage: 'var(--c-sunlight)',
        color: col('ink'),
        fontFamily: BODY_FONT,
        lineHeight: 1.4,
      }}
      className="relative flex flex-col overflow-hidden px-9 pb-7 pt-9"
    >
      {/* Tên buổi: tối đa 2 dòng, line-height ≥1.2 cho dấu tiếng Việt */}
      <h3
        data-testid="trip-card-title"
        style={{
          fontFamily: DISPLAY_FONT,
          fontWeight: 800,
          fontSize: 36,
          lineHeight: 1.2,
          letterSpacing: '-0.02em',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          margin: 0,
        }}
      >
        {room.title}
      </h3>
      <p style={{ margin: '8px 0 0', fontSize: 15, fontWeight: 600, color: col('ink-2') }}>
        {date && <span>{date} · </span>}
        <span>{windowText}</span>
      </p>

      <ol style={{ listStyle: 'none', margin: '18px 0 0', padding: 0 }} data-testid="trip-card-stops">
        {shown.map((item, i) => {
          const meta = CATEGORY_METADATA[placeOf.get(item.place_id)?.category ?? 'OTHER'] ?? CATEGORY_METADATA.OTHER;
          const Icon = meta.IconComponent;
          const addr = shortAddress(item.place_address);
          const leg = legAfter.get(item.id);
          const next = shown[i + 1];
          return (
            <li key={item.id} style={{ marginTop: i === 0 ? 0 : 8 }}>
              <div className="flex items-start gap-2.5">
                <span
                  style={{ width: 70, flexShrink: 0, whiteSpace: 'nowrap', fontSize: 15, fontWeight: 700, lineHeight: '24px', fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatTime(item.start_minute, lang)}
                </span>
                <span
                  aria-hidden="true"
                  style={{
                    width: 24,
                    height: 24,
                    flexShrink: 0,
                    borderRadius: 999,
                    background: '#FF6B4A',
                    color: '#2B1B12',
                    fontSize: 13,
                    fontWeight: 700,
                    lineHeight: '24px',
                    textAlign: 'center',
                  }}
                >
                  {i + 1}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="flex items-center gap-1.5" style={{ fontSize: 16, fontWeight: 700, lineHeight: '24px' }}>
                    <Icon size={16} weight="duotone" style={{ flexShrink: 0, color: col('accent-text') }} />
                    <span className="truncate">{item.place_name}</span>
                  </div>
                  {addr && (
                    <div className="truncate" style={{ fontSize: 12.5, color: col('ink-2'), lineHeight: '18px' }}>
                      {addr}
                    </div>
                  )}
                </div>
                {i === 0 && photo && (
                  <img
                    src={photo}
                    alt=""
                    width={40}
                    height={40}
                    style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
                  />
                )}
              </div>
              {leg && next && leg.toId === next.id && (
                <div style={{ margin: '4px 0 0 114px', fontSize: 12, color: col('sky'), fontWeight: 600 }}>
                  {t('export.card.leg', { minutes: Math.max(1, Math.round(leg.minutes)) })}
                  {leg.km != null && leg.km > 0 ? ` · ${formatDistance(leg.km, lang)}` : ''}
                  {leg.estimated ? ` ${t('export.text.estimated')}` : ''}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {extra > 0 && (
        <p data-testid="trip-card-more" style={{ margin: '8px 0 0 114px', fontSize: 13, fontWeight: 600, color: col('accent-text') }}>
          {t('export.card.more', { count: extra })}
        </p>
      )}

      {/* Chỗ còn trống giữa danh sách và chân thẻ: ảnh phác thảo chiếm phần này (không có toạ độ thì để trống) */}
      <div style={{ flex: '1 1 0', minHeight: 0, marginTop: 14, marginBottom: 14 }}>
        {sketch && (
          <svg
            data-testid="trip-card-sketch"
            width="100%"
            height="100%"
            viewBox={`0 0 ${sketch.width} ${sketch.height}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={t('export.card.routeLabel')}
            style={{ display: 'block', borderRadius: 14, background: col('paper-2') }}
          >
            <polyline points={sketch.points} fill="none" stroke={col('sky')} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 7" />
            {sketch.nodes.map((n) => (
              <g key={n.index}>
                <circle cx={n.x} cy={n.y} r={11} fill="#FF6B4A" stroke={col('ink')} strokeWidth={1.5} />
                <text x={n.x} y={n.y + 4.5} textAnchor="middle" fontSize={13} fontWeight={700} fill="#2B1B12" style={{ fontFamily: BODY_FONT }}>
                  {n.index + 1}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>

      {spare != null && (
        <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: col('ink-2') }}>
          {t('export.card.spare', { minutes: spare })}
        </p>
      )}

      {members.length > 0 && (
        <div className="flex items-center gap-3" data-testid="trip-card-members">
          <div className="flex shrink-0 items-center" style={{ paddingLeft: 8 }}>
            {avatars.map((m) => (
              <img
                key={m.id}
                src={characterDataUri(resolveAvatarSeed(m.avatar_url, m.id))}
                alt=""
                width={34}
                height={34}
                style={{ width: 34, height: 34, borderRadius: 999, marginLeft: -8, border: `2px solid ${col('paper')}`, background: col('paper-2') }}
              />
            ))}
            {avatarExtra > 0 && (
              <span
                style={{ marginLeft: -8, width: 34, height: 34, borderRadius: 999, border: `2px solid ${col('paper')}`, background: col('paper-2'), fontSize: 12, fontWeight: 700, lineHeight: '30px', textAlign: 'center' }}
              >
                +{avatarExtra}
              </span>
            )}
          </div>
          <p style={{ margin: 0, minWidth: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.35, color: col('ink-2') }}>
            {names.map((m) => m.nickname).join(', ')}
            {nameExtra > 0 ? ` +${nameExtra}` : ''}
          </p>
        </div>
      )}

      <p
        data-testid="trip-card-footer"
        style={{ margin: '16px 0 0', paddingTop: 12, borderTop: '1px solid rgb(var(--c-ink-2) / 0.25)', fontSize: 13, fontWeight: 700, color: col('ink-2') }}
      >
        {t('export.card.footer', { app: t('app.name'), code: room.code })}
      </p>
    </div>
  );
});
