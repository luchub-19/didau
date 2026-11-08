// Trạng thái giao diện thuật toán (T-88): tâm nhóm (ALGO-01) + vòng tròn bán kính + nhãn nơi xuất phát của mình.
// Toạ độ của chính mình nằm ở `useRoomStore.currentMember`; store này KHÔNG giữ toạ độ ai.
import { create } from 'zustand';
import { algoApi } from '../services/api/algoApi';
import type { GroupCenterResponse, GroupCenterUpdatedPayload, ScheduleFeasibility, TieSuggestion } from '../types';

interface AlgoState {
  groupCenter: GroupCenterResponse | null;
  /** Vẽ vòng tròn bán kính quanh tâm nhóm trên bản đồ ("Xem quán gần đây"). */
  showRadius: boolean;
  /** Tên nơi mình chọn khi tìm địa điểm (chỉ trong bộ nhớ; tải lại trang thì hiện "Đã chia sẻ"). */
  originLabel: string | null;
  /** ALGO-02: đề xuất hoà phiếu. Giữ bản cũ tới khi có bản mới (không nhấp nháy khi làm mới). */
  tieSuggestion: TieSuggestion | null;
  tieLoading: boolean;
  tieError: boolean;
  /** ALGO-03: khả thi lịch do backend tính (nguồn thật, có thể là Google). Lỗi → giữ bản cũ, lịch dùng ước lượng. */
  feasibility: ScheduleFeasibility | null;

  fetchGroupCenter: (roomId: string) => Promise<void>;
  /** WS `GROUP_CENTER_UPDATED`: áp phần tóm tắt ngay, rồi tải lại để có danh sách quán gần tâm. */
  applyGroupCenterUpdate: (roomId: string, payload: GroupCenterUpdatedPayload) => void;
  fetchTieSuggestion: (roomId: string) => Promise<void>;
  fetchFeasibility: (roomId: string) => Promise<void>;
  setShowRadius: (show: boolean) => void;
  setOriginLabel: (label: string | null) => void;
  reset: () => void;
}

// Chỉ nhận phản hồi của lần gọi mới nhất (gói trễ không đè dữ liệu mới)
let fetchSeq = 0;
let tieSeq = 0;
let feasSeq = 0;

export const useAlgoStore = create<AlgoState>((set, get) => ({
  groupCenter: null,
  showRadius: false,
  originLabel: null,
  tieSuggestion: null,
  tieLoading: false,
  tieError: false,
  feasibility: null,

  fetchGroupCenter: async (roomId) => {
    const seq = ++fetchSeq;
    try {
      const data = await algoApi.getGroupCenter(roomId);
      if (seq !== fetchSeq) return;
      set({ groupCenter: data, showRadius: data.available ? get().showRadius : false });
    } catch {
      // Tâm nhóm là phần phụ: lỗi mạng thì giữ dữ liệu cũ, widget không chen vào bằng thông báo lỗi
    }
  },

  applyGroupCenterUpdate: (roomId, payload) => {
    if (!payload.available || !payload.center) {
      fetchSeq++;
      set({
        groupCenter: { available: false, center: null, area_label: null, member_count: payload.member_count, nearby_pois: [] },
        showRadius: false,
      });
      return;
    }
    const prev = get().groupCenter;
    set({
      groupCenter: {
        available: true,
        center: payload.center,
        area_label: payload.area_label ?? null,
        member_count: payload.member_count,
        nearby_pois: prev?.nearby_pois ?? [],
      },
    });
    void get().fetchGroupCenter(roomId);
  },

  fetchTieSuggestion: async (roomId) => {
    const seq = ++tieSeq;
    set({ tieLoading: true });
    try {
      const data = await algoApi.getTieSuggestion(roomId);
      if (seq !== tieSeq) return;
      set({ tieSuggestion: data, tieLoading: false, tieError: false });
    } catch {
      if (seq !== tieSeq) return;
      // Lỗi: vẫn giữ bản cũ (nếu có); thẻ báo lỗi nhưng "Cách khác" luôn dùng được
      set({ tieLoading: false, tieError: true });
    }
  },

  fetchFeasibility: async (roomId) => {
    const seq = ++feasSeq;
    try {
      const data = await algoApi.getScheduleFeasibility(roomId);
      if (seq !== feasSeq) return;
      set({ feasibility: data });
    } catch {
      // Dải di chuyển vẫn có số ước lượng tại chỗ; không chen thông báo lỗi vào lịch
    }
  },

  setShowRadius: (showRadius) => set({ showRadius }),
  setOriginLabel: (originLabel) => set({ originLabel }),
  reset: () => {
    fetchSeq++;
    tieSeq++;
    feasSeq++;
    set({
      groupCenter: null,
      showRadius: false,
      originLabel: null,
      tieSuggestion: null,
      tieLoading: false,
      tieError: false,
      feasibility: null,
    });
  },
}));
