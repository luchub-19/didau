import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  IconButton,
  TextField,
  Chip,
  Card,
  Sheet,
  ConfirmSheet,
  Skeleton,
  EmptyState,
  Avatar,
  Segmented,
  LanguageSwitcher,
  toast,
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
  Trash,
  Plus,
  Sparkle,
} from '../components/ui';
import { useLanguage } from '../i18n/useLanguage';
import { formatTime, formatDuration, formatMoney, formatDistance } from '../i18n/format';

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
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [activeTab, setActiveTab] = useState<'places' | 'map' | 'schedule' | 'group'>('places');
  const [selectedCategory, setSelectedCategory] = useState<string>('FOOD');
  const [voteCount, setVoteCount] = useState<number>(5);
  const [userVote, setUserVote] = useState<1 | -1 | 0>(1);

  // States cho các component UI Kit thử nghiệm
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [segmentedVal, setSegmentedVal] = useState<'day' | 'week' | 'month'>('day');
  const [textInputVal, setTextInputVal] = useState('Phở Hoà Pasteur');
  const [selectVal, setSelectVal] = useState('FOOD');

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
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-accent" />
            <span className="text-caption font-semibold text-accent-text">
              Hệ thống thiết kế · Mốc 1 (T-40)
            </span>
          </div>
          <LanguageSwitcher />
        </div>
        <h1 className="text-display font-bold text-ink mb-2">
          Đi Đâu — Bảng phong cách mẫu & Bộ khung UI Kit
        </h1>
        <p className="text-body text-ink-2 max-w-2xl">
          Trang mẫu tích hợp toàn bộ component UI Kit chuẩn hoá (`src/components/ui/`), token màu, font Be Vietnam Pro,
          độ tương phản WCAG 2.2 AA, 7 icon danh mục Phosphor và song ngữ i18n.
        </p>
      </header>

      {/* 0. SONG NGỮ (i18n & Intl) */}
      <section className="mb-10 p-5 rounded-field bg-surface border border-line">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-title font-bold text-ink mb-1">Song ngữ i18n & Định dạng Intl (T-39)</h2>
            <p className="text-caption text-ink-3">
              Chuyển đổi ngôn ngữ tức thì, không tải lại trang. Các chuỗi thuộc nhóm common và app tự động đồng bộ.
            </p>
          </div>
          <LanguageSwitcher />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 rounded-field bg-surface-2 border border-line">
            <span className="text-caption text-ink-3 block mb-1">app.name / app.tagline</span>
            <p className="font-semibold text-sm text-ink">{t('app.name')}</p>
            <p className="text-caption text-ink-2">{t('app.tagline')}</p>
          </div>
          <div className="p-3 rounded-field bg-surface-2 border border-line">
            <span className="text-caption text-ink-3 block mb-1">common (hành động mẫu)</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span className="px-2 py-0.5 rounded bg-surface border border-line text-caption font-medium text-ink">{t('common.save')}</span>
              <span className="px-2 py-0.5 rounded bg-surface border border-line text-caption font-medium text-ink">{t('common.cancel')}</span>
              <span className="px-2 py-0.5 rounded bg-surface border border-line text-caption font-medium text-ink">{t('common.retry')}</span>
              <span className="px-2 py-0.5 rounded bg-surface border border-line text-caption font-medium text-ink">{t('common.delete')}</span>
            </div>
          </div>
          <div className="p-3 rounded-field bg-surface-2 border border-line">
            <span className="text-caption text-ink-3 block mb-1">formatTime / formatDuration</span>
            <p className="font-mono text-xs text-ink">{formatTime(1020, lang)} - {formatTime(1380, lang)}</p>
            <p className="text-caption text-ink-2 mt-1">{formatDuration(90, lang)} · {formatDuration(90, lang, 'short')}</p>
          </div>
          <div className="p-3 rounded-field bg-surface-2 border border-line">
            <span className="text-caption text-ink-3 block mb-1">formatMoney / formatDistance</span>
            <p className="font-mono text-xs text-ink">{formatMoney(45000, lang)}</p>
            <p className="text-caption text-ink-2 mt-1">{formatDistance(1.2, lang)}</p>
          </div>
        </div>
      </section>

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

      {/* 3. BỘ NÚT CHUẨN HOÁ (Button & IconButton từ src/components/ui/) */}
      <section className="mb-10">
        <h2 className="text-title font-bold text-ink mb-1">3. Mẫu nút bấm (Button & IconButton — T-40)</h2>
        <p className="text-caption text-ink-3 mb-4">
          Bộ component `Button` và `IconButton` thật, đủ 4 biến thể, 2 cỡ, trạng thái loading, disabled và icon.
        </p>

        <Card className="space-y-4">
          <div>
            <span className="text-caption text-ink-3 block mb-2 font-medium">Các biến thể & kích cỡ:</span>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" size="md" leftIcon={<ForkKnife size={18} />}>
                Chốt quán ngay (Primary md)
              </Button>

              <Button variant="primary" size="lg" leftIcon={<Plus size={20} />}>
                Tạo phòng ngay (Primary lg)
              </Button>

              <Button variant="secondary">
                Thêm vào lịch (Secondary)
              </Button>

              <Button variant="ghost">
                Bỏ qua (Ghost)
              </Button>

              <Button variant="danger">
                Xoá quán (Danger)
              </Button>
            </div>
          </div>

          <div className="pt-3 border-t border-line">
            <span className="text-caption text-ink-3 block mb-2 font-medium">Trạng thái Loading & Disabled:</span>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" loading>
                Đang xử lý...
              </Button>
              <Button variant="secondary" loading>
                Đang lưu...
              </Button>
              <Button variant="primary" disabled>
                Không khả dụng
              </Button>
              <Button variant="danger" disabled>
                Không thể xoá
              </Button>
            </div>
          </div>

          <div className="pt-3 border-t border-line">
            <span className="text-caption text-ink-3 block mb-2 font-medium">Nút biểu tượng (IconButton 44×44px, bắt buộc aria-label):</span>
            <div className="flex flex-wrap items-center gap-3">
              <IconButton
                aria-label="Thích quán"
                icon={<ThumbsUp size={20} />}
                variant="secondary"
              />
              <IconButton
                aria-label="Chia sẻ phòng"
                icon={<Users size={20} />}
                variant="primary"
              />
              <IconButton
                aria-label="Xoá địa điểm"
                icon={<Trash size={20} />}
                variant="danger"
              />
              <IconButton
                aria-label="Đang tải dữ liệu"
                icon={<ThumbsUp size={20} />}
                variant="secondary"
                loading
              />
              <IconButton
                aria-label="Bị vô hiệu hoá"
                icon={<ThumbsDown size={20} />}
                variant="ghost"
                disabled
              />
            </div>
          </div>
        </Card>
      </section>

      {/* 4. TRƯỜNG NHẬP LIỆU (TextField) */}
      <section className="mb-10">
        <h2 className="text-title font-bold text-ink mb-1">4. Trường nhập liệu (TextField — T-40)</h2>
        <p className="text-caption text-ink-3 mb-4">
          Nhãn luôn nằm phía trên, gợi ý và lỗi nằm dưới kèm icon, cỡ chữ 16px tránh phóng to trên iOS.
        </p>

        <Card className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField
            label="Tên quán ăn / địa điểm"
            placeholder="Ví dụ: Phở Hoà Pasteur"
            value={textInputVal}
            onChange={(e) => setTextInputVal(e.target.value)}
            hint="Nhập tên quán để tìm kiếm hoặc tạo mới"
            required
          />

          <TextField
            label="Đường dẫn ShopeeFood / Grab"
            placeholder="https://shopeefood.vn/..."
            error="Đường dẫn không hợp lệ. Vui lòng kiểm tra lại."
            defaultValue="shopeefood/invalid-link"
          />

          <TextField
            as="select"
            label="Danh mục địa điểm"
            value={selectVal}
            onChange={(e) => setSelectVal(e.target.value)}
            hint="Chọn nhóm phù hợp nhất để hiển thị biểu tượng"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </TextField>

          <TextField
            as="textarea"
            label="Ghi chú cho nhóm"
            rows={3}
            placeholder="Ghi chú thêm về chỗ để xe, đặt bàn..."
            hint="Hiển thị cho tất cả thành viên trong phòng"
          />

          <TextField
            label="Trường vô hiệu hoá"
            defaultValue="Chỉ Host mới có quyền sửa"
            disabled
            hint="Ô này đã bị khoá theo quyền hạn"
          />
        </Card>
      </section>

      {/* 5. CHIP & BỘ LỌC */}
      <section className="mb-10">
        <h2 className="text-title font-bold text-ink mb-1">5. Chip & Bộ lọc danh mục (Chip — T-40)</h2>
        <p className="text-caption text-ink-3 mb-4">
          Component `Chip` chuẩn hoá bo tròn hẳn (`rounded-full`), cuộn ngang, hỗ trợ icon và xoá nhanh.
        </p>

        <Card>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <Chip
              selected={selectedCategory === 'ALL'}
              onClick={() => setSelectedCategory('ALL')}
            >
              Tất cả (7)
            </Chip>

            {categories.map((cat) => {
              const IconComp = cat.icon;
              const isSelected = selectedCategory === cat.id;
              return (
                <Chip
                  key={cat.id}
                  selected={isSelected}
                  category={
                    cat.id as
                      | 'FOOD'
                      | 'DRINK'
                      | 'ENTERTAINMENT'
                      | 'SIGHTSEEING'
                      | 'ACCOMMODATION'
                      | 'SHOPPING'
                      | 'OTHER'
                  }
                  onClick={() => setSelectedCategory(cat.id)}
                  icon={<IconComp size={16} weight={isSelected ? 'fill' : 'regular'} />}
                >
                  {cat.label}
                </Chip>
              );
            })}

            <Chip
              selected
              onRemove={() => toast.info('Đã gỡ bộ lọc nhanh')}
            >
              Đang mở cửa
            </Chip>
          </div>
        </Card>
      </section>

      {/* 6. PHÂN ĐOẠN (Segmented) */}
      <section className="mb-10">
        <h2 className="text-title font-bold text-ink mb-1">6. Phân đoạn chuyển chế độ (Segmented — T-40)</h2>
        <p className="text-caption text-ink-3 mb-4">
          Dùng cho bộ chọn chế độ chọn hộ (Vòng quay / Quẹt / Thang) và bộ chuyển đổi ngôn ngữ.
        </p>

        <Card className="flex flex-wrap items-center gap-4">
          <Segmented
            value={segmentedVal}
            onChange={(v) => setSegmentedVal(v)}
            options={[
              { value: 'day' as const, label: 'Theo ngày' },
              { value: 'week' as const, label: 'Theo tuần' },
              { value: 'month' as const, label: 'Theo tháng' },
            ]}
          />

          <Segmented
            size="sm"
            value="wheel"
            onChange={() => {}}
            options={[
              { value: 'wheel', label: 'Vòng quay', icon: <Sparkle size={14} /> },
              { value: 'swipe', label: 'Quẹt thẻ' },
              { value: 'ladder', label: 'Cầu thang' },
            ]}
          />
        </Card>
      </section>

      {/* 7. AVATAR BIỆT DANH */}
      <section className="mb-10">
        <h2 className="text-title font-bold text-ink mb-1">7. Biệt danh thành viên (Avatar — T-40)</h2>
        <p className="text-caption text-ink-3 mb-4">
          Bo 12px (`rounded-field`), chữ cái đầu, màu hash ngẫu nhiên nhưng cố định theo tên từ 6 màu đạt chuẩn WCAG.
        </p>

        <Card className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Avatar name="An" size="sm" />
            <span className="text-caption text-ink-2">An (sm 32px)</span>
          </div>
          <div className="flex items-center gap-2">
            <Avatar name="Bình" size="md" />
            <span className="text-caption text-ink-2">Bình (md 40px)</span>
          </div>
          <div className="flex items-center gap-2">
            <Avatar name="Chi" size="lg" />
            <span className="text-caption text-ink-2">Chi (lg 48px)</span>
          </div>
          <div className="flex items-center gap-2">
            <Avatar name="Dũng" size="md" />
            <span className="text-caption text-ink-2">Dũng</span>
          </div>
          <div className="flex items-center gap-2">
            <Avatar name="Hương" size="md" />
            <span className="text-caption text-ink-2">Hương</span>
          </div>
          <div className="flex items-center gap-2">
            <Avatar name="Minh" size="md" />
            <span className="text-caption text-ink-2">Minh</span>
          </div>
        </Card>
      </section>

      {/* 8. SHEET & CONFIRM SHEET */}
      <section className="mb-10">
        <h2 className="text-title font-bold text-ink mb-1">8. Khung trượt & Hộp thoại (Sheet & ConfirmSheet — T-40)</h2>
        <p className="text-caption text-ink-3 mb-4">
          Dưới `md` là Bottom Sheet gắn chân màn hình có tay nắm kéo; từ `md` hiển thị thành dialog căn giữa. Bẫy focus và phím `Esc`.
        </p>

        <Card className="flex flex-wrap items-center gap-4">
          <Button variant="primary" onClick={() => setIsSheetOpen(true)}>
            Mở Sheet chi tiết quán
          </Button>

          <Button variant="danger" onClick={() => setIsConfirmOpen(true)}>
            Mở ConfirmSheet xoá quán
          </Button>
        </Card>

        {/* Sheet Demo */}
        <Sheet
          isOpen={isSheetOpen}
          onClose={() => setIsSheetOpen(false)}
          title="Thông tin chi tiết quán ăn"
          description="Địa điểm đề xuất bởi thành viên Lan lúc 17:30"
          footer={
            <>
              <Button variant="secondary" onClick={() => setIsSheetOpen(false)}>
                {t('common.close')}
              </Button>
              <Button variant="primary" onClick={() => {
                setIsSheetOpen(false);
                toast.success('Đã thêm quán vào lịch trình!');
              }}>
                Chốt vào lịch
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="p-3 rounded-field bg-surface-2 border border-line">
              <h4 className="font-semibold text-ink text-label mb-1">Phở Hoà Pasteur</h4>
              <p className="text-caption text-ink-2">260C Pasteur, Phường 8, Quận 3, TP.HCM</p>
              <p className="text-caption font-mono text-accent-text mt-1">17:00 – 22:00 · ₫75,000 – ₫110,000</p>
            </div>
            <p className="text-body text-ink-2">
              Quán phở truyền thống nổi tiếng với nước dùng thanh ngọt, thịt bò mềm và rau thơm tươi sạch.
            </p>
          </div>
        </Sheet>

        {/* ConfirmSheet Demo */}
        <ConfirmSheet
          isOpen={isConfirmOpen}
          onClose={() => setIsConfirmOpen(false)}
          onConfirm={() => {
            setIsConfirmOpen(false);
            toast.error('Đã xoá quán khỏi danh sách đề xuất');
          }}
          title="Xoá quán Phở Hoà Pasteur?"
          description="Hành động này sẽ xoá toàn bộ số phiếu vote hiện có của quán này trong phòng. Bạn có chắc chắn muốn xoá?"
          confirmLabel="Xoá quán"
          variant="danger"
        />
      </section>

      {/* 9. TOAST THÔNG BÁO NỔI */}
      <section className="mb-10">
        <h2 className="text-title font-bold text-ink mb-1">9. Thông báo nổi (Toast & toastStore — T-40)</h2>
        <p className="text-caption text-ink-3 mb-4">
          Tự động ẩn sau 4 giây, hiển thị phía trên thanh tab đáy, hỗ trợ nút đóng nhanh và ARIA status/alert.
        </p>

        <Card className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => toast.success('Đã sao chép liên kết phòng thành công!')}
          >
            Toast Success
          </Button>

          <Button
            variant="secondary"
            onClick={() => toast.error('Lỗi kết nối máy chủ, đang thử lại...')}
          >
            Toast Error
          </Button>

          <Button
            variant="secondary"
            onClick={() => toast.warning('Sắp đến giờ hẹn: còn 15 phút!')}
          >
            Toast Warning
          </Button>

          <Button
            variant="secondary"
            onClick={() => toast.info('Lan vừa đề xuất một quán cà phê mới.')}
          >
            Toast Info
          </Button>
        </Card>
      </section>

      {/* 10. SKELETON (TRẠNG THÁI TẢI NỘI DUNG) */}
      <section className="mb-10">
        <h2 className="text-title font-bold text-ink mb-1">10. Khung xương tải nội dung (Skeleton — T-40)</h2>
        <p className="text-caption text-ink-3 mb-4">
          Hiệu ứng nhấp nháy mô phỏng đúng cấu trúc nội dung thực tế thay cho spinner giữa màn hình.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="space-y-3">
            <span className="text-caption font-medium text-ink-3">Khối văn bản & dòng chữ:</span>
            <Skeleton.Text lines={3} />
            <Skeleton.Block className="h-16" />
          </Card>

          <div>
            <span className="text-caption font-medium text-ink-3 block mb-2">Thẻ quán mô phỏng (PlaceCard Skeleton):</span>
            <Skeleton.PlaceCard />
          </div>
        </div>
      </section>

      {/* 11. TRẠNG THÁI RỖNG (EmptyState) */}
      <section className="mb-10">
        <h2 className="text-title font-bold text-ink mb-1">11. Trạng thái rỗng (EmptyState — T-40)</h2>
        <p className="text-caption text-ink-3 mb-4">
          Dạy cách dùng và cung cấp đúng một hành động rõ ràng đưa người dùng tiếp tục hành trình.
        </p>

        <EmptyState
          icon={<ForkKnife size={32} />}
          title="Chưa có quán nào trong danh sách"
          description="Dán liên kết từ ShopeeFood, GrabFood hoặc chọn trực tiếp trên bản đồ để cả nhóm cùng vote."
          action={
            <Button variant="primary" leftIcon={<Plus size={18} />}>
              Thêm quán đầu tiên
            </Button>
          }
        />
      </section>

      {/* 12. THẺ QUÁN MẪU */}
      <section className="mb-10">
        <h2 className="text-title font-bold text-ink mb-1">12. Thẻ quán mẫu hoàn chỉnh (Place Card)</h2>
        <p className="text-caption text-ink-3 mb-4">
          Tích hợp component Card, Button, Avatar và các token danh mục chuẩn.
        </p>

        <Card floating className="max-w-md">
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

            <Button
              variant="ghost"
              size="md"
              onClick={() => setIsSheetOpen(true)}
            >
              Xem chi tiết
            </Button>
          </div>
        </Card>
      </section>

      {/* 13. THANH TAB DƯỚI MẪU (STATIC BOTTOM TAB BAR) */}
      <section className="mb-6">
        <h2 className="text-title font-bold text-ink mb-1">13. Thanh tab dưới mẫu (Bottom Tab Bar)</h2>
        <p className="text-caption text-ink-3 mb-4">
          Thanh tab đáy cố định trên điện thoại: Quán · Bản đồ · Lịch · Nhóm. Touch target 44×44px, icon 24px kèm nhãn.
        </p>

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
