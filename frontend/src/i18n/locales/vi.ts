export const vi = {
  common: {
    save: 'Lưu',
    cancel: 'Huỷ',
    close: 'Đóng',
    retry: 'Thử lại',
    delete: 'Xoá',
    confirm: 'Xác nhận',
    back: 'Quay lại',
    next: 'Tiếp tục',
    done: 'Xong',
    edit: 'Sửa',
    copy: 'Sao chép',
    copied: 'Đã sao chép',
    loading: 'Đang tải...',
    search: 'Tìm kiếm',
    empty: 'Chưa có dữ liệu',
    duration: {
      hoursAndMinutes: '{{hours}} giờ {{minutes}} phút',
      hoursOnly: '{{hours}} giờ',
      minutesOnly: '{{minutes}} phút',
      zero: '0 phút',
      shortHoursAndMinutes: '{{hours}}h {{minutes}}m',
      shortHoursOnly: '{{hours}} tiếng',
      shortMinutesOnly: '{{minutes}} phút',
    },
  },
  app: {
    name: 'Đi Đâu',
    tagline: 'Chọn chỗ đi chơi cùng nhóm',
    coldStart: {
      wakingTitle: 'Đang đánh thức máy chủ, chờ khoảng 1 phút nhé…',
      wakingDesc: 'Máy chủ đang khởi động lại sau thời gian nghỉ. Hệ thống sẽ tự động tải lại ngay khi máy chủ sẵn sàng.',
      retrying: 'Đang thử lại kết nối mỗi 5 giây...',
      errorTitle: 'Không kết nối được máy chủ',
      errorDesc: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.',
    },
  },
  lang: {
    vi: 'Tiếng Việt',
    en: 'English',
    switchToVi: 'Chuyển sang Tiếng Việt',
    switchToEn: 'Chuyển sang Tiếng Anh',
  },
  room: {},
  place: {},
  vote: {},
  schedule: {},
  conflict: {},
  map: {},
  review: {},
  decide: {},
  autoplan: {},
  group: {},
  errors: {},
} as const;

export type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends Record<string, unknown>
      ? DeepStringify<T[K]>
      : never;
};

export type Messages = DeepStringify<typeof vi>;
