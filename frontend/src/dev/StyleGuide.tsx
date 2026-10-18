import React, { useState } from 'react';
import {
  BowlFood,
  Coffee,
  GameController,
  Camera,
  Bed,
  ShoppingBag,
  MapPin,
  Clock,
  CurrencyCircleDollar,
  ForkKnife,
  MapTrifold,
  CalendarBlank,
  Users,
  ThumbsUp,
  ThumbsDown,
  CheckCircle,
  WarningCircle,
  XCircle,
  Info,
} from '@phosphor-icons/react';

interface ColorSwatchProps {
  name: string;
  token: string;
  bgClass: string;
  borderClass?: string;
  textClass?: string;
  contrast?: string;
  description?: string;
}

const ColorSwatch: React.FC<ColorSwatchProps> = ({
  name,
  token,
  bgClass,
  borderClass = 'border-line',
  textClass = 'text-ink',
  contrast,
  description,
}) => (
  <div className="flex items-center gap-3 p-2 rounded-field bg-surface border border-line">
    <div
      className={`w-12 h-12 rounded-lg border ${borderClass} ${bgClass} flex-shrink-0 flex items-center justify-center font-bold text-caption ${textClass}`}
    >
      Aa
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm text-ink truncate">{name}</span>
        {contrast && (
          <span className="text-caption font-mono px-1.5 py-0.5 rounded bg-surface-2 text-ink-2">
            {contrast}
          </span>
        )}
      </div>
      <p className="text-caption font-mono text-ink-3 truncate">{token}</p>
      {description && <p className="text-caption text-ink-2 truncate">{description}</p>}
    </div>
  </div>
);

