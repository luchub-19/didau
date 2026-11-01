"""Xử lý ảnh thô quán tuyển chọn: curated-inbox/ -> frontend/public/curated/*.webp + manifest.

Chạy tay:  python3 scripts/curated_images.py [--dry-run] [--force]
Cần Pillow:  pip install Pillow   (HEIC cần thêm: pip install pillow-heif)
"""

import argparse
import difflib
import json
import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:  # pragma: no cover
    print("Thiếu Pillow. Cài bằng:  pip install Pillow", file=sys.stderr)
    sys.exit(1)

sys.path.insert(0, str(Path(__file__).resolve().parent))
import curated_checklist as cl  # noqa: E402

try:  # HEIC tuỳ chọn
    import pillow_heif  # type: ignore

    pillow_heif.register_heif_opener()
except ImportError:
    pass

MANIFEST = cl.ROOT / "frontend" / "src" / "curated" / "photos.json"
MAX_SIDE, THUMB_SIDE, QUALITY = 1200, 320, 80


def crop_43(img: Image.Image) -> Image.Image:
    w, h = img.size
    if w * 3 > h * 4:  # quá ngang -> cắt giữa chiều rộng
        nw = h * 4 // 3
        x = (w - nw) // 2
        return img.crop((x, 0, x + nw, h))
    nh = w * 3 // 4
    y = (h - nh) // 2
    return img.crop((0, y, w, y + nh))


def process(src: Path, kind: str) -> tuple[Image.Image, Image.Image]:
    img = ImageOps.exif_transpose(Image.open(src)).convert("RGB")  # xoay EXIF; save lại không mang metadata
    if kind == "cover":
        img = crop_43(img)
    big = img.copy()
    big.thumbnail((MAX_SIDE, MAX_SIDE))
    thumb = img.copy()
    thumb.thumbnail((THUMB_SIDE, THUMB_SIDE))
    return big, thumb


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="chỉ in việc sẽ làm, không ghi file")
    ap.add_argument("--force", action="store_true", help="ghi đè ảnh đã có")
    args = ap.parse_args()

    data = json.loads(cl.DATA.read_text(encoding="utf-8"))
    by_stem = {Path(p["file"]).stem: (e, p) for e in data["places"] for p in e["photos"]}
    ids = [e["id"] for e in data["places"]]
    cl.PUBLIC.mkdir(parents=True, exist_ok=True)

    done = warns = 0
    for src in sorted(cl.INBOX.iterdir()) if cl.INBOX.is_dir() else []:
        if src.suffix.lower() not in cl.RAW_EXT:
            continue
        hit = by_stem.get(src.stem.lower())
        if not hit:
            guess = difflib.get_close_matches(src.stem.lower().rsplit("-", 1)[0], ids, n=1)
            hint = f" (gần nhất: {guess[0]}-<số>)" if guess else ""
            print(f"CẢNH BÁO: tên không khớp, bỏ qua: {src.name}{hint}")
            warns += 1
            continue
        entry, photo = hit
        out = cl.PUBLIC / photo["file"]
        thumb_out = cl.PUBLIC / photo["file"].replace(".webp", ".thumb.webp")
        if out.exists() and not args.force:
            print(f"bỏ qua (đã có, dùng --force để ghi đè): {photo['file']}")
            continue
        print(f"{'[dry-run] ' if args.dry_run else ''}{src.name} -> {photo['file']} ({photo['kind']})")
        if not args.dry_run:
            try:
                big, thumb = process(src, photo["kind"])
            except Exception as exc:  # ảnh hỏng / HEIC thiếu thư viện
                print(f"CẢNH BÁO: không đọc được {src.name}: {exc}")
                warns += 1
                continue
            big.save(out, "WEBP", quality=QUALITY)
            thumb.save(thumb_out, "WEBP", quality=QUALITY)
            if not photo.get("source"):
                photo["source"] = "user"
        done += 1

    if not args.dry_run:
        cl.DATA.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        files = sorted(
            p["file"] for e in data["places"] for p in e["photos"] if (cl.PUBLIC / p["file"]).exists()
        )
        MANIFEST.write_text(json.dumps({"files": files}, indent=1) + "\n", encoding="utf-8")
        cl.OUT.write_text(cl.render(data["places"]), encoding="utf-8")

    missing = cl.missing_wave1(data["places"])
    shown = ", ".join(missing[:6]) + ("…" if len(missing) > 6 else "") or "không"
    print(f"{'(dry-run) ' if args.dry_run else ''}xử lý {done} ảnh, {warns} cảnh báo, đợt 1 còn thiếu: {shown}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
