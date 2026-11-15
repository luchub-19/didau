import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Member, Place, Poi, Room } from '../../types';
import { useMapStore } from '../../store/useMapStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import { useRoomStore } from '../../store/useRoomStore';
import { searchCenter } from '../../room/origin';
import { describeApiError } from '../../i18n/serverText';
import { MapSearchBox } from '../map/MapSearchBox';
import { currentMapCenter, flyToPlace } from '../map/flyToPlace';
import { toast } from '../ui';
import { getMotionTier } from '../../motion/useMotionTier';
import { duration } from '../../motion/tokens';
import { railOrigin, type DiscoveryItem } from '../../room/discovery';
import { parseLimitError, placeQuota } from '../../room/placeLimit';
import { GroupCenterWidget } from '../algo/GroupCenterWidget';
import { useWorkspaceLayout } from '../shell/workspace';
import { DiscoveryRails } from './DiscoveryRails';

export interface GatherPanelProps {
  room: Room;
  places: Place[];
  members: Member[];
  currentMemberId?: string;
  isHost: boolean;
  /** Mở quán đã trong danh sách (thẻ ở dải "Nhóm đang để ý"). */
  onOpenPlace: (place: Place) => void;
  /** Thêm quán tự nhập (form thủ công). */
  onOpenAddModal: () => void;
  /** Host đặt điểm hẹn (PATCH phòng). */
  onOriginChange?: (lat: number, lng: number) => void;
  /** Danh sách quán của nhóm (PlaceList); thiếu hoặc rỗng thì chỉ có ô trống. */
  tray?: React.ReactNode;
  /** `column`: cột trái giai đoạn ①, có tiêu đề lớn; `sheet`: bản mở lại từ "Thêm quán khác" (giai đoạn ② trở đi). */
  variant?: 'column' | 'sheet';
  /** Gọi sau khi bấm thẻ/kết quả để mở trang chi tiết (sheet tự đóng cho thấy bản đồ). */
  onNavigate?: () => void;
  /** Mobile: chuyển sang tab Bản đồ (widget tâm nhóm "Xem quán gần đây"). */
  onSwitchToMap?: () => void;
}

/** Mở xem trước một quán chưa có trong danh sách: nạp POI vào cache bản đồ rồi chọn + bay tới. */
function previewPoi(poi: Poi): void {
  useMapStore.setState((s) => ({
    // Giữ dữ liệu bản đồ đã tải (có giờ mở cửa) nếu có; thiếu thì dùng POI dựng từ bộ tuyển chọn
    poisById: { ...s.poisById, [poi.external_id]: { ...poi, ...s.poisById[poi.external_id] } },
  }));
  useMapStore.getState().selectPoi(poi.external_id);
  flyToPlace(
    { latitude: poi.lat, longitude: poi.lng },
    {
      zoom: 16,
      pitch: 0,
      bearingDelta: 0,
      durationMs: getMotionTier() === 'static' ? 0 : duration('fly'),
      offsetY: 0,
    },
  );
}

/**
 * Giai đoạn ① "Tối nay đi đâu?" (DESIGN gđ5 §3, §7): ô tìm kiếm lớn · 4 dải gợi ý · khay danh sách của nhóm.
 * Mọi thẻ mở trang chi tiết bản xem trước (thanh đáy "Thêm vào danh sách"); nút ＋ trên thẻ thêm luôn một chạm.
 */
