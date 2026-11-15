/**
 * Re-export tập trung các icon Phosphor dùng trong Đi Đâu.
 * Chỉ import icon qua file này, không import rời rạc khắp dự án (DESIGN.md §6).
 */
export {
  // Biểu tượng danh mục
  BowlFood,
  Coffee,
  GameController,
  Camera,
  Bed,
  ShoppingBag,
  MapPin,

  // Điều hướng và thao tác
  X,
  Check,
  Star,
  Plus,
  Trash,
  PencilSimple,
  ShareNetwork,
  Copy,
  MagnifyingGlass,
  ArrowLeft,
  ArrowRight,
  CaretDown,
  CaretUp,
  CircleNotch,
  DotsThree,

  // Phòng và chức năng
  ForkKnife,
  MapTrifold,
  CalendarBlank,
  ImageSquare,
  Users,
  ThumbsUp,
  ThumbsDown,
  Heart,
  Clock,
  CurrencyCircleDollar,

  // Thông báo và trạng thái
  CheckCircle,
  WarningCircle,
  XCircle,
  Info,
  Sparkle,

  // Dải di chuyển trên lịch (T-90)
  Moped,

  // Công cụ chọn hộ
  DiceFive,
  HandSwipeLeft,
  SlidersHorizontal,
  Shuffle,

  // Âm thanh khoảnh khắc (T-61)
  SpeakerHigh,
  SpeakerSlash,

  // Loại quán chi tiết (`kind`, MAP-POI §3.1). Lớp bản đồ vẽ cùng các icon này từ path SVG trong
  // `components/map/poiIcons.ts` (canvas, không qua React); ở UI React dùng component dưới đây.
  Hamburger,
  Cake,
  Drop,
  IceCream,
  BeerStein,
  Storefront,
  ShoppingCart,
  FilmSlate,
  Microphone,
  Tree,
  Bank,
} from '@phosphor-icons/react';

export type { IconProps } from '@phosphor-icons/react';
