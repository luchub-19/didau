// Modal "Xuất kế hoạch" (DESIGN gđ6 §5): tab Ảnh (thẻ PNG) · tab Văn bản (emoji) + hàng chung .ics / gửi link.
// Chunk lười: chỉ tải khi bấm nút ở chân cột Kế hoạch. Lỗi dựng ảnh chỉ làm tab Ảnh báo lỗi, các dạng khác vẫn dùng được.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Member, Place, Room, ScheduleItem } from '../../types';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Segmented';
import { Sheet } from '../../components/ui/Sheet';
import { Skeleton } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/toastStore';
import { CalendarBlank, Copy, ShareNetwork } from '../../components/ui/Icon';
import { buildInviteUrl, copyText, shareRoom } from '../../components/room/shareRoom';
import { useLanguage } from '../../i18n/useLanguage';
import { curatedPhotos, findCurated, loadCurated } from '../../room/curated';
import { buildScheduleIcs, downloadIcs, icsFileName, type IcsLeg } from '../reveal/actions';
import { TripCard, type CardPalette } from './TripCard';
import { cardFileName, renderCardPng } from './exportCard';
import { buildPlanText, legLine, sortPlanItems } from './planText';
import type { PlanFeasibility, PlanLeg } from './planText';

export interface ExportPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room;
  items: readonly ScheduleItem[];
  places: readonly Place[];
  members: readonly Member[];
  /** Số liệu ALGO-03 (T-90 nối); thiếu thì bỏ dòng 🛵/💡 và dòng chặng trong `.ics`. */
  legs?: readonly PlanLeg[];
  feasibility?: PlanFeasibility | null;
}

// Hằng số rỗng: giá trị mặc định `[]` mới mỗi lần render sẽ làm effect dựng ảnh chạy lại vô hạn
const NO_LEGS: readonly PlanLeg[] = [];

type Tab = 'image' | 'text';
type RenderState = 'rendering' | 'ready' | 'error';

