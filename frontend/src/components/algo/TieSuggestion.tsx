// Đề xuất hoà phiếu OMP (CR-15, T-96; PLAN gđ7 §5). Nằm trong `TieBlock`. Không có gì tự động (quyết định 8):
// mỗi loại đang hoà một thẻ "Chọn X sẽ tốt hơn · <con số>", chỉ host bấm chốt; ai muốn hiểu thì mở "Vì sao?".
//  - `TieWhyBody`: nội dung "Vì sao?" (T-108, PLAN gđ8 §5) — câu luật · thanh "người xa nhất" từng quán · câu đối
//    chiếu với "cộng tổng km" · thanh từng người tới quán đề xuất; mọi thanh chung một thước, không Ψ/trọng số.
//  - `CategoryTieCard`: thẻ của một loại.
//  - `TieSuggestionView`: phần hiển thị thuần (mọi trạng thái), test bằng markup.
//  - `TieSuggestionCard`: nối store + API; tự làm mới khi phiếu / vị trí đổi, giữ bản cũ tới khi có bản mới.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CategoryTieSuggestion, TieSuggestion } from '../../types';
import { Button, toast } from '../ui';
import { Check, MapPin } from '../ui/Icon';
import { WhyPanel } from './WhyPanel';
import { OriginSetting } from './OriginSetting';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import { describeApiError } from '../../i18n/serverText';
import { formatDistance } from '../../i18n/format';
import { useLanguage } from '../../i18n/useLanguage';
import { originStatus } from '../../room/origin';
import { useAlgoStore } from '../../store/useAlgoStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import { useRoomStore } from '../../store/useRoomStore';
import {
  TIE_RESOLVE_PAYLOAD,
  barRatio,
  barScale,
  buildCompareRows,
  buildWhyRows,
  contrastLine,
  formatMinutes,
  hasRecommendation,
  lockTarget,
  tieDelta,
  tieRefreshKey,
} from './tieSuggestionLogic';

const linkBtn =
  'min-h-11 px-3 text-label font-semibold text-accent-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text';

function useCategoryLabel() {
  const { t } = useTranslation();
  return (c: string) => t((CATEGORY_METADATA[c as keyof typeof CATEGORY_METADATA] ?? CATEGORY_METADATA.OTHER).labelKey);
}

/* ---------- "Vì sao?" (PLAN gđ8 §5) ---------- */

/**
 * Thanh "mọc" một lần khi panel mở (≤ `--t-ui`, `--ease-out`). Trạng thái mặc định là thanh đã đủ dài, chỉ chạy
 * Web Animations khi trình duyệt hỗ trợ và người dùng không bật giảm chuyển động — thiếu JS vẫn thấy đủ biểu đồ.
 */
function useGrowBars(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
    const css = getComputedStyle(document.documentElement);
    const duration = parseFloat(css.getPropertyValue('--t-ui')) || 220;
    const easing = css.getPropertyValue('--ease-out').trim() || 'ease-out';
    const anims = Array.from(root.querySelectorAll<HTMLElement>('[data-bar]')).flatMap((el) =>
      typeof el.animate === 'function'
        ? [el.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration, easing })]
        : [],
    );
    return () => anims.forEach((x) => x.cancel());
  }, [ref]);
}