export const GatherPanel: React.FC<GatherPanelProps> = ({
  room,
  places,
  members,
  currentMemberId,
  isHost,
  onOpenPlace,
  onOpenAddModal,
  onOriginChange,
  tray,
  variant = 'column',
  onNavigate,
  onSwitchToMap,
}) => {
  const { t } = useTranslation();
  const searchRef = useRef<HTMLInputElement>(null);
  const [addingKeys, setAddingKeys] = useState<ReadonlySet<string>>(new Set());
  const { origin } = railOrigin(room);
  const layout = useWorkspaceLayout();
  // CR-14: hạn mức đề xuất của mình
  const quota = placeQuota(room, places, currentMemberId);

  // CR-18: nơi xuất phát của mình → điểm hẹn → tâm bản đồ → tâm thành phố
  const getCenter = useCallback(
    () => searchCenter(room, useRoomStore.getState().currentMember, currentMapCenter() ?? origin),
    [room, origin],
  );

  const openPoi = (poi: Poi) => {
    previewPoi(poi);
    onNavigate?.();
  };

  const addItem = async (item: DiscoveryItem) => {
    if (addingKeys.has(item.key)) return;
    if (quota.reached) {
      toast.error(t('algo.limit.reached', { limit: quota.limit }));
      return;
    }
    setAddingKeys((s) => new Set(s).add(item.key));
    try {
      const { addPlace, addPlaceFromPoi } = usePlaceStore.getState();
      if (item.priceVnd) {
        // Mang theo giá tuyển chọn để ngân sách (T-73) tính được ngay; payload giống addPlaceFromPoi
        const poi = item.poi;
        await addPlace(room.id, {
          name: poi.name,
          address: poi.address ?? undefined,
          latitude: poi.lat,
          longitude: poi.lng,
          category: poi.category,
          source: 'OSM',
          external_id: poi.external_id,
          cuisine: poi.cuisine ?? undefined,
          opening_hours_raw: poi.opening_hours_raw ?? undefined,
          open_minute: poi.open_minute ?? undefined,
          close_minute: poi.close_minute ?? undefined,
          estimated_cost: item.priceVnd,
          coords_source: 'osm',
        }).catch(async (err: unknown) => {
          // Đã có (người khác thêm trước): để addPlaceFromPoi nhận lại quán cũ
          if ((err as { code?: string })?.code === 'PLACE_ALREADY_ADDED') await addPlaceFromPoi(room.id, poi);
          else throw err;
        });
      } else {
        await addPlaceFromPoi(room.id, item.poi);
      }
    } catch (err: unknown) {
      // 409 PLACE_LIMIT_REACHED: danh sách ở máy này đã cũ → tải lại để nút khoá đúng
      if (parseLimitError(err)) void usePlaceStore.getState().fetchPlaces(room.id).catch(() => undefined);
      toast.error(describeApiError(err, t, 'ADD_PLACE_FAILED'));
    } finally {
      setAddingKeys((s) => {
        const next = new Set(s);
        next.delete(item.key);
        return next;
      });
    }
  };

  const setOriginHere = () => {
    const c = currentMapCenter();
    if (c && onOriginChange) onOriginChange(c.lat, c.lng);
    else toast.error(t('discovery.mapNotReady'));
  };

  const isColumn = variant === 'column';
  const n = places.length;

  return (
    <div className="flex flex-col gap-6" data-testid="gather-panel" data-variant={variant}>
      <header>
        {isColumn && (
          <>
            <h2 className="text-[26px] font-bold leading-8 text-ink">{t('discovery.title')}</h2>
            <p className="mt-1 text-[14px] text-ink-2">{t('discovery.desc')}</p>
          </>
        )}
        <MapSearchBox
          size="large"
          inputRef={searchRef}
          getCenter={getCenter}
          city={room.city}
          onPick={openPoi}
          className={isColumn ? 'mt-4' : ''}
        />
        {quota.limit !== null && (
          <p
            className={`mt-2 text-caption ${quota.reached ? 'text-ink' : 'text-ink-2'}`}
            data-testid="quota-line"
            data-reached={quota.reached}
            role="status"
          >
            {quota.reached
              ? t('algo.limit.reached', { limit: quota.limit })
              : t('algo.limit.status', { used: quota.used, limit: quota.limit })}
          </p>
        )}
        {/* Mobile: chip tâm nhóm trên đỉnh tab Khám phá, mở rộng thành Sheet */}
        {layout === 'mobile' && (
          <GroupCenterWidget variant="inline" className="mt-3" onShowOnMap={onSwitchToMap} />
        )}
      </header>

      <DiscoveryRails
        room={room}
        places={places}
        members={members}
        currentMemberId={currentMemberId}
        isHost={isHost}
        addingKeys={addingKeys}
        onAddItem={(it) => void addItem(it)}
        onOpenItem={(it) => openPoi(it.poi)}
        onOpenPlace={(p) => {
          onOpenPlace(p);
          onNavigate?.();
        }}
        onSetOrigin={onOriginChange ? setOriginHere : undefined}
        quota={quota}
      />

      {isColumn && (
        <section aria-label={t('discovery.tray.title', { count: n })} data-testid="gather-tray">
          <h3 className="text-[15px] font-semibold text-ink-2">{t('discovery.tray.title', { count: n })}</h3>
          {n > 0 && tray && <div className="mt-2.5">{tray}</div>}
          {n < 2 && (
            <button
              type="button"
              onClick={() => searchRef.current?.focus()}
              data-testid="tray-slot"
              className="mt-2.5 flex min-h-[72px] w-full items-center justify-center gap-2 rounded-card border-2 border-dashed border-line text-label font-semibold text-ink-2 transition-colors hover:border-accent/50 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
            >
              {n === 0 ? t('discovery.tray.slotFirst') : t('discovery.tray.slotNth', { n: n + 1 })}
            </button>
          )}
        </section>
      )}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onOpenAddModal}
          disabled={quota.reached}
          className="min-h-[44px] rounded-field px-3 text-label font-semibold text-accent-text underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text disabled:cursor-not-allowed disabled:text-ink-3 disabled:no-underline"
        >
          {t('discovery.manual')}
        </button>
      </div>
    </div>
  );
};
