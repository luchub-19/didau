// Logic thuần của 3 đường CTA trang chủ (Tạo phòng / Nhập mã / Vào lại phòng) và luật hiện nút "Tạo phòng"
// trên thanh đỉnh. Tách khỏi component để test không cần DOM (repo không có jsdom/RTL).
import { useEffect, useState, type RefObject } from 'react';

export interface HomeModalState {
  modal: 'none' | 'create' | 'join';
  /** Mã điền sẵn cho ô Nhập mã ('' = để trống). */
  joinCode: string;
}

export type HomeModalAction =
  | { type: 'create' }
  | { type: 'join' }
  | { type: 'resume'; code: string | null }
  | { type: 'close' };

export const HOME_MODAL_INITIAL: HomeModalState = { modal: 'none', joinCode: '' };

export function homeModalReducer(state: HomeModalState, action: HomeModalAction): HomeModalState {
  switch (action.type) {
    case 'create':
      return { modal: 'create', joinCode: '' };
    case 'join':
      return { modal: 'join', joinCode: '' };
    case 'resume':
      // Không có phòng dở thì không làm gì (link vốn không hiện)
      return action.code ? { modal: 'join', joinCode: action.code } : state;
    case 'close':
      return HOME_MODAL_INITIAL;
    default:
      return state;
  }
}

/**
 * Nút "Tạo phòng" trên thanh đỉnh chỉ hiện khi CTA của hero đã khuất VÀ CTA cuối trang chưa hiện (PLAN §4.1 mục 0),
 * để lúc nào cũng chỉ có một nút Tạo phòng trong tầm mắt.
 */
export function showTopCreate(heroCtaVisible: boolean, endCtaVisible: boolean): boolean {
  return !heroCtaVisible && !endCtaVisible;
}

/**
 * Theo dõi liên tục phần tử có trong màn hình không. Không có IntersectionObserver → coi như đang thấy
 * (nút trên thanh đỉnh giữ ẩn, CTA hero vẫn bấm được).
 */
export function useInView<T extends Element>(ref: RefObject<T>): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) setVisible(last.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return visible;
}

/** `scrollY > threshold` (thanh đỉnh có nền khi đã cuộn). Chỉ đặt state khi giá trị đổi. */
export function useScrolledPast(threshold = 24): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const check = () => setPast(window.scrollY > threshold);
    check();
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, [threshold]);
  return past;
}
