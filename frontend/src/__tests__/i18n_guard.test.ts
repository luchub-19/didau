import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Biểu thức chính quy phát hiện ký tự có dấu tiếng Việt trong mã nguồn.
 */
const VI_CHAR_REGEX =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

/**
 * Loại bỏ comment đơn dòng, comment khối và comment JSX, nhưng giữ nguyên nội dung chuỗi ký tự.
 */
function stripComments(code: string): string {
  return code.replace(
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\/\*[\s\S]*?\*\/|\/\/[^\r\n]*)/g,
    (_match, str) => {
      if (str) return str;
      return '';
    },
  );
}

/**
 * Danh sách chờ các file còn chứa chuỗi tiếng Việt hardcode chưa được chuyển qua i18n.
 * Mỗi task màn hình (T-40 → T-50) khi xử lý xong file nào PHẢI xoá file đó khỏi danh sách này.
 * Test sẽ FAIL nếu file trong danh sách đã sạch (đảm bảo danh sách chỉ giảm dần).
 */
export const PENDING_FILES = new Set<string>([
  // T-40: Bộ khung component ui/
  'components/common/Modal.tsx',

  // T-41: Khung phòng + thanh tab dưới
  'components/room/RoomHeader.tsx',

  // T-43: FE dịch chữ từ server (lỗi, thông báo, ws, store)


  // T-45: Tab Quán + vote (đã chuyển qua i18n ở T-45)

  // T-46: Tab Lịch + xung đột + auto-plan (đã chuyển qua i18n ở T-46)

  // T-47: Tab Bản đồ + đánh giá
  'components/map/GooglePlaceCard.tsx',
  'components/map/MapSearchBox.tsx',
  'components/map/MapView.tsx',
  'components/map/NearbySuggestions.tsx',
  'components/map/OriginPin.tsx',
  'components/map/PlaceSheet.tsx',
  'components/reviews/InternalReviews.tsx',
  'components/reviews/ReviewForm.tsx',
  'components/reviews/reviewUtils.ts',

  // T-48: Chọn hộ phần 1 (banner, gợi ý, phân định hoà)
  'components/decide/DecideModal.tsx',
  'components/decide/DeciderBanner.tsx',
  'components/decide/SmartPickCard.tsx',
  'components/voting/TieBreakSelectorModal.tsx',

  // T-49: Chọn hộ phần 2 (vòng quay, quẹt, thang)
  'components/decide/LuckyLadder.tsx',
  'components/decide/SpinWheel.tsx',
  'components/decide/SwipeDeck.tsx',

  // T-50: Tab Nhóm + chia sẻ
]);

function walkDirectory(dir: string): string[] {
  let results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkDirectory(fullPath));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('i18n guard test (lưới an toàn chống sót chữ tiếng Việt)', () => {
  const srcDir = path.resolve(__dirname, '..');
  const allSourceFiles = walkDirectory(srcDir);

  // Lọc bỏ i18n/locales/, mocks/, __tests__/, dev/
  const filesToScan = allSourceFiles.filter((filePath) => {
    const rel = path.relative(srcDir, filePath).replace(/\\/g, '/');
    return (
      !rel.startsWith('i18n/locales/') &&
      !rel.startsWith('mocks/') &&
      !rel.startsWith('__tests__/') &&
      !rel.startsWith('dev/')
    );
  });

  it('không có file mới nào ngoài PENDING_FILES chứa ký tự có dấu tiếng Việt ngoài comment', () => {
    const unlistedFilesWithVi: { file: string; sample: string }[] = [];

    for (const filePath of filesToScan) {
      const rel = path.relative(srcDir, filePath).replace(/\\/g, '/');
      if (PENDING_FILES.has(rel)) {
        continue;
      }
      const rawCode = fs.readFileSync(filePath, 'utf8');
      const stripped = stripComments(rawCode);
      if (VI_CHAR_REGEX.test(stripped)) {
        const match = stripped.match(VI_CHAR_REGEX);
        unlistedFilesWithVi.push({
          file: rel,
          sample: match ? match[0] : '',
        });
      }
    }

    expect(
      unlistedFilesWithVi,
      `Phát hiện các file sau có chữ tiếng Việt nhưng không nằm trong PENDING_FILES: ${JSON.stringify(
        unlistedFilesWithVi,
        null,
        2,
      )}`,
    ).toEqual([]);
  });

  it('mọi file trong PENDING_FILES đều phải còn chữ tiếng Việt (file đã sạch phải xoá khỏi danh sách)', () => {
    const cleanedFilesStillPending: string[] = [];

    for (const rel of PENDING_FILES) {
      const fullPath = path.join(srcDir, rel);
      if (!fs.existsSync(fullPath)) {
        cleanedFilesStillPending.push(`${rel} (file không tồn tại)`);
        continue;
      }
      const rawCode = fs.readFileSync(fullPath, 'utf8');
      const stripped = stripComments(rawCode);
      if (!VI_CHAR_REGEX.test(stripped)) {
        cleanedFilesStillPending.push(rel);
      }
    }

    expect(
      cleanedFilesStillPending,
      `Các file sau đã sạch chữ tiếng Việt nhưng chưa được xoá khỏi PENDING_FILES: ${cleanedFilesStillPending.join(
        ', ',
      )}`,
    ).toEqual([]);
  });
});
