// Đề xuất hoà phiếu ALGO-02 (DESIGN gđ6 §8 "Thẻ hoà phiếu", ALGORITHMS §4, §7). Nằm trong `TieBlock`.
// Không tự mở modal: đề xuất hiện tại chỗ, host bấm "Chốt" (POST /voting/resolve {TRAVEL_TIME}); số tính ở server.
//  - `TieWhyTable`: bảng thành viên × quán trong "Vì sao?" (cột đề xuất tô nhấn, hàng Tổng/Lâu nhất đậm).
//  - `TieSuggestionView`: phần hiển thị thuần (mọi trạng thái), test bằng markup.
//  - `TieSuggestionCard`: nối store + API; tự làm mới khi vote / vị trí / điểm hẹn đổi, giữ bản cũ tới khi có bản mới.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TieSuggestion } from '../../types';
import { Button, toast } from '../ui';
import { Check, MapPin } from '../ui/Icon';
import { WhyPanel } from './WhyPanel';
import { OriginSetting } from './OriginSetting';
import { describeApiError, errorMessageKey } from '../../i18n/serverText';
import { useLanguage } from '../../i18n/useLanguage';
import { currentMapCenter } from '../map/flyToPlace';
import { originStatus } from '../../room/origin';
import { useAlgoStore } from '../../store/useAlgoStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import { useRoomStore } from '../../store/useRoomStore';
import {
  MAX_OTHER_ROWS,
  TIE_RESOLVE_PAYLOAD,
  buildTieTable,
  formatMinutes,
  hasRecommendation,
  marginKey,
  tieRefreshKey,
} from './tieSuggestionLogic';

/* ---------- Bảng ma trận ---------- */

