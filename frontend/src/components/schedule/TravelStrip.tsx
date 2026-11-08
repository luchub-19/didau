// Dải di chuyển giữa hai ô liên tiếp trên lịch (ALGO-03, DESIGN gđ6 §8 "Dải di chuyển trên lịch", T-90).
// Đủ giờ: dải sọc nhạt "12' · 3,2 km" cao đúng thời gian đi (tối thiểu 16px), không nhận con trỏ.
// Thiếu: nền pastel vàng "Thiếu 8'" + icon, bấm → "Vì sao?" (công thức đầy đủ + gợi ý + "Bỏ qua"). Không dùng đỏ.
// Khe không đủ chỗ cho dải (HIGH_RISK, khe 0…) → nhãn nhỏ đặt trên đường nối giữa hai ô, mép phải.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FeasibilityLeg } from '../../types';
import { formatDistance } from '../../i18n/format';
import { useLanguage } from '../../i18n/useLanguage';
import { MARGIN_MIN, OFFPEAK_MARGIN_RATIO, PEAK_MARGIN_RATIO, SEAM_PX, stripLayout, stripVisible } from '../../room/travel';
import { scrollParent } from '../../room/useCalendarDrag';
import { formatMinutes } from '../algo/tieSuggestionLogic';
import { WhyPanel } from '../algo/WhyPanel';
import { Moped, WarningCircle } from '../ui/Icon';

/** Đoạn thiếu giờ chạm một ô (ra đi hoặc đi tới), cho dòng cảnh báo trong popup ô. */
export interface TravelNote {
  leg: FeasibilityLeg;
  fromName: string;
  toName: string;
  /** `out` = từ ô này đi tiếp; `in` = từ ô trước đi tới ô này. */
  direction: 'out' | 'in';
}

export interface TravelWhyProps {
  leg: FeasibilityLeg;
  fromName: string;
  toName: string;
  /** Thiếu → nút "Bỏ qua" (theo người xem). */
  onDismiss?: () => void;
}

/** Nội dung "Vì sao?" của một đoạn thiếu giờ (ALGORITHMS §7 "Cảnh báo di chuyển"). */
export const TravelWhy: React.FC<TravelWhyProps> = ({ leg, fromName, toName, onDismiss }) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const m = (n: number) => formatMinutes(n, lang);
  const ratioMargin = Math.ceil(Math.round(leg.eta_min * (leg.peak ? PEAK_MARGIN_RATIO : OFFPEAK_MARGIN_RATIO) * 1e6) / 1e6);
  const marginWhy =
    leg.margin_min === MARGIN_MIN && ratioMargin < MARGIN_MIN
      ? t('algo.travel.marginFloor')
      : leg.peak
        ? t('algo.travel.marginPeak')
        : t('algo.travel.marginOffpeak');
  const required = leg.eta_min + leg.margin_min + leg.buffer_min;
  const short = Math.max(0, -leg.slack_min);
  return (
    <div className="space-y-2 text-label leading-normal" data-testid="travel-why-content">
      <p className="font-semibold">{t('algo.travel.route', { from: fromName, to: toName })}</p>
      <p className="tabular-nums">
        {t('algo.travel.formula', {
          eta: m(leg.eta_min),
          margin: m(leg.margin_min),
          marginWhy,
          buffer: m(leg.buffer_min),
          required: m(required),
        })}
      </p>
      <p className="tabular-nums">
        {t(leg.risk === 'HIGH_RISK' ? 'algo.travel.gapLineHigh' : 'algo.travel.gapLine', {
          gap: m(leg.gap_min),
          short: m(short),
        })}
      </p>
      {short > 0 && (
        <div>
          <p className="text-ink-2">{t('algo.travel.tipsTitle')}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>{t('algo.travel.tipMove', { name: toName, minutes: m(short) })}</li>
            <li>{t('algo.travel.tipCloser', { name: fromName })}</li>
            <li>{t('algo.travel.tipShorten', { name: fromName })}</li>
          </ul>
        </div>
      )}
      {onDismiss && short > 0 && (
        <button
          type="button"
          onClick={onDismiss}
          data-testid="travel-dismiss"
          className="inline-flex min-h-[44px] items-center rounded-field border border-line px-3 text-label font-semibold text-ink hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
        >
          {t('algo.travel.dismiss')}
        </button>
      )}
    </div>
  );
};

/** Khung nhìn thấy của cột (khung cuộn). Lưới được nâng trên đầu/chân cột dính khi popover mở (CalendarColumn). */
function visibleBand(el: HTMLElement): { head: number; foot: number } {
  const sc = scrollParent(el);
  const r = sc && sc !== document.scrollingElement ? sc.getBoundingClientRect() : null;
  return { head: r?.top ?? 0, foot: r?.bottom ?? window.innerHeight };
}

/** Còn nhiều chỗ phía trên hơn phía dưới? */
function placeUp(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  const { head, foot } = visibleBand(el);
  return r.top - head > foot - r.bottom;
}

