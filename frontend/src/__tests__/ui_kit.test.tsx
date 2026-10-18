import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../i18n';
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
  ToastViewport,
  useToastStore,
  toast,
  ForkKnife,
  Trash,
  X,
} from '../components/ui';

describe('UI Kit Component Suite (T-40)', () => {
  beforeEach(() => {
    useToastStore.getState().clearToasts();
  });

  describe('Button', () => {
    it('render primary variant với token bg-accent text-ink và min-h-[44px]', () => {
      const html = renderToStaticMarkup(
        <Button variant="primary">Xác nhận</Button>,
      );
      expect(html).toContain('bg-accent');
      expect(html).toContain('text-ink');
      expect(html).toContain('min-h-[44px]');
      expect(html).toContain('rounded-full');
      expect(html).toContain('Xác nhận');
    });

    it('render secondary, ghost, danger variants với đúng token màu', () => {
      const secHtml = renderToStaticMarkup(
        <Button variant="secondary">Lưu</Button>,
      );
      expect(secHtml).toContain('bg-surface-2');
      expect(secHtml).toContain('border-line');

      const ghostHtml = renderToStaticMarkup(
        <Button variant="ghost">Bỏ qua</Button>,
      );
      expect(ghostHtml).toContain('bg-transparent');

      const dangerHtml = renderToStaticMarkup(
        <Button variant="danger">Xoá quán</Button>,
      );
      expect(dangerHtml).toContain('bg-danger-soft');
      expect(dangerHtml).toContain('text-danger');
    });

    it('render size lg với min-h-[52px]', () => {
      const html = renderToStaticMarkup(
        <Button size="lg">Tạo phòng ngay</Button>,
      );
      expect(html).toContain('min-h-[52px]');
    });

    it('render loading state có aria-busy="true" và disabled', () => {
      const html = renderToStaticMarkup(
        <Button loading>Đang xử lý</Button>,
      );
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('disabled=""');
      expect(html).toContain('animate-spin');
    });

    it('render leftIcon và fullWidth', () => {
      const html = renderToStaticMarkup(
        <Button leftIcon={<ForkKnife data-testid="fork-icon" />} fullWidth>
          Ăn uống
        </Button>,
      );
      expect(html).toContain('w-full');
      expect(html).toContain('data-testid="fork-icon"');
    });
  });

  describe('IconButton', () => {
    it('render icon button 44x44 bắt buộc có aria-label', () => {
      const html = renderToStaticMarkup(
        <IconButton
          icon={<Trash data-testid="trash-icon" />}
          aria-label="Xoá quán"
          variant="danger"
        />,
      );
      expect(html).toContain('aria-label="Xoá quán"');
      expect(html).toContain('w-11 h-11');
      expect(html).toContain('min-w-[44px]');
      expect(html).toContain('min-h-[44px]');
      expect(html).toContain('rounded-full');
      expect(html).toContain('data-testid="trash-icon"');
    });

    it('render loading icon button có aria-busy="true"', () => {
      const html = renderToStaticMarkup(
        <IconButton
          icon={<X />}
          aria-label="Đóng"
          loading
        />,
      );
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('disabled=""');
    });
  });

  describe('TextField', () => {
    it('render input với nhãn phía trên và kích thước chữ 16px', () => {
      const html = renderToStaticMarkup(
        <TextField
          id="room-name"
          label="Tên phòng"
          placeholder="Nhập tên phòng"
          hint="Tối đa 30 ký tự"
        />,
      );
      expect(html).toContain('Tên phòng');
      expect(html).toContain('for="room-name"');
      expect(html).toContain('id="room-name"');
      expect(html).toContain('text-body');
      expect(html).toContain('Tối đa 30 ký tự');
      expect(html).toContain('rounded-field');
    });

    it('render error state có aria-invalid="true", role="alert" và icon lỗi', () => {
      const html = renderToStaticMarkup(
        <TextField
          id="pass-field"
          label="Mật khẩu"
          error="Mật khẩu không được để trống"
        />,
      );
      expect(html).toContain('aria-invalid="true"');
      expect(html).toContain('role="alert"');
      expect(html).toContain('Mật khẩu không được để trống');
      expect(html).toContain('text-danger');
      expect(html).toContain('border-danger');
    });

    it('render as="textarea" và as="select"', () => {
      const textareaHtml = renderToStaticMarkup(
        <TextField
          as="textarea"
          label="Ghi chú"
          defaultValue="Nội dung"
          rows={4}
        />,
      );
      expect(textareaHtml).toContain('<textarea');
      expect(textareaHtml).toContain('rows="4"');

      const selectHtml = renderToStaticMarkup(
        <TextField as="select" label="Danh mục">
          <option value="FOOD">Ăn uống</option>
          <option value="DRINK">Cà phê</option>
        </TextField>,
      );
      expect(selectHtml).toContain('<select');
      expect(selectHtml).toContain('value="FOOD"');
      expect(selectHtml).toContain('Ăn uống');
    });
  });

  describe('Chip', () => {
    it('render chip với aria-pressed phản ánh trạng thái chọn', () => {
      const unselectedHtml = renderToStaticMarkup(
        <Chip selected={false}>Cà phê</Chip>,
      );
      expect(unselectedHtml).toContain('aria-pressed="false"');
      expect(unselectedHtml).toContain('rounded-full');
      expect(unselectedHtml).toContain('Cà phê');

      const selectedHtml = renderToStaticMarkup(
        <Chip selected category="FOOD">
          Ăn uống
        </Chip>,
      );
      expect(selectedHtml).toContain('aria-pressed="true"');
      expect(selectedHtml).toContain('bg-cat-food-soft');
      expect(selectedHtml).toContain('text-cat-food');
    });

    it('render nút xoá khi có onRemove', () => {
      const html = renderToStaticMarkup(
        <Chip onRemove={() => {}}>Đã chọn</Chip>,
      );
      expect(html).toContain('aria-label=');
    });
  });

  describe('Card', () => {
    it('render thẻ với bo góc card 16px và viền line', () => {
      const html = renderToStaticMarkup(
        <Card floating className="custom-card">
          <p>Nội dung thẻ</p>
        </Card>,
      );
      expect(html).toContain('rounded-card');
      expect(html).toContain('bg-surface');
      expect(html).toContain('border-line');
      expect(html).toContain('shadow-float');
      expect(html).toContain('Nội dung thẻ');
    });

    it('render interactive card có role="button" và tabIndex="0"', () => {
      const html = renderToStaticMarkup(
        <Card interactive>
          <p>Bấm được</p>
        </Card>,
      );
      expect(html).toContain('role="button"');
      expect(html).toContain('tabindex="0"');
      expect(html).toContain('cursor-pointer');
    });
  });

  describe('Sheet & ConfirmSheet', () => {
    it('Sheet không render khi isOpen=false', () => {
      const html = renderToStaticMarkup(
        <Sheet isOpen={false} onClose={() => {}} title="Tiêu đề">
          Nội dung
        </Sheet>,
      );
      expect(html).toBe('');
    });

    it('Sheet render role="dialog", aria-modal="true", và nút đóng khi isOpen=true', () => {
      const html = renderToStaticMarkup(
        <Sheet isOpen onClose={() => {}} title="Chi tiết quán" description="Mô tả phụ">
          <p>Địa chỉ quán</p>
        </Sheet>,
      );
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-labelledby=');
      expect(html).toContain('Chi tiết quán');
      expect(html).toContain('Mô tả phụ');
      expect(html).toContain('Địa chỉ quán');
      expect(html).toContain('rounded-t-card');
    });

    it('ConfirmSheet render nút xác nhận với nhãn hành động rõ ràng', () => {
      const html = renderToStaticMarkup(
        <ConfirmSheet
          isOpen
          onClose={() => {}}
          onConfirm={() => {}}
          title="Xác nhận xoá"
          confirmLabel="Xoá quán"
          variant="danger"
        />,
      );
      expect(html).toContain('role="dialog"');
      expect(html).toContain('Xoá quán');
      expect(html).toContain('bg-danger-soft');
    });
  });

  describe('Toast & toastStore', () => {
    it('toast store thêm thông báo và ToastViewport render đúng role', () => {
      toast.success('Lưu quán thành công');
      toast.error('Không kết nối được máy chủ');

      const html = renderToStaticMarkup(<ToastViewport />);
      expect(html).toContain('role="status"');
      expect(html).toContain('role="alert"');
      expect(html).toContain('Lưu quán thành công');
      expect(html).toContain('Không kết nối được máy chủ');
      expect(html).toContain('z-toast');
    });
  });

  describe('Skeleton', () => {
    it('render base skeleton, text, block, và place card', () => {
      const baseHtml = renderToStaticMarkup(<Skeleton className="w-20 h-5" />);
      expect(baseHtml).toContain('animate-pulse');
      expect(baseHtml).toContain('bg-surface-2');
      expect(baseHtml).toContain('aria-hidden="true"');

      const textHtml = renderToStaticMarkup(<Skeleton.Text lines={3} />);
      expect(textHtml).toContain('space-y-2');

      const blockHtml = renderToStaticMarkup(<Skeleton.Block />);
      expect(blockHtml).toContain('rounded-card');

      const placeCardHtml = renderToStaticMarkup(<Skeleton.PlaceCard />);
      expect(placeCardHtml).toContain('rounded-card');
      expect(placeCardHtml).toContain('bg-surface');
    });
  });

  describe('EmptyState', () => {
    it('render empty state với icon, tiêu đề, mô tả và nút hành động', () => {
      const html = renderToStaticMarkup(
        <EmptyState
          icon={<ForkKnife />}
          title="Chưa có quán nào"
          description="Dán link hoặc chọn quán trên bản đồ."
          action={<Button>Thêm quán ngay</Button>}
        />,
      );
      expect(html).toContain('Chưa có quán nào');
      expect(html).toContain('Dán link hoặc chọn quán trên bản đồ.');
      expect(html).toContain('Thêm quán ngay');
    });
  });

  describe('Avatar', () => {
    it('render chữ cái đầu in hoa, bo 12px (rounded-field), màu theo hash', () => {
      const htmlLan = renderToStaticMarkup(<Avatar name="Lan" size="md" />);
      expect(htmlLan).toContain('L');
      expect(htmlLan).toContain('rounded-field');
      expect(htmlLan).toContain('title="Lan"');

      const htmlBinh = renderToStaticMarkup(<Avatar name="Bình" size="lg" />);
      expect(htmlBinh).toContain('B');
      expect(htmlBinh).toContain('w-12 h-12');
    });
  });

  describe('Segmented', () => {
    it('render segmented control với role="tablist" và role="tab"', () => {
      const html = renderToStaticMarkup(
        <Segmented
          options={[
            { value: 'vi', label: 'VI' },
            { value: 'en', label: 'EN' },
          ]}
          value="vi"
          onChange={() => {}}
        />,
      );
      expect(html).toContain('role="tablist"');
      expect(html).toContain('role="tab"');
      expect(html).toContain('aria-selected="true"');
      expect(html).toContain('aria-selected="false"');
      expect(html).toContain('rounded-full');
      expect(html).toContain('VI');
      expect(html).toContain('EN');
    });
  });
});