export const TieWhyTable: React.FC<{ suggestion: TieSuggestion }> = ({ suggestion }) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { columns, rows } = buildTieTable(suggestion);
  const cell = (v: number | null) => (v === null ? t('algo.tie.noValue') : formatMinutes(v, lang));
  const hl = (rec: boolean) => (rec ? 'bg-accent-soft' : '');

  return (
    <div data-testid="tie-why">
      <p className="text-label text-ink-2" data-testid="tie-why-rule">
        {t('algo.tie.whyRule', { threshold: suggestion.threshold_min })}
      </p>
      <div className="-mx-1 mt-2 overflow-x-auto px-1" data-testid="tie-why-scroll">
        <table className="w-full min-w-max border-collapse text-caption" aria-label={t('algo.tie.tableLabel')}>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-[1] bg-surface py-1.5 pr-3 text-left font-semibold text-ink-2">
                {t('algo.tie.colMember')}
              </th>
              {columns.map((c) => (
                <th
                  key={c.placeId}
                  scope="col"
                  data-recommended={c.recommended}
                  className={`max-w-[9rem] px-2 py-1.5 text-left align-bottom font-semibold text-ink ${hl(c.recommended)}`}
                >
                  <span className="line-clamp-2">{c.name}</span>
                  {c.recommended && (
                    <span className="mt-0.5 flex items-center gap-1 text-accent-text">
                      <Check size={12} weight="bold" aria-hidden="true" />
                      {t('algo.tie.recommended')}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.memberId} className="border-t border-line" data-testid="tie-why-row">
                <th scope="row" className="sticky left-0 z-[1] bg-surface py-1.5 pr-3 text-left font-normal text-ink">
                  {r.nickname}
                  {r.meetingPoint && <span className="ml-1 text-ink-2">{t('algo.tie.meetingTag')}</span>}
                </th>
                {r.minutes.map((v, j) => (
                  <td key={columns[j].placeId} className={`px-2 py-1.5 tabular-nums text-ink ${hl(columns[j].recommended)}`}>
                    {cell(v)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t-2 border-line font-bold" data-testid="tie-why-total">
              <th scope="row" className="sticky left-0 z-[1] bg-surface py-1.5 pr-3 text-left font-bold text-ink">
                {t('algo.tie.rowTotal')}
              </th>
              {columns.map((c) => (
                <td key={c.placeId} className={`px-2 py-1.5 tabular-nums text-ink ${hl(c.recommended)}`}>
                  {cell(c.total)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-line font-bold" data-testid="tie-why-max">
              <th scope="row" className="sticky left-0 z-[1] bg-surface py-1.5 pr-3 text-left font-bold text-ink">
                {t('algo.tie.rowMax')}
              </th>
              {columns.map((c) => (
                <td key={c.placeId} className={`px-2 py-1.5 tabular-nums text-ink ${hl(c.recommended)}`}>
                  {cell(c.max)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {suggestion.excluded_member_count > 0 && (
        <p className="mt-2 text-caption text-ink-2" data-testid="tie-why-excluded">
          {t('algo.tie.excluded', { count: suggestion.excluded_member_count })}
        </p>
      )}
    </div>
  );
};

/* ---------- Phần hiển thị thuần ---------- */

export interface TieSuggestionViewProps {
  suggestion: TieSuggestion | null;
  loading: boolean;
  error: boolean;
  isHost: boolean;
  /** Mình đã chia sẻ nơi xuất phát chưa (ẩn lời nhắc + nút chia sẻ). */
  iShared: boolean;
  /** Còn hiện lời nhắc "Thêm nơi xuất phát" (nhắc một lần, nhớ theo người xem). */
  showNudge: boolean;
  confirming?: boolean;
  resolveError?: string | null;
  /** Ảnh nhỏ của quán đề xuất (do thẻ cha cấp; thiếu thì không có ảnh). */
  thumbFor?: (placeId: string) => React.ReactNode;
  onConfirm: (placeId: string) => void;
  /** "Cách khác" → mở `DecideModal` ở bước chọn kiểu. */
  onOther: () => void;
  onShareOrigin: () => void;
  onSetMeeting: () => void;
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
  confirming = false,
  resolveError,
  thumbFor,
  onConfirm,
  onOther,
  onShareOrigin,
  onSetMeeting,
  onRetry,
  onDismissNudge,
}) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();

  const otherBtn = isHost ? (
    <button
      type="button"
      onClick={onOther}
      data-testid="tie-change"
      className="min-h-11 px-3 text-label font-semibold text-accent-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
    >
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
            <button
              type="button"
              onClick={onRetry}
              data-testid="tie-retry"
              className="min-h-11 px-3 text-label font-semibold text-accent-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
            >
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

  // 2. Không tính được: thiếu xuất phát / thiếu toạ độ quán / không còn hoà
  if (!hasRecommendation(suggestion)) {
    const noOrigins = suggestion.reason === 'NO_ORIGINS';
    return (
      <div className="mt-3" data-testid="tie-unavailable" data-reason={suggestion.reason ?? ''}>
        {noOrigins && (
          <p className="text-label text-ink-2" data-testid="tie-no-origins">
            {t('algo.tie.noOrigins')}
          </p>
        )}
        {suggestion.reason === 'NO_PLACE_COORDS' && (
          <p className="text-label text-ink-2" data-testid="tie-no-coords">
            {t('algo.tie.noCoords')}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {noOrigins && !iShared && (
            <Button variant="primary" size="md" leftIcon={<MapPin size={16} aria-hidden="true" />} onClick={onShareOrigin} data-testid="tie-share-origin">
              {t('algo.tie.shareOrigin')}
            </Button>
          )}
          {noOrigins && isHost && (
            <Button variant="secondary" size="md" onClick={onSetMeeting} data-testid="tie-set-meeting">
              {t('algo.tie.setMeeting')}
            </Button>
          )}
          {otherBtn}
        </div>
      </div>
    );
  }

  // 3. Có đề xuất
  const recId = suggestion.recommended_place_id;
  const rec = suggestion.candidates.find((c) => c.place_id === recId);
  const recRank = suggestion.ranking.find((r) => r.place_id === recId);
  const name = rec?.name ?? '';
  const others = [...suggestion.ranking]
    .sort((a, b) => a.rank - b.rank)
    .filter((r) => r.place_id !== recId)
    .map((r) => ({ r, c: suggestion.candidates.find((c) => c.place_id === r.place_id) }))
    .filter((x): x is { r: typeof x.r; c: NonNullable<typeof x.c> } => Boolean(x.c));
  const shownOthers = others.slice(0, MAX_OTHER_ROWS);
  const hiddenOthers = others.length - shownOthers.length;
  const mKey = marginKey(suggestion.margin_vs_second_min);
  const nudge = !iShared && showNudge;

  return (
    <div className="mt-3" data-testid="tie-suggestion" data-estimated={suggestion.estimated} aria-busy={loading}>
      <div className="flex items-start gap-3 rounded-field bg-surface p-3">
        {thumbFor?.(recId)}
        <div className="min-w-0 flex-1">
          <p className="text-body font-bold leading-snug text-ink" data-testid="tie-recommended">
            {t('algo.tie.suggest', { name })}
          </p>
          {recRank && (
            <p className="mt-0.5 text-label text-ink-2" data-testid="tie-summary">
              {t('algo.tie.summary', {
                total: formatMinutes(recRank.total_min, lang),
                max: formatMinutes(recRank.max_min, lang),
              })}
              {mKey === 'marginMore' && suggestion.margin_vs_second_min !== null && (
                <>
                  {' · '}
                  {t('algo.tie.marginMore', { margin: formatMinutes(suggestion.margin_vs_second_min, lang) })}
                </>
              )}
              {mKey === 'marginMax' && (
                <>
                  {' · '}
                  {t('algo.tie.marginMax')}
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {(shownOthers.length > 0 || suggestion.unranked_place_ids.length > 0) && (
        <div className="mt-2" data-testid="tie-others">
          <p className="text-caption font-semibold text-ink-2">{t('algo.tie.others')}</p>
          <ul className="mt-0.5 space-y-0.5">
            {shownOthers.map(({ r, c }) => (
              <li key={r.place_id} className="flex flex-wrap gap-x-2 text-caption text-ink-2" data-testid="tie-other-row">
                <span className="font-medium text-ink">{c.name}</span>
                <span className="tabular-nums">
                  {t('algo.tie.otherRow', { total: formatMinutes(r.total_min, lang), max: formatMinutes(r.max_min, lang) })}
                </span>
              </li>
            ))}
          </ul>
          {hiddenOthers > 0 && (
            <p className="text-caption text-ink-3" data-testid="tie-others-more">
              {t('decide.tie.more', { count: hiddenOthers })}
            </p>
          )}
          {suggestion.unranked_place_ids.length > 0 && (
            <p className="text-caption text-ink-3" data-testid="tie-unranked">
              {t('algo.tie.unranked', { count: suggestion.unranked_place_ids.length })}
            </p>
          )}
        </div>
      )}

      {nudge && (
        <div className="mt-3 rounded-field border border-line bg-surface p-3" data-testid="tie-nudge">
          <p className="text-label text-ink">{t('algo.tie.nudge')}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Button variant="secondary" size="md" leftIcon={<MapPin size={16} aria-hidden="true" />} onClick={onShareOrigin} data-testid="tie-nudge-action">
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

      {isHost ? (
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
      ) : (
        <p className="mt-3 text-label font-medium text-ink-2" role="status" data-testid="tie-waiting">
          {t('algo.tie.waitHost')}
        </p>
      )}
      {resolveError && (
        <p role="alert" className="mt-2 text-caption text-danger" data-testid="tie-resolve-error">
          {resolveError}
        </p>
      )}
      {error && (
        <p className="mt-2 text-caption text-ink-2" data-testid="tie-refresh-error">
          {t('algo.tie.error')}{' '}
          <button type="button" onClick={onRetry} className="font-semibold text-accent-text underline">
            {t('algo.tie.retry')}
          </button>
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
        {otherBtn}
        <WhyPanel
          title={t('algo.tie.whyTitle')}
          source={suggestion.estimated ? 'ESTIMATE' : 'GOOGLE'}
          // Neo vào thẻ (section `relative`) thay vì vào liên kết: cột danh sách hẹp nên popover 20rem neo ở giữa cột bị cắt
          className="!static"
          placement="bottom"
          data-testid="tie-why-panel"
        >
          <TieWhyTable suggestion={suggestion} />
        </WhyPanel>
      </div>
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
  source?: Partial<Pick<TieSuggestionViewProps, 'suggestion' | 'loading' | 'error' | 'isHost' | 'iShared' | 'showNudge'>>;
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

  const isHost = source?.isHost ?? me?.role === 'HOST';
  const iShared = source?.iShared ?? originStatus(me) === 'shared';

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
      // Backend tính lại và chốt quán đứng đầu — không gửi số nào từ client
      await usePlaceStore.getState().resolveVoting(roomId, TIE_RESOLVE_PAYLOAD);
      toast.success(t('tiebreak.success'));
    } catch (err: unknown) {
      setResolveError(describeApiError(err, t, 'VOTE_FAILED'));
    } finally {
      setConfirming(false);
    }
  };

  const setMeeting = async () => {
    const c = currentMapCenter();
    if (!c) {
      toast.error(t('discovery.mapNotReady'));
      return;
    }
    try {
      await useRoomStore.getState().updateRoom(roomId, { origin_lat: c.lat, origin_lng: c.lng });
      toast.success(t('room.originChangeSuccess'));
    } catch (err: unknown) {
      const k = errorMessageKey(err);
      toast.error(k === 'errors.generic.unknown' ? t('room.originChangeError') : describeApiError(err, t));
    }
  };

  return (
    <>
      <TieSuggestionView
        suggestion={source?.suggestion !== undefined ? source.suggestion : storeSuggestion}
        loading={source?.loading ?? storeLoading}
        error={source?.error ?? storeError}
        isHost={isHost}
        iShared={iShared}
        showNudge={source?.showNudge ?? !nudgeSeen}
        confirming={confirming}
        resolveError={resolveError}
        thumbFor={thumbFor}
        onConfirm={() => void confirm()}
        onOther={onOther}
        onShareOrigin={() => setOriginOpen(true)}
        onSetMeeting={() => void setMeeting()}
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