/** Một hàng: chữ (tên + nhãn | phút + phụ) ở trên, thanh chung thước ở dưới. Thanh `aria-hidden`, chữ đủ nghĩa. */
const BarRow: React.FC<{
  label: React.ReactNode;
  minutes: number;
  extra?: React.ReactNode;
  ratio: number;
  highlight?: boolean;
  testId: string;
  data?: Record<string, string | boolean>;
}> = ({ label, minutes, extra, ratio, highlight = false, testId, data }) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  return (
    <li data-testid={testId} {...Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-${k}`, String(v)]))}>
      <div className="flex items-baseline justify-between gap-x-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-label text-ink">{label}</div>
        <div className="shrink-0 whitespace-nowrap text-right">
          <span aria-hidden="true" className="num text-label font-semibold text-ink">
            {formatMinutes(minutes, lang)}
          </span>
          <span className="sr-only">{t('algo.tie.minutesSr', { count: Math.round(minutes) })}</span>
          {extra}
        </div>
      </div>
      <div aria-hidden="true" className="mt-1 h-2">
        <div
          data-bar=""
          data-ratio={ratio.toFixed(3)}
          className={`h-full min-w-1 origin-left rounded-chip ${highlight ? 'bg-accent' : 'bg-ink-3'}`}
          style={{ width: `${(ratio * 100).toFixed(1)}%` }}
        />
      </div>
    </li>
  );
};

export const TieWhyBody: React.FC<{ suggestion: CategoryTieSuggestion; myMemberId?: string | null }> = ({
  suggestion: s,
  myMemberId,
}) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const ref = useRef<HTMLDivElement>(null);
  useGrowBars(ref);
  const rows = buildWhyRows(s, myMemberId);
  const { rows: compare, unranked } = buildCompareRows(s);
  const scale = barScale(s);
  const contrast = contrastLine(s);
  const recName = s.candidates.find((c) => c.place_id === s.recommended_place_id)?.name ?? '';
  const h4 = 'text-label font-semibold text-ink-2';

  return (
    <div ref={ref} data-testid="tie-why" data-scale={scale}>
      <p className="text-label leading-normal text-ink" data-testid="tie-why-rule">
        {t(s.members.length > 1 ? 'algo.tie.whyRuleFar' : 'algo.tie.whyRuleOne')}
      </p>

      {compare.length > 1 && (
        <section className="mt-4" data-testid="tie-why-compare">
          <h4 className={h4}>{t('algo.tie.chartTitle')}</h4>
          <ul className="mt-2 space-y-2.5">
            {compare.map((c) => (
              <BarRow
                key={c.placeId}
                testId="tie-why-compare-row"
                data={{ recommended: c.recommended, minsum: c.minSum }}
                minutes={c.maxMin}
                ratio={barRatio(c.maxMin, scale)}
                highlight={c.recommended}
                label={
                  <>
                    <span className={`break-words ${c.recommended ? 'font-semibold' : ''}`}>{c.name}</span>
                    {c.recommended && (
                      <span className="inline-flex items-center gap-0.5 text-caption font-semibold text-accent-text">
                        <Check size={12} weight="bold" aria-hidden="true" />
                        {t('algo.tie.recommended')}
                      </span>
                    )}
                    {c.minSum && (
                      <span className="text-caption text-ink-2" data-testid="tie-why-minsum-tag">
                        {t('algo.tie.minSumTag')}
                      </span>
                    )}
                  </>
                }
              />
            ))}
          </ul>
          {contrast ? (
            <p className="mt-3 text-label leading-normal text-ink" data-testid="tie-why-contrast" data-named={Boolean(contrast.who)}>
              {t('algo.tie.contrastLead', { name: contrast.name })}{' '}
              <span className="font-semibold">
                {t(
                  contrast.who
                    ? contrast.extra > 0
                      ? 'algo.tie.contrastWho'
                      : 'algo.tie.contrastWhoNoExtra'
                    : contrast.extra > 0
                      ? 'algo.tie.contrastAnon'
                      : 'algo.tie.contrastAnonNoExtra',
                  {
                    who: contrast.who ?? '',
                    minutes: formatMinutes(contrast.minutes, lang),
                    extra: formatMinutes(contrast.extra, lang),
                  },
                )}
              </span>
            </p>
          ) : (
            <p className="mt-2 text-caption text-ink-2" data-testid="tie-why-same">
              {t('algo.tie.sameAsMinSum')}
            </p>
          )}
        </section>
      )}

      {rows.length > 0 && (
        <section className="mt-4" data-testid="tie-why-members">
          <h4 className={`${h4} break-words`}>{t('algo.tie.membersTitle', { name: recName })}</h4>
          <ul className="mt-2 space-y-2.5">
            {rows.map((r, i) => (
              <BarRow
                key={r.memberId}
                testId="tie-why-row"
                data={{ me: r.me }}
                minutes={r.minutes}
                ratio={barRatio(r.minutes, scale)}
                extra={
                  <span className="num text-caption text-ink-2">
                    <span aria-hidden="true"> · </span>
                    {formatDistance(r.km, lang)}
                  </span>
                }
                label={
                  <>
                    <span className={`break-words ${r.me ? 'font-semibold' : ''}`}>{r.nickname}</span>
                    {r.me && <span className="text-caption text-ink-2">{t('algo.tie.me')}</span>}
                    {i === 0 && rows.length > 1 && (
                      <span className="text-caption text-ink-2" data-testid="tie-why-farthest">
                        {t('algo.tie.farthestTag')}
                      </span>
                    )}
                  </>
                }
              />
            ))}
          </ul>
        </section>
      )}

      {unranked > 0 && (
        <p className="mt-3 text-caption text-ink-2" data-testid="tie-why-unranked">
          {t('algo.tie.unranked', { count: unranked })}
        </p>
      )}
      {s.excluded_member_count > 0 && (
        <p className="mt-2 text-caption text-ink-2" data-testid="tie-why-excluded">
          {t('algo.tie.excluded', { count: s.excluded_member_count })}
        </p>
      )}
    </div>
  );
};

/* ---------- Thẻ của một loại ---------- */

export interface CategoryTieCardProps {
  suggestion: CategoryTieSuggestion;
  isHost: boolean;
  /** Quán mà nút chốt sẽ chốt thật (luồng chốt cũ chỉ giữ 1 quán cho cả phòng). */
  lock: { placeId: string; name: string } | null;
  myMemberId?: string | null;
  confirming?: boolean;
  resolveError?: string | null;
  thumbFor?: (placeId: string) => React.ReactNode;
  onConfirm: (placeId: string) => void;
}

export const CategoryTieCard: React.FC<CategoryTieCardProps> = ({
  suggestion: s,
  isHost,
  lock,
  myMemberId,
  confirming = false,
  resolveError,
  thumbFor,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const catLabel = useCategoryLabel();
  const title = t('algo.tie.cardTitle', { category: catLabel(s.category) });

  if (!hasRecommendation(s)) {
    return (
      <article className="rounded-field bg-surface p-3" data-testid="tie-card" data-category={s.category} data-ready="false">
        <p className="text-caption font-semibold text-ink-2">{title}</p>
        <p className="mt-1 text-label text-ink-2" data-testid="tie-card-no-coords">
          {t('algo.tie.noCoords')}
        </p>
      </article>
    );
  }

  const recId = s.recommended_place_id;
  const name = s.candidates.find((c) => c.place_id === recId)?.name ?? '';
  const delta = tieDelta(s);
  const canLock = isHost && lock?.placeId === recId;

  return (
    <article
      className="relative rounded-field bg-surface p-3"
      data-testid="tie-card"
      data-category={s.category}
      data-ready="true"
      data-source={s.source}
    >
      <p className="text-caption font-semibold text-ink-2">{title}</p>
      <div className="mt-1.5 flex items-start gap-3">
        {thumbFor?.(recId)}
        <div className="min-w-0 flex-1">
          <p className="text-body font-bold leading-snug text-ink" data-testid="tie-recommended">
            {t('algo.tie.suggest', { name })}
          </p>
          {delta && (
            <p className="mt-0.5 text-label tabular-nums text-ink-2" data-testid="tie-delta" data-kind={delta.kind}>
              {delta.kind === 'max'
                ? t('algo.tie.deltaMax', { minutes: formatMinutes(delta.minutes, lang) })
                : t('algo.tie.deltaTotal', { km: formatDistance(delta.km, lang) })}
            </p>
          )}
        </div>
      </div>

      {canLock ? (
        <>
          <Button
            variant="primary"
            size="lg"
            className="mt-3 w-full"
            leftIcon={<Check size={18} weight="bold" aria-hidden="true" />}
            loading={confirming}
            disabled={confirming}
            onClick={() => onConfirm(recId)}
            data-testid="tie-cta"
          >
            {confirming ? t('algo.tie.confirming') : t('algo.tie.confirm', { name })}
          </Button>
          {resolveError && (
            <p role="alert" className="mt-2 text-caption text-danger" data-testid="tie-resolve-error">
              {resolveError}
            </p>
          )}
        </>
      ) : isHost ? (
        lock && (
          <p className="mt-2 text-caption leading-normal text-ink-2" data-testid="tie-lock-elsewhere">
            {t('algo.tie.lockElsewhere', { name: lock.name })}
          </p>
        )
      ) : (
        <p className="mt-2 text-label font-medium text-ink-2" role="status" data-testid="tie-waiting">
          {t('algo.tie.waitHost')}
        </p>
      )}

      <div className="mt-1 flex justify-center">
        <WhyPanel
          title={t('algo.tie.whyTitle', { name })}
          source={s.source}
          // Neo vào thẻ (article `relative`) thay vì vào liên kết: cột danh sách hẹp nên popover 20rem neo ở giữa bị cắt
          className="!static"
          placement="bottom"
          size="lg"
          data-testid="tie-why-panel"
        >
          <TieWhyBody suggestion={s} myMemberId={myMemberId} />
        </WhyPanel>
      </div>
    </article>
  );
};

/* ---------- Phần hiển thị thuần ---------- */

export interface TieSuggestionViewProps {
  suggestion: TieSuggestion | null;
  loading: boolean;
  error: boolean;
  isHost: boolean;
  /** Mình đã chia sẻ vị trí chưa (ẩn lời nhắc + nút chia sẻ). */
  iShared: boolean;
  /** Còn hiện lời nhắc chia sẻ vị trí (nhắc một lần, nhớ theo người xem). */
  showNudge: boolean;
  /** Quán mà nút chốt sẽ chốt thật (`lockTarget`); null = không thẻ nào có nút. */
  lock?: { placeId: string; name: string } | null;
  myMemberId?: string | null;
  confirming?: boolean;
  resolveError?: string | null;
  /** Ảnh nhỏ của quán đề xuất (do thẻ cha cấp; thiếu thì không có ảnh). */
  thumbFor?: (placeId: string) => React.ReactNode;
  onConfirm: (placeId: string) => void;
  /** "Cách khác" → mở `DecideModal` ở bước chọn kiểu. */
  onOther: () => void;
  onShareOrigin: () => void;
  onRetry: () => void;
  onDismissNudge: () => void;
}

export const TieSuggestionView: React.FC<TieSuggestionViewProps> = ({
  suggestion,
  loading,
  error,
  isHost,
  iShared,
  showNudge,
  lock = null,
  myMemberId,
  confirming = false,
  resolveError,
  thumbFor,
  onConfirm,
  onOther,
  onShareOrigin,
  onRetry,
  onDismissNudge,
}) => {
  const { t } = useTranslation();

  const otherBtn = isHost ? (
    <button type="button" onClick={onOther} data-testid="tie-change" className={linkBtn}>
      {t('algo.tie.other')}
    </button>
  ) : null;

  // 1. Chưa có gì để hiển thị: đang tải (skeleton) hoặc lỗi
  if (!suggestion) {
    if (error) {
      return (
        <div className="mt-3" data-testid="tie-error">
          <p role="alert" className="text-label text-ink-2">
            {t('algo.tie.error')}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <button type="button" onClick={onRetry} data-testid="tie-retry" className={linkBtn}>
              {t('algo.tie.retry')}
            </button>
            {otherBtn}
          </div>
        </div>
      );
    }
    return (
      <div className="mt-3" role="status" aria-busy="true" aria-label={t('algo.tie.loading')} data-testid="tie-loading">
        <div aria-hidden="true" className="space-y-2">
          <div className="h-5 w-3/5 animate-pulse rounded-field bg-surface-2" />
          <div className="h-4 w-4/5 animate-pulse rounded-field bg-surface-2" />
        </div>
        <span className="sr-only">{t('algo.tie.loading')}</span>
        <div className="mt-1 flex justify-center">{otherBtn}</div>
      </div>
    );
  }

  const shareBtn = (
    <Button
      variant="primary"
      size="md"
      leftIcon={<MapPin size={16} aria-hidden="true" />}
      onClick={onShareOrigin}
      data-testid="tie-share-origin"
    >
      {t('algo.tie.shareOrigin')}
    </Button>
  );

  // 2. Không tính được: không còn hoà / chưa ai có vị trí / quán thiếu toạ độ
  const ready = suggestion.suggestions.some((s) => hasRecommendation(s));
  if (!suggestion.available || !ready) {
    const reason = suggestion.reason ?? (suggestion.suggestions.length === 0 ? 'NO_TIE' : 'NO_PLACE_COORDS');
    const textKey =
      reason === 'NO_ORIGINS' ? 'algo.tie.noOrigins' : reason === 'NO_PLACE_COORDS' ? 'algo.tie.noCoords' : 'algo.tie.noTie';
    const testId = reason === 'NO_ORIGINS' ? 'tie-no-origins' : reason === 'NO_PLACE_COORDS' ? 'tie-no-coords' : 'tie-no-tie';
    return (
      <div className="mt-3" data-testid="tie-unavailable" data-reason={reason}>
        <p className="text-label text-ink-2" data-testid={testId}>
          {t(textKey)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {reason === 'NO_ORIGINS' && !iShared && shareBtn}
          {otherBtn}
        </div>
      </div>
    );
  }

  // 3. Có đề xuất: mỗi loại một thẻ (PLAN gđ7 §5.1)
  const nudge = !iShared && showNudge;
  return (
    <div className="mt-3 space-y-2" data-testid="tie-suggestion" aria-busy={loading}>
      {suggestion.suggestions.map((s) => (
        <CategoryTieCard
          key={s.category}
          suggestion={s}
          isHost={isHost}
          lock={lock}
          myMemberId={myMemberId}
          confirming={confirming}
          resolveError={resolveError}
          thumbFor={thumbFor}
          onConfirm={onConfirm}
        />
      ))}

      {nudge && (
        <div className="rounded-field border border-line bg-surface p-3" data-testid="tie-nudge">
          <p className="text-label text-ink">{t('algo.tie.nudge')}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Button
              variant="secondary"
              size="md"
              leftIcon={<MapPin size={16} aria-hidden="true" />}
              onClick={onShareOrigin}
              data-testid="tie-nudge-action"
            >
              {t('algo.tie.nudgeAction')}
            </Button>
            <button
              type="button"
              onClick={onDismissNudge}
              data-testid="tie-nudge-dismiss"
              className="min-h-11 px-3 text-label font-semibold text-ink-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
            >
              {t('algo.tie.nudgeLater')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-caption text-ink-2" data-testid="tie-refresh-error">
          {t('algo.tie.error')}{' '}
          <button type="button" onClick={onRetry} className="font-semibold text-accent-text underline">
            {t('algo.tie.retry')}
          </button>
        </p>
      )}
      {otherBtn && <div className="flex justify-center">{otherBtn}</div>}
    </div>
  );
};

/* ---------- Nối store + API ---------- */

const NUDGE_KEY = (roomId: string) => `didau.tieNudge.${roomId}`;

function readNudgeSeen(roomId: string): boolean {
  try {
    return localStorage.getItem(NUDGE_KEY(roomId)) === '1';
  } catch {
    return false;
  }
}

export interface TieSuggestionCardProps {
  roomId?: string;
  /** Ghi đè nguồn dữ liệu (test, vì SSR đọc store ở trạng thái đầu). */
  source?: Partial<
    Pick<TieSuggestionViewProps, 'suggestion' | 'loading' | 'error' | 'isHost' | 'iShared' | 'showNudge' | 'lock'>
  >;
  onOther: () => void;
  thumbFor?: (placeId: string) => React.ReactNode;
}

export const TieSuggestionCard: React.FC<TieSuggestionCardProps> = ({ roomId: propRoomId, source, onOther, thumbFor }) => {
  const { t } = useTranslation();
  const room = useRoomStore((s) => s.room);
  const members = useRoomStore((s) => s.members);
  const me = useRoomStore((s) => s.currentMember);
  const places = usePlaceStore((s) => s.places);
  const storeSuggestion = useAlgoStore((s) => s.tieSuggestion);
  const storeLoading = useAlgoStore((s) => s.tieLoading);
  const storeError = useAlgoStore((s) => s.tieError);
  const fetchTie = useAlgoStore((s) => s.fetchTieSuggestion);
  const roomId = propRoomId ?? room?.id ?? '';

  const [originOpen, setOriginOpen] = useState(false);
  const [nudgeSeen, setNudgeSeen] = useState(() => (roomId ? readNudgeSeen(roomId) : false));
  const [confirming, setConfirming] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Tải đề xuất khi vào giai đoạn hoà và mỗi khi dữ liệu liên quan đổi; gộp các thay đổi dồn dập, giữ bản cũ khi chờ
  const key = useMemo(() => tieRefreshKey(places, members, room, me), [places, members, room, me]);
  const first = useRef(true);
  useEffect(() => {
    if (!roomId) return;
    const timer = setTimeout(() => void fetchTie(roomId), first.current ? 0 : 300);
    first.current = false;
    return () => clearTimeout(timer);
  }, [roomId, key, fetchTie]);

  const suggestion = source?.suggestion !== undefined ? source.suggestion : storeSuggestion;
  const isHost = source?.isHost ?? me?.role === 'HOST';
  const iShared = source?.iShared ?? originStatus(me) === 'shared';
  const lock = useMemo(
    () => (source?.lock !== undefined ? source.lock : lockTarget(places, suggestion?.suggestions ?? [])),
    [source?.lock, places, suggestion],
  );

  const dismissNudge = () => {
    setNudgeSeen(true);
    try {
      localStorage.setItem(NUDGE_KEY(roomId), '1');
    } catch {
      // chế độ riêng tư: chỉ nhớ trong phiên
    }
  };

  const confirm = async () => {
    if (confirming || !roomId) return;
    setConfirming(true);
    setResolveError(null);
    try {
      // Backend tính lại Ψ và chốt quán đứng đầu — không gửi số nào từ client
      await usePlaceStore.getState().resolveVoting(roomId, TIE_RESOLVE_PAYLOAD);
      toast.success(t('tiebreak.success'));
    } catch (err: unknown) {
      setResolveError(describeApiError(err, t, 'VOTE_FAILED'));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <TieSuggestionView
        suggestion={suggestion}
        loading={source?.loading ?? storeLoading}
        error={source?.error ?? storeError}
        isHost={isHost}
        iShared={iShared}
        showNudge={source?.showNudge ?? !nudgeSeen}
        lock={lock}
        myMemberId={me?.id ?? null}
        confirming={confirming}
        resolveError={resolveError}
        thumbFor={thumbFor}
        onConfirm={() => void confirm()}
        onOther={onOther}
        onShareOrigin={() => setOriginOpen(true)}
        onRetry={() => void fetchTie(roomId)}
        onDismissNudge={dismissNudge}
      />
      {room && (
        <OriginSetting
          room={room}
          isOpen={originOpen}
          onClose={() => {
            setOriginOpen(false);
            // Đã mở bảng chia sẻ thì coi như đã được nhắc
            if (!nudgeSeen) dismissNudge();
          }}
        />
      )}
    </>
  );
};