export const StyleGuide: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'places' | 'map' | 'schedule' | 'group'>('places');
  const [selectedCategory, setSelectedCategory] = useState<string>('FOOD');
  const [voteCount, setVoteCount] = useState<number>(5);
  const [userVote, setUserVote] = useState<1 | -1 | 0>(1);

  const categories = [
    {
      id: 'FOOD',
      label: 'Ăn uống',
      icon: BowlFood,
      color: 'text-cat-food',
      bgSoft: 'bg-cat-food-soft',
      contrast: '5.18:1 / 4.88:1',
      token: '--color-cat-food',
    },
    {
      id: 'DRINK',
      label: 'Cà phê & Đồ uống',
      icon: Coffee,
      color: 'text-cat-drink',
      bgSoft: 'bg-cat-drink-soft',
      contrast: '5.48:1 / 5.21:1',
      token: '--color-cat-drink',
    },
    {
      id: 'ENTERTAINMENT',
      label: 'Vui chơi giải trí',
      icon: GameController,
      color: 'text-cat-entertainment',
      bgSoft: 'bg-cat-entertainment-soft',
      contrast: '6.98:1 / 6.51:1',
      token: '--color-cat-entertainment',
    },
    {
      id: 'SIGHTSEEING',
      label: 'Tham quan',
      icon: Camera,
      color: 'text-cat-sightseeing',
      bgSoft: 'bg-cat-sightseeing-soft',
      contrast: '6.70:1 / 6.16:1',
      token: '--color-cat-sightseeing',
    },
    {
      id: 'ACCOMMODATION',
      label: 'Khách sạn / Nghỉ',
      icon: Bed,
      color: 'text-cat-accommodation',
      bgSoft: 'bg-cat-accommodation-soft',
      contrast: '6.29:1 / 5.72:1',
      token: '--color-cat-accommodation',
    },
    {
      id: 'SHOPPING',
      label: 'Mua sắm',
      icon: ShoppingBag,
      color: 'text-cat-shopping',
      bgSoft: 'bg-cat-shopping-soft',
      contrast: '5.47:1 / 5.25:1',
      token: '--color-cat-shopping',
    },
    {
      id: 'OTHER',
      label: 'Khác',
      icon: MapPin,
      color: 'text-cat-other',
      bgSoft: 'bg-cat-other-soft',
      contrast: '7.63:1 / 6.99:1',
      token: '--color-cat-other',
    },
  ];

  return (
    <div className="min-h-screen bg-bg text-ink pb-28 pt-6 px-4 sm:px-8 max-w-5xl mx-auto">
      {/* Header */}
      <header className="mb-8 border-b border-line pb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-3 h-3 rounded-full bg-accent" />
          <span className="text-caption font-semibold text-accent-text">
            Hệ thống thiết kế · Mốc 1
          </span>
        </div>
        <h1 className="text-display font-bold text-ink mb-2">
          Đi Đâu — Bảng phong cách mẫu (Style Guide)
        </h1>
        <p className="text-body text-ink-2 max-w-2xl">
          Trang kiểm tra token màu, font Be Vietnam Pro, độ tương phản WCAG 2.2 AA, 7 icon danh mục Phosphor
          và các khối mẫu cho giai đoạn 3 (T-38).
        </p>
      </header>

      {/* 1. BẢNG MÀU TOKEN */}
      <section className="mb-10">
        <h2 className="text-title font-bold text-ink mb-1">1. Token màu (Color Tokens)</h2>
        <p className="text-caption text-ink-3 mb-4">
          Nền sáng ấm (Stone/Coral). Chữ mực ink trên accent đạt 6.2:1 (cấm chữ trắng trên coral 2.8:1).
        </p>

        <div className="mb-6">
          <h3 className="text-label font-semibold text-ink-2 mb-2">Màu bề mặt & chữ chính</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <ColorSwatch name="Background (bg)" token="--color-bg: #FAFAF9" bgClass="bg-bg" />
            <ColorSwatch name="Surface" token="--color-surface: #FFFFFF" bgClass="bg-surface" />
            <ColorSwatch name="Surface 2" token="--color-surface-2: #F5F5F4" bgClass="bg-surface-2" />
            <ColorSwatch name="Line / Border" token="--color-line: #E7E5E4" bgClass="bg-line" />
            <ColorSwatch name="Ink (Chữ chính)" token="--color-ink: #1C1917" bgClass="bg-ink" textClass="text-surface" contrast="16.7:1" />
            <ColorSwatch name="Ink 2 (Chữ phụ)" token="--color-ink-2: #57534E" bgClass="bg-ink-2" textClass="text-surface" contrast="7.3:1" />
            <ColorSwatch name="Ink 3 (Chú thích/Placeholder)" token="--color-ink-3: #78716C" bgClass="bg-ink-3" textClass="text-surface" contrast="4.8:1" />
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-label font-semibold text-ink-2 mb-2">Màu nhấn Coral (Accent)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <ColorSwatch
              name="Accent (Nút/Pin)"
              token="--color-accent: #FF6B4A"
              bgClass="bg-accent"
              textClass="text-ink"
              contrast="6.2:1 (ink)"
              description="Nút dùng chữ ink"
            />
            <ColorSwatch
              name="Accent Hover"
              token="--color-accent-hover: #F25C3C"
              bgClass="bg-accent-hover"
              textClass="text-ink"
              contrast="5.3:1 (ink)"
            />
            <ColorSwatch
              name="Accent Soft"
              token="--color-accent-soft: #FFF1EC"
              bgClass="bg-accent-soft"
              textClass="text-accent-text"
              description="Nền chip/thẻ chọn"
            />
            <ColorSwatch
              name="Accent Text"
              token="--color-accent-text: #C73E26"
              bgClass="bg-accent-text"
              textClass="text-surface"
              contrast="5.1:1"
              description="Chữ coral trên nền sáng"
            />
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-label font-semibold text-ink-2 mb-2">Màu trạng thái (Status)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <ColorSwatch name="Success" token="--color-success: #047857" bgClass="bg-success" textClass="text-surface" />
            <ColorSwatch name="Warning" token="--color-warning: #B45309" bgClass="bg-warning" textClass="text-surface" />
            <ColorSwatch name="Danger" token="--color-danger: #B91C1C" bgClass="bg-danger" textClass="text-surface" />
            <ColorSwatch name="Info" token="--color-info: #0369A1" bgClass="bg-info" textClass="text-surface" />
          </div>
        </div>
      </section>

      {/* 2. THANG CHỮ & DẤU CHỒNG TIẾNG VIỆT */}
      <section className="mb-10">
        <h2 className="text-title font-bold text-ink mb-1">2. Thang chữ & Dấu chồng tiếng Việt</h2>
        <p className="text-caption text-ink-3 mb-4">
          Font Be Vietnam Pro (subset vietnamese + latin), kiểm tra các dấu chồng (Ể, Ỗ, Ậ, Ừ) không bị cấn dòng.
        </p>

        <div className="space-y-4 p-4 rounded-card bg-surface border border-line">
          <div className="border-b border-line pb-3">
            <span className="text-caption font-mono text-ink-3 block mb-1">Display · 32/40 700 tracking -0.02em</span>
            <p className="text-display text-ink font-bold">Ở đâu? Ổn định chưa? Ể Ỗ Ậ Ừ</p>
            <p className="text-display text-ink-2 font-bold">Where to tonight? Quick choices.</p>
          </div>

          <div className="border-b border-line pb-3">
            <span className="text-caption font-mono text-ink-3 block mb-1">Title · 22/30 700</span>
            <p className="text-title text-ink font-bold">Ở đâu? Ổn định chưa? Ể Ỗ Ậ Ừ</p>
            <p className="text-title text-ink-2 font-bold">Group decisions without endless debate.</p>
          </div>

          <div className="border-b border-line pb-3">
            <span className="text-caption font-mono text-ink-3 block mb-1">Heading · 18/26 600</span>
            <p className="text-heading text-ink font-semibold">Ở đâu? Ổn định chưa? Ể Ỗ Ậ Ừ</p>
            <p className="text-heading text-ink-2 font-semibold">Phở Hoà Pasteur & Trà Sữa Đậm Vị</p>
          </div>

          <div className="border-b border-line pb-3">
            <span className="text-caption font-mono text-ink-3 block mb-1">Body · 16/24 400</span>
            <p className="text-body text-ink">
              Ở đâu? Ổn định chưa? Ể Ỗ Ậ Ừ. Sinh viên và người trẻ mở link phòng trên điện thoại, thống nhất địa điểm chỉ trong vài phút.
            </p>
            <p className="text-body text-ink-2">
              Share the invite link, vote in real-time, and let smart algorithms break ties effortlessly.
            </p>
          </div>

          <div className="border-b border-line pb-3">
            <span className="text-caption font-mono text-ink-3 block mb-1">Label · 14/20 500</span>
            <p className="text-label text-ink font-medium">Ở đâu? Ổn định chưa? Ể Ỗ Ậ Ừ · Thêm quán mới</p>
          </div>

          <div className="border-b border-line pb-3">
            <span className="text-caption font-mono text-ink-3 block mb-1">Caption · 13/18 400</span>
            <p className="text-caption text-ink-3">Ở đâu? Ổn định chưa? Ể Ỗ Ậ Ừ · 260C Pasteur, Phường 8, Quận 3, TP.HCM</p>
          </div>

          <div>
            <span className="text-caption font-mono text-ink-3 block mb-1">Mã phòng & Số (tabular-nums .num + 0.08em tracking)</span>
            <p className="text-heading font-bold text-accent-text tracking-[0.08em] num">
              DIDAU8 · 17:30 – 21:00 · ₫45,000 · 12/15 phiếu
            </p>
          </div>
        </div>
      </section>

      {/* 3. MẪU NÚT (BUTTONS) */}
      <section className="mb-10">
        <h2 className="text-title font-bold text-ink mb-1">3. Mẫu nút (Buttons)</h2>
        <p className="text-caption text-ink-3 mb-4">
          Vùng chạm tối thiểu 44×44px (md) và 52px (lg). Nút primary có nền accent (#FF6B4A) + chữ ink (#1C1917).
        </p>

        <div className="p-4 rounded-card bg-surface border border-line space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="min-h-[44px] px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-ink font-semibold text-label transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text active:opacity-90 inline-flex items-center gap-2"
            >
              <ForkKnife size={18} weight="bold" />
              <span>Chốt quán ngay (Primary md)</span>
            </button>

            <button
              type="button"
              className="min-h-[52px] px-6 py-3 rounded-full bg-accent hover:bg-accent-hover text-ink font-semibold text-body transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text active:opacity-90 inline-flex items-center gap-2"
            >
              <span>Tạo phòng ngay (Primary lg)</span>
            </button>

            <button
              type="button"
              className="min-h-[44px] px-5 py-2.5 rounded-full bg-surface-2 hover:bg-line text-ink font-semibold text-label transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
            >
              Thêm vào lịch (Secondary)
            </button>

            <button
              type="button"
              className="min-h-[44px] px-4 py-2.5 rounded-full bg-transparent hover:bg-surface-2 text-ink-2 hover:text-ink font-medium text-label transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
            >
              Bỏ qua (Ghost)
            </button>

            <button
              type="button"
              className="min-h-[44px] px-5 py-2.5 rounded-full bg-danger-soft hover:bg-danger/20 text-danger font-semibold text-label transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-danger"
            >
              Xoá quán (Danger)
            </button>
          </div>

          <div className="pt-2 border-t border-line flex flex-wrap items-center gap-3">
            <span className="text-caption text-ink-3">Icon Button (44×44):</span>
            <button
              type="button"
              aria-label="Thích quán"
              className="w-11 h-11 rounded-full bg-surface-2 hover:bg-line text-ink flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
            >
              <ThumbsUp size={20} weight="regular" />
            </button>
            <button
              type="button"
              aria-label="Chia sẻ phòng"
              className="w-11 h-11 rounded-full bg-accent-soft hover:bg-accent/20 text-accent-text flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
            >
              <Users size={20} weight="bold" />
            </button>
          </div>
        </div>
      </section>

      {/* 4. CHIP & BỘ LỌC */}
      <section className="mb-10">
        <h2 className="text-title font-bold text-ink mb-1">4. Chip & Bộ lọc danh mục</h2>
        <p className="text-caption text-ink-3 mb-4">
          Chip bo tròn hẳn (rounded-full), cuộn ngang trên điện thoại, icon danh mục kèm màu soft.
        </p>

        <div className="p-4 rounded-card bg-surface border border-line">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              className={`min-h-[36px] px-4 rounded-full text-label font-medium transition-colors whitespace-nowrap ${
                selectedCategory === 'ALL'
                  ? 'bg-accent-soft text-accent-text border border-accent/20'
                  : 'bg-surface-2 text-ink-2 hover:bg-line'
              }`}
            >
              Tất cả (7)
            </button>

            {categories.map((cat) => {
              const IconComp = cat.icon;
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`min-h-[36px] px-3.5 py-1.5 rounded-full text-label font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap ${
                    isSelected
                      ? `${cat.bgSoft} ${cat.color} ring-1 ring-current`
                      : 'bg-surface-2 text-ink-2 hover:bg-line'
                  }`}
                >
                  <IconComp size={16} weight={isSelected ? 'fill' : 'regular'} />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. 7 ICON DANH MỤC PHOSPHOR */}
      <section className="mb-10">
        <h2 className="text-title font-bold text-ink mb-1">5. Bảy cặp màu & Icon danh mục (Phosphor)</h2>
        <p className="text-caption text-ink-3 mb-4">
          Tất cả 7 màu đạt tương phản ≥ 3:1 trên cả nền soft và nền trắng (đảm bảo hiển thị rõ cho mắt yếu).
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {categories.map((cat) => {
            const IconComp = cat.icon;
            return (
              <div
                key={cat.id}
                className="p-3 rounded-card bg-surface border border-line flex items-center gap-3"
              >
                <div
                  className={`w-11 h-11 rounded-field ${cat.bgSoft} ${cat.color} flex items-center justify-center flex-shrink-0`}
                >
                  <IconComp size={22} weight="fill" />
                </div>
                <div className="min-w-0">
                  <p className="text-label font-semibold text-ink truncate">{cat.label}</p>
                  <p className="text-caption font-mono text-ink-3 truncate">{cat.token}</p>
                  <p className="text-caption text-ink-2">Tương phản: {cat.contrast}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 6. THẺ QUÁN MẪU */}
      <section className="mb-10">
        <h2 className="text-title font-bold text-ink mb-1">6. Thẻ quán mẫu (Place Card)</h2>
        <p className="text-caption text-ink-3 mb-4">
          Bo góc card (16px), không lồng thẻ, phân cách bằng nấc màu `surface` trên nền `bg`.
        </p>

        <div className="max-w-md p-4 rounded-card bg-surface border border-line shadow-float">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-field bg-cat-food-soft text-cat-food flex items-center justify-center flex-shrink-0">
                <BowlFood size={20} weight="fill" />
              </div>
              <div>
                <span className="text-caption text-cat-food font-medium block">Ăn uống</span>
                <h3 className="text-heading font-semibold text-ink leading-tight">Phở Hoà Pasteur</h3>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-caption font-semibold bg-accent-soft text-accent-text">
              Dẫn đầu
            </span>
          </div>

          {/* Details */}
          <div className="space-y-1.5 mb-4 text-caption text-ink-2">
            <div className="flex items-center gap-1.5">
              <MapPin size={16} className="text-ink-3 flex-shrink-0" />
              <span className="truncate">260C Pasteur, Phường 8, Quận 3, TP.HCM</span>
            </div>
            <div className="flex items-center gap-3 text-ink-3 num">
              <span className="inline-flex items-center gap-1"><Clock size={16} />17:00 – 22:00</span>
              <span className="inline-flex items-center gap-1"><CurrencyCircleDollar size={16} />₫75,000 – ₫110,000</span>
            </div>
          </div>

          {/* Vote Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-line">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Vote đồng ý"
                onClick={() => {
                  if (userVote === 1) {
                    setUserVote(0);
                    setVoteCount((v) => v - 1);
                  } else {
                    setVoteCount((v) => (userVote === -1 ? v + 2 : v + 1));
                    setUserVote(1);
                  }
                }}
                className={`min-h-[44px] px-3.5 rounded-full inline-flex items-center gap-1.5 text-label font-medium transition-colors ${
                  userVote === 1
                    ? 'bg-accent text-ink font-semibold'
                    : 'bg-surface-2 text-ink-2 hover:bg-line'
                }`}
              >
                <ThumbsUp size={18} weight={userVote === 1 ? 'fill' : 'regular'} />
                <span className="num">{voteCount}</span>
              </button>

              <button
                type="button"
                aria-label="Vote không thích"
                onClick={() => {
                  if (userVote === -1) {
                    setUserVote(0);
                    setVoteCount((v) => v + 1);
                  } else {
                    setVoteCount((v) => (userVote === 1 ? v - 2 : v - 1));
                    setUserVote(-1);
                  }
                }}
                className={`w-11 h-11 rounded-full inline-flex items-center justify-center transition-colors ${
                  userVote === -1
                    ? 'bg-danger-soft text-danger ring-1 ring-danger'
                    : 'bg-surface-2 text-ink-3 hover:bg-line'
                }`}
              >
                <ThumbsDown size={18} weight={userVote === -1 ? 'fill' : 'regular'} />
              </button>
            </div>

            <button
              type="button"
              className="text-label text-accent-text hover:underline font-semibold"
            >
              Xem chi tiết
            </button>
          </div>
        </div>
      </section>

      {/* 7. TRẠNG THÁI FEEDBACK */}
      <section className="mb-10">
        <h2 className="text-title font-bold text-ink mb-1">7. Trạng thái thông báo (Feedback Banners)</h2>
        <div className="space-y-3">
          <div className="p-3.5 rounded-card bg-success-soft border border-success/20 flex items-center gap-3 text-success">
            <CheckCircle size={20} weight="fill" className="flex-shrink-0" />
            <span className="text-label font-medium text-ink">Quán đã được chốt vào lịch trình lúc 19:00.</span>
          </div>

          <div className="p-3.5 rounded-card bg-warning-soft border border-warning/20 flex items-center gap-3 text-warning">
            <WarningCircle size={20} weight="fill" className="flex-shrink-0" />
            <span className="text-label font-medium text-ink">
              Trùng lịch: Quán đóng cửa lúc 21:00 nhưng lịch kết thúc 21:30.
            </span>
          </div>

          <div className="p-3.5 rounded-card bg-danger-soft border border-danger/20 flex items-center gap-3 text-danger">
            <XCircle size={20} weight="fill" className="flex-shrink-0" />
            <span className="text-label font-medium text-ink">
              Không lưu được quán. Vui lòng kiểm tra mạng và thử lại.
            </span>
          </div>

          <div className="p-3.5 rounded-card bg-info-soft border border-info/20 flex items-center gap-3 text-info">
            <Info size={20} weight="fill" className="flex-shrink-0" />
            <span className="text-label font-medium text-ink">
              Gợi ý: Dán link ShopeeFood hoặc GrabFood để tự động điền thông tin.
            </span>
          </div>
        </div>
      </section>

      {/* 8. THANH TAB DƯỚI MẪU (STATIC BOTTOM TAB BAR) */}
      <section className="mb-6">
        <h2 className="text-title font-bold text-ink mb-1">8. Thanh tab dưới mẫu (Bottom Tab Bar)</h2>
        <p className="text-caption text-ink-3 mb-4">
          Thanh tab đáy cố định trên điện thoại: Quán · Bản đồ · Lịch · Nhóm. Touch target 44×44px, icon 24px kèm nhãn.
        </p>

        {/* Preview tĩnh */}
        <div className="max-w-md mx-auto rounded-2xl overflow-hidden border border-line shadow-float bg-surface">
          <div className="p-6 text-center text-ink-3 text-caption border-b border-line">
            Vùng nội dung màn hình phòng
          </div>
          <nav className="flex items-center justify-around py-2 px-1 bg-surface">
            <button
              type="button"
              onClick={() => setActiveTab('places')}
              className={`flex flex-col items-center justify-center min-w-[64px] min-h-[44px] transition-colors ${
                activeTab === 'places' ? 'text-accent-text font-semibold' : 'text-ink-3 hover:text-ink'
              }`}
            >
              <ForkKnife size={24} weight={activeTab === 'places' ? 'fill' : 'regular'} />
              <span className="text-caption mt-0.5">Quán</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('map')}
              className={`flex flex-col items-center justify-center min-w-[64px] min-h-[44px] transition-colors ${
                activeTab === 'map' ? 'text-accent-text font-semibold' : 'text-ink-3 hover:text-ink'
              }`}
            >
              <MapTrifold size={24} weight={activeTab === 'map' ? 'fill' : 'regular'} />
              <span className="text-caption mt-0.5">Bản đồ</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              className={`flex flex-col items-center justify-center min-w-[64px] min-h-[44px] transition-colors ${
                activeTab === 'schedule' ? 'text-accent-text font-semibold' : 'text-ink-3 hover:text-ink'
              }`}
            >
              <CalendarBlank size={24} weight={activeTab === 'schedule' ? 'fill' : 'regular'} />
              <span className="text-caption mt-0.5">Lịch</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('group')}
              className={`flex flex-col items-center justify-center min-w-[64px] min-h-[44px] transition-colors ${
                activeTab === 'group' ? 'text-accent-text font-semibold' : 'text-ink-3 hover:text-ink'
              }`}
            >
              <Users size={24} weight={activeTab === 'group' ? 'fill' : 'regular'} />
              <span className="text-caption mt-0.5">Nhóm</span>
            </button>
          </nav>
        </div>
      </section>
    </div>
  );
};
