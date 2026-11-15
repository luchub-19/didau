// Dựng thẻ chuyến đi thành PNG (DESIGN gđ6 §5). `html-to-image` chỉ được import động ở trong hàm → nằm chunk riêng,
// entry bundle không chứa nó. Phần thuần (tên tệp, kích thước) test được không cần DOM.
import bricolageLatin800 from '@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff2?url';
import bricolageVi800 from '@fontsource/bricolage-grotesque/files/bricolage-grotesque-vietnamese-800-normal.woff2?url';
import bvpLatin400 from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-400-normal.woff2?url';
import bvpVi400 from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-vietnamese-400-normal.woff2?url';
import bvpLatin600 from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-600-normal.woff2?url';
import bvpVi600 from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-vietnamese-600-normal.woff2?url';
import bvpLatin700 from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-700-normal.woff2?url';
import bvpVi700 from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-vietnamese-700-normal.woff2?url';

/** Kích thước dựng (CSS px); xuất 1080×1350 nhờ `pixelRatio: 2`. */
export const CARD_WIDTH = 540;
export const CARD_HEIGHT = 675;
export const CARD_PIXEL_RATIO = 2;

/** `hangoutplanner-<mã phòng>.png`, mã phòng chỉ giữ chữ-số. */
export function cardFileName(code: string): string {
  const slug = code
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 12);
  return `hangoutplanner-${slug || 'plan'}.png`;
}

const LATIN_RANGE =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const VI_RANGE =
  'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB';

interface FontFace {
  family: string;
  weight: number;
  url: string;
  range: string;
}

// Chỉ nhúng đúng các mặt chữ thẻ dùng (latin + vietnamese). Để thư viện tự quét sẽ kéo cả cyrillic/greek… vào PNG.
const FACES: FontFace[] = [
  { family: 'Bricolage Grotesque', weight: 800, url: bricolageLatin800, range: LATIN_RANGE },
  { family: 'Bricolage Grotesque', weight: 800, url: bricolageVi800, range: VI_RANGE },
  { family: 'Be Vietnam Pro', weight: 400, url: bvpLatin400, range: LATIN_RANGE },
  { family: 'Be Vietnam Pro', weight: 400, url: bvpVi400, range: VI_RANGE },
  { family: 'Be Vietnam Pro', weight: 600, url: bvpLatin600, range: LATIN_RANGE },
  { family: 'Be Vietnam Pro', weight: 600, url: bvpVi600, range: VI_RANGE },
  { family: 'Be Vietnam Pro', weight: 700, url: bvpLatin700, range: LATIN_RANGE },
  { family: 'Be Vietnam Pro', weight: 700, url: bvpVi700, range: VI_RANGE },
];

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

let fontCss: Promise<string> | null = null;

/** CSS `@font-face` với tệp font nhúng base64 (ảnh SVG không đọc được font của trang). Nhớ kết quả sau lần đầu. */
function embeddedFontCss(): Promise<string> {
  fontCss ??= Promise.all(
    FACES.map(async (f) => {
      const res = await fetch(f.url);
      const data = await blobToDataUrl(await res.blob());
      return `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};font-display:block;src:url(${data}) format('woff2');unicode-range:${f.range};}`;
    }),
  )
    .then((parts) => parts.join('\n'))
    .catch((err) => {
      fontCss = null; // lần sau thử lại
      throw err;
    });
  return fontCss;
}

/** Safari/WebKit (không phải Chrome): lần dựng đầu hay thiếu ảnh/font → dựng hai lần, lấy lần sau. */
function isWebKit(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /^((?!chrome|chromium|android|crios|fxios).)*safari/i.test(navigator.userAgent);
}

/** Chờ font của trang và giải mã mọi ảnh trong `node` trước khi chụp. */
async function waitForAssets(node: HTMLElement): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts) {
    const sample = node.textContent ?? '';
    await Promise.all([
      document.fonts.load("800 32px 'Bricolage Grotesque'", sample).catch(() => []),
      document.fonts.load("600 16px 'Be Vietnam Pro'", sample).catch(() => []),
    ]);
    await document.fonts.ready;
  }
  const imgs = Array.from(node.querySelectorAll('img'));
  await Promise.all(imgs.map((img) => img.decode().catch(() => undefined)));
}

/** Chụp `node` (đã có kích thước 540×675) ra PNG 1080×1350. Ném lỗi khi dựng hỏng — nơi gọi báo toast. */
export async function renderCardPng(node: HTMLElement): Promise<Blob> {
  await waitForAssets(node);
  const [{ toBlob }, fontEmbedCSS] = await Promise.all([import('html-to-image'), embeddedFontCss()]);
  const options = {
    pixelRatio: CARD_PIXEL_RATIO,
    cacheBust: true,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fontEmbedCSS,
  };
  if (isWebKit()) await toBlob(node, options); // lần khởi động, bỏ kết quả
  const blob = await toBlob(node, options);
  if (!blob) throw new Error('card render returned empty blob');
  return blob;
}
