// Đề xuất hoà phiếu OMP (CR-15, T-96; PLAN gđ7 §5). Nằm trong `TieBlock`. Không có gì tự động (quyết định 8):
// mỗi loại đang hoà một thẻ "Chọn X sẽ tốt hơn · <con số>", chỉ host bấm chốt; ai muốn hiểu thì mở "Vì sao?".
//  - `TieWhyBody`: nội dung "Vì sao?" — bảng từng người (đi + về, km, tính nặng), so với quán cùng hoà, không chữ Ψ.
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
  buildCompareRows,
  buildWhyRows,
  farthestWeight,
  formatMinutes,
  formatWeight,
  hasRecommendation,
  lockTarget,
  tieDelta,
  tieRefreshKey,
  whyRuleKey,
} from './tieSuggestionLogic';

const linkBtn =
  'min-h-11 px-3 text-label font-semibold text-accent-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text';

function useCategoryLabel() {
  const { t } = useTranslation();
  return (c: string) => t((CATEGORY_METADATA[c as keyof typeof CATEGORY_METADATA] ?? CATEGORY_METADATA.OTHER).labelKey);
}

/* ---------- "Vì sao?" ---------- */

export const TieWhyBody: React.FC<{ suggestion: CategoryTieSuggestion; myMemberId?: string | null }> = ({
  suggestion: s,
  myMemberId,
}) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const rows = buildWhyRows(s, myMemberId);
  const { rows: compare, unranked } = buildCompareRows(s);
  const recName = s.candidates.find((c) => c.place_id === s.recommended_place_id)?.name ?? '';
  const th = 'py-1.5 pr-2 text-left font-semibold text-ink-2';
  const td = 'py-1.5 pr-2 tabular-nums text-ink';

  return (
    <div data-testid="tie-why">
      <p className="text-label leading-normal text-ink-2" data-testid="tie-why-rule">
        {s.members.length > 1
          ? (() => {
              const { key, k } = whyRuleKey(s, lang);
              return t(key, { weight: formatWeight(farthestWeight(s), lang), k });
            })()
          : t('algo.tie.whyRuleOne')}
      </p>
      {rows.length > 0 && (
        <div className="-mx-1 mt-2 overflow-x-auto px-1" data-testid="tie-why-scroll">
          <table className="w-full border-collapse text-caption" aria-label={t('algo.tie.tableLabel', { name: recName })}>
            <thead>
              <tr>
                <th scope="col" className={th}>{t('algo.tie.colMember')}</th>
                <th scope="col" className={th}>{t('algo.tie.colTrip')}</th>
                <th scope="col" className={th}>{t('algo.tie.colKm')}</th>
                <th scope="col" className={`${th} pr-0`}>{t('algo.tie.colWeight')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.memberId} className="border-t border-line" data-testid="tie-why-row" data-me={r.me}>
                  <th scope="row" className={`py-1.5 pr-2 text-left text-ink ${r.me ? 'font-semibold' : 'font-normal'}`}>
                    {r.nickname}
                    {r.me && <span className="ml-1 font-normal text-ink-2">{t('algo.tie.me')}</span>}
                  </th>
                  <td className={td}>{formatMinutes(r.minutes, lang)}</td>
                  <td className={td}>{formatDistance(r.km, lang)}</td>
                  <td className={`${td} pr-0 text-ink-2`}>{formatWeight(r.weight, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {compare.length > 1 && (
        <div className="mt-3" data-testid="tie-why-compare">
          <p className="text-caption font-semibold text-ink-2">{t('algo.tie.compareTitle')}</p>
          <ul className="mt-1 space-y-1">
            {compare.map((c) => (
              <li
                key={c.placeId}
                data-testid="tie-why-compare-row"
                data-recommended={c.recommended}
                className={`flex flex-wrap items-baseline gap-x-2 rounded-field px-2 py-1 text-caption ${c.recommended ? 'bg-accent-soft' : ''}`}
              >
                <span className="font-semibold text-ink">{c.name}</span>
                {c.recommended && (
                  <span className="inline-flex items-center gap-1 text-accent-text">
                    <Check size={12} weight="bold" aria-hidden="true" />
                    {t('algo.tie.recommended')}
                  </span>
                )}
                <span className="tabular-nums text-ink-2">
                  {t('algo.tie.compareRow', { max: formatMinutes(c.maxMin, lang), km: formatDistance(c.totalKm, lang) })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {unranked > 0 && (
        <p className="mt-2 text-caption text-ink-2" data-testid="tie-why-unranked">
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