/** Nhận dạng được vì sao `navigator.share` không dùng được: cần tệp nên phải kiểm với đúng tệp sắp chia sẻ. */
function canShareFile(file: File | null): boolean {
  if (!file || typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

const canCopyImage = () =>
  typeof navigator !== 'undefined' && !!navigator.clipboard && typeof ClipboardItem !== 'undefined';

export const ExportPlanModal: React.FC<ExportPlanModalProps> = ({
  isOpen,
  onClose,
  room,
  items,
  places,
  members,
  legs = NO_LEGS,
  feasibility = null,
}) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [tab, setTab] = useState<Tab>('image');
  const [palette, setPalette] = useState<CardPalette>('light');
  const [state, setState] = useState<RenderState>('rendering');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const url = buildInviteUrl(room.id, room.code);
  const sorted = useMemo(() => sortPlanItems(items), [items]);

  // Ảnh tuyển chọn cho điểm đầu (nếu quán khớp bộ tuyển chọn)
  const firstPlace = places.find((p) => p.id === sorted[0]?.place_id);
  useEffect(() => {
    if (!isOpen || !firstPlace) {
      setPhoto(null);
      return;
    }
    let alive = true;
    loadCurated()
      .then((data) => {
        if (!alive) return;
        const entry = findCurated(firstPlace, data);
        const cover = entry ? curatedPhotos(entry, data)[0] : undefined;
        setPhoto(cover?.thumb ?? null);
      })
      .catch(() => alive && setPhoto(null));
    return () => {
      alive = false;
    };
  }, [isOpen, firstPlace]);

  // Dựng lại PNG khi mở, đổi palette/ngôn ngữ/dữ liệu. Chờ 120 ms để gộp các lần đổi liên tiếp (vd. WS đẩy cập nhật).
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    setState('rendering');
    const timer = setTimeout(() => {
      const node = cardRef.current;
      if (!node) return;
      renderCardPng(node)
        .then((png) => {
          if (!alive) return;
          setBlob(png);
          setState('ready');
        })
        .catch((err) => {
          if (!alive) return;
          console.error('Failed to render trip card:', err);
          setBlob(null);
          setState('error');
          toast.error(t('export.renderFailed'));
        });
    }, 120);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [isOpen, palette, lang, items, members, places, photo, legs, feasibility, room.title, t]);

  useEffect(() => {
    if (!blob) {
      setPreviewUrl(null);
      return;
    }
    const href = URL.createObjectURL(blob);
    setPreviewUrl(href);
    return () => URL.revokeObjectURL(href);
  }, [blob]);

  const fileName = cardFileName(room.code);
  const file = useMemo(() => (blob ? new File([blob], fileName, { type: 'image/png' }) : null), [blob, fileName]);

  const planText = useMemo(
    () => buildPlanText({ room, items, members, url, lang, t, legs, feasibility }),
    [room, items, members, url, lang, t, legs, feasibility],
  );

  const handleDownload = () => {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleShareImage = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: room.title });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast.error(t('export.shareFailed'));
    }
  };

  const handleCopyImage = async () => {
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast.success(t('export.imageCopied'));
    } catch {
      toast.error(t('export.copyImageFailed'));
    }
  };

  const handleIcs = useCallback(() => {
    const nameOf = new Map(sorted.map((i) => [i.id, i.place_name]));
    const icsLegs: IcsLeg[] = legs.map((l) => ({
      fromItemId: l.fromId,
      text: t('export.ics.leg', { to: nameOf.get(l.toId) ?? '', leg: legLine(l, lang, t) }),
    }));
    downloadIcs(buildScheduleIcs({ room, items, places, legs: icsLegs, url }), icsFileName(room.title));
  }, [sorted, legs, t, lang, room, items, places, url]);

  const handleSendLink = () => void shareRoom({ roomId: room.id, code: room.code, title: room.title, t });

  const handleCopyText = () => void copyText(planText, t('export.textCopied'), t('invite.copyFailed'));

  return (
    <>
      <Sheet isOpen={isOpen} onClose={onClose} title={t('export.title')} className="md:max-w-xl">
        <div className="space-y-4 pb-4" data-testid="export-modal">
          <Segmented<Tab>
            aria-label={t('export.title')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'image', label: t('export.tab.image') },
              { value: 'text', label: t('export.tab.text') },
            ]}
          />

          {tab === 'image' ? (
            <div className="space-y-3" role="tabpanel">
              <Segmented<CardPalette>
                size="sm"
                aria-label={t('export.palette.label')}
                value={palette}
                onChange={setPalette}
                options={[
                  { value: 'light', label: t('export.palette.light') },
                  { value: 'dark', label: t('export.palette.dark') },
                ]}
              />
              {/* Khung cố định tỉ lệ 4:5 → dựng xong không nhảy bố cục */}
              <div
                className="relative mx-auto overflow-hidden rounded-card bg-surface-2"
                style={{ aspectRatio: '4 / 5', height: 'min(44vh, 540px)' }}
                data-testid="export-preview"
              >
                {previewUrl && state !== 'rendering' ? (
                  <img src={previewUrl} alt={t('export.previewAlt')} className="h-full w-full object-contain" />
                ) : state === 'error' ? (
                  <p className="flex h-full items-center justify-center p-6 text-center text-label text-ink-2" role="alert">
                    {t('export.renderFailed')}
                  </p>
                ) : (
                  <Skeleton className="h-full w-full" data-testid="export-skeleton" />
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={handleDownload} disabled={state !== 'ready'} data-testid="export-download">
                  {t('export.download')}
                </Button>
                {state === 'ready' && canShareFile(file) && (
                  <Button variant="secondary" onClick={() => void handleShareImage()} leftIcon={<ShareNetwork size={16} />} data-testid="export-share">
                    {t('export.share')}
                  </Button>
                )}
                {canCopyImage() && (
                  <Button variant="secondary" onClick={() => void handleCopyImage()} disabled={state !== 'ready'} leftIcon={<Copy size={16} />} data-testid="export-copy-image">
                    {t('export.copyImage')}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3" role="tabpanel">
              <pre
                data-testid="export-text"
                className="max-h-[46vh] overflow-auto whitespace-pre-wrap break-words rounded-card border border-line bg-surface-2 p-4 text-label text-ink"
                style={{ fontFamily: 'inherit' }}
              >
                {planText}
              </pre>
              <Button variant="primary" onClick={handleCopyText} leftIcon={<Copy size={16} />} data-testid="export-copy-text">
                {t('export.copyText')}
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button variant="secondary" onClick={handleIcs} leftIcon={<CalendarBlank size={16} />} data-testid="export-ics">
              {t('export.ics.button')}
            </Button>
            <Button variant="secondary" onClick={handleSendLink} leftIcon={<ShareNetwork size={16} />} data-testid="export-send-link">
              {t('export.sendLink')}
            </Button>
          </div>
        </div>
      </Sheet>
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          // Thẻ thật nằm ngoài màn hình ở kích thước gốc 540×675; người dùng chỉ thấy ảnh PNG đã dựng
          <div aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}>
            <TripCard
              ref={cardRef}
              room={room}
              items={items}
              places={places}
              members={members}
              palette={palette}
              lang={lang}
              photo={photo}
              legs={legs}
              feasibility={feasibility}
            />
          </div>,
          document.body,
        )}
    </>
  );
};
