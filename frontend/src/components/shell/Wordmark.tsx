import React from 'react';
import '@fontsource/bricolage-grotesque/latin-800.css';

/** Tên thương hiệu cố định (không dịch): nhãn cho trình đọc màn hình của logo chữ. */
export const BRAND_NAME = 'Hangoutplanner';

export interface WordmarkProps {
  /**
   * 'full': logo chữ C "Hai tầng" (`Hangout` to + `PLANNER` giãn chữ, coral).
   * 'mark': ô vuông bo góc nền tối, chữ `H` + chấm coral — cho chỗ hẹp (thanh trên trong phòng).
   */
  variant?: 'full' | 'mark';
  /** Cỡ chữ dòng `Hangout` (px) với 'full'; cạnh ô vuông (px) với 'mark'. */
  size?: number;
  /**
   * Màu CSS viết thẳng (dùng trong thẻ PNG, nơi palette đổi độc lập với trang).
   * Bỏ trống thì lấy token trang: `text-ink` / `text-accent-text`.
   */
  inkColor?: string;
  accentColor?: string;
  className?: string;
}

const DISPLAY_FONT = "'Bricolage Grotesque', 'Be Vietnam Pro', system-ui, sans-serif";
const BODY_FONT = "'Be Vietnam Pro', system-ui, sans-serif";

/** Logo chữ Hangoutplanner (quyết định 19, PLAN gđ7). Hai dòng chữ `aria-hidden`, phần tử ngoài là `role="img"`. */
export const Wordmark: React.FC<WordmarkProps> = ({
  variant = 'full',
  size,
  inkColor,
  accentColor,
  className = '',
}) => {
  if (variant === 'mark') {
    const side = size ?? 32;
    return (
      <span
        role="img"
        aria-label={BRAND_NAME}
        className={`inline-flex shrink-0 items-center justify-center rounded-[28%] bg-[rgb(var(--brand-mark-bg))] ring-1 ring-inset ring-[rgb(var(--brand-mark-ink)/0.2)] ${className}`}
        style={{ width: side, height: side }}
      >
        <span
          aria-hidden="true"
          className="text-[rgb(var(--brand-mark-ink))]"
          style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: side * 0.62, lineHeight: 1, letterSpacing: '-0.02em' }}
        >
          H<span className="text-[rgb(var(--brand-mark-dot))]">.</span>
        </span>
      </span>
    );
  }

  const top = size ?? 28;
  // Khoảng cách hai dòng ≈ 6px ở cỡ 44px → tỉ lệ theo cỡ chữ.
  const gap = Math.round(((top * 6) / 44) * 10) / 10;
  return (
    <span
      role="img"
      aria-label={BRAND_NAME}
      className={`inline-flex flex-col items-start ${className}`}
      style={{ gap }}
    >
      <span
        aria-hidden="true"
        className={inkColor ? undefined : 'text-ink'}
        style={{
          fontFamily: DISPLAY_FONT,
          fontWeight: 800,
          fontSize: top,
          lineHeight: 0.9,
          letterSpacing: '-0.025em',
          color: inkColor,
        }}
      >
        Hangout
      </span>
      <span
        aria-hidden="true"
        className={accentColor ? undefined : 'text-accent-text'}
        style={{
          fontFamily: BODY_FONT,
          fontWeight: 700,
          fontSize: Math.round((top / 3) * 10) / 10,
          lineHeight: 1,
          letterSpacing: '0.42em',
          // Bù khoảng giãn sau chữ cuối để khối chữ không lệch phải.
          marginRight: '-0.42em',
          color: accentColor,
        }}
      >
        PLANNER
      </span>
    </span>
  );
};