/** Popover vừa mở tràn khỏi khung cuộn → cuộn cột vừa đủ cho nó lộ hẳn. */
function revealPanel(el: HTMLElement): void {
  const panel = el.querySelector<HTMLElement>('[role="dialog"]');
  if (!panel) return;
  const r = panel.getBoundingClientRect();
  const { head, foot } = visibleBand(el);
  const sc = scrollParent(el);
  if (!sc) return;
  if (r.bottom > foot - 8) sc.scrollTop += Math.min(r.bottom - foot + 8, r.top - head - 8);
  else if (r.top < head + 8) sc.scrollTop -= head + 8 - r.top;
}

export interface TravelStripProps {
  leg: FeasibilityLeg;
  fromName: string;
  toName: string;
  /** Toạ độ dọc (px, tính từ đỉnh lưới) của giờ kết thúc ô trước. */
  top: number;
  pxPerMin: number;
  /** Người xem đã bấm "Bỏ qua" cho đúng số liệu này. */
  dismissed?: boolean;
  onDismiss?: () => void;
  /** Hướng mở mặc định của popover "Vì sao?"; lúc bấm sẽ chọn lại theo chỗ trống thật (tránh chân/đầu cột dính). */
  openUp?: boolean;
}

export const TravelStrip: React.FC<TravelStripProps> = ({
  leg,
  fromName,
  toName,
  top,
  pxPerMin,
  dismissed = false,
  onDismiss,
  openUp = false,
}) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [up, setUp] = useState(openUp);
  if (!stripVisible(leg)) return null;
  const { mode, height } = stripLayout(leg, pxPerMin);
  const shortMin = leg.slack_min < 0 ? -leg.slack_min : 0;
  const warn = shortMin > 0 && !dismissed;
  const minutes = formatMinutes(leg.eta_min, lang);
  const text =
    leg.distance_km > 0
      ? t('algo.travel.leg', { minutes, km: formatDistance(leg.distance_km, lang) })
      : t('algo.travel.legNoKm', { minutes });
  const high = leg.risk === 'HIGH_RISK';
  const common = {
    'data-testid': 'travel-strip',
    'data-from': leg.from_item_id,
    'data-to': leg.to_item_id,
    'data-risk': warn ? leg.risk : 'SAFE',
    'data-mode': mode,
  } as const;

  // Dải yên (đủ giờ hoặc đã bỏ qua): không nhận con trỏ để kéo/thả trên lưới không bị chặn
  if (!warn) {
    if (mode === 'seam') return null; // khe quá hẹp + đã bỏ qua: không chen nhãn
    return (
      <div
        {...common}
        className="cal-outside pointer-events-none absolute left-1.5 right-1.5 flex items-center gap-1 overflow-hidden rounded-field bg-surface px-1.5 text-caption leading-none text-ink-3"
        style={{ top: top + 1, height: height - 2 }}
      >
        <Moped size={12} aria-hidden="true" className="shrink-0" />
        <span aria-hidden="true" className="truncate tabular-nums">
          {text}
        </span>
        <span className="sr-only">{t('algo.travel.stripAria', { from: fromName, to: toName, minutes })}</span>
      </div>
    );
  }

  const shortText = t('algo.travel.short', { minutes: formatMinutes(shortMin, lang) });
  const pill = (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap text-caption font-semibold leading-none text-ink ${
        mode === 'seam' ? `rounded-chip border bg-warning-soft px-1.5 py-0.5 ${high ? 'border-warning' : 'border-warning/40'}` : ''
      }`}
    >
      <WarningCircle size={12} weight="fill" aria-hidden="true" className="shrink-0 text-warning" />
      <span className="tabular-nums">{shortText}</span>
      {mode === 'band' && height >= 30 && <span className="font-normal tabular-nums text-ink-2">· {text}</span>}
    </span>
  );

  const style: React.CSSProperties =
    mode === 'band'
      ? { top: top + 1, height: height - 2 }
      : { top: top + (leg.gap_min * pxPerMin) / 2 - SEAM_PX / 2, height: SEAM_PX };

  return (
    <div
      {...common}
      // Bấm mở: popover lên/xuống theo phía còn nhiều chỗ hơn giữa đầu cột và chân cột dính (đo lúc bấm,
      // vì vị trí cuộn của cột không biết trước). `focus-within` nâng dải đang mở lên trên các dải/ô khác.
      onClickCapture={(e) => {
        const el = e.currentTarget;
        setUp(placeUp(el));
        requestAnimationFrame(() => revealPanel(el));
      }}
      className={`absolute z-content focus-within:z-sheet ${
        mode === 'band'
          ? `left-1.5 right-1.5 flex items-center rounded-field bg-warning-soft ${high ? 'border border-warning' : ''}`
          : 'right-1 flex items-center'
      }`}
      style={style}
    >
      <WhyPanel
        className="!static"
        title={t('algo.travel.whyTitle')}
        source={leg.source}
        placement={up ? 'top' : 'bottom'}
        align={mode === 'seam' ? 'right' : 'left'}
        triggerAriaLabel={t('algo.travel.shortAria', { from: fromName, to: toName, minutes: formatMinutes(shortMin, lang) })}
        triggerClassName={`flex min-h-[44px] items-center rounded-field px-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text hover:underline ${
          mode === 'band' ? 'h-full w-full' : ''
        } -my-3`}
        data-testid="travel-why"
        label={pill}
      >
        <TravelWhy leg={leg} fromName={fromName} toName={toName} onDismiss={onDismiss} />
      </WhyPanel>
    </div>
  );
};
