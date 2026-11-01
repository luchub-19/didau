"""Sinh trang checklist ảnh quán tuyển chọn: docs/phase5/curated-checklist.html.

Chạy tay (Python thuần):  python3 scripts/curated_checklist.py
Mở file HTML bằng trình duyệt; chạy lại để cập nhật ✓/⏳/✗.
"""

import html
import json
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "frontend" / "src" / "curated" / "hcm.json"
PUBLIC = ROOT / "frontend" / "public" / "curated"
INBOX = ROOT / "curated-inbox"
OUT = ROOT / "docs" / "phase5" / "curated-checklist.html"
RAW_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}


def load() -> list[dict]:
    return json.loads(DATA.read_text(encoding="utf-8"))["places"]


def inbox_stems() -> set[str]:
    if not INBOX.is_dir():
        return set()
    return {p.stem.lower() for p in INBOX.iterdir() if p.suffix.lower() in RAW_EXT}


def status(entry: dict, inbox: set[str]) -> str:
    """✓ đủ ảnh đã xử lý · ⏳ có ảnh thô chờ xử lý · ✗ chưa có."""
    files = [p["file"] for p in entry["photos"]]
    if all((PUBLIC / f).exists() for f in files):
        return "✓"
    stems = {Path(f).stem for f in files}
    if any((PUBLIC / f).exists() for f in files) or stems & inbox:
        return "⏳"
    return "✗"


def maps_url(e: dict) -> str:
    q = urllib.parse.quote_plus(f"{e['name']} {e['address']}")
    url = f"https://www.google.com/maps/search/?api=1&query={q}"
    if e.get("google_place_id"):
        url += "&query_place_id=" + urllib.parse.quote_plus(e["google_place_id"])
    return url


def foody_url(e: dict) -> str:
    return "https://www.foody.vn/ho-chi-minh/tim-kiem?q=" + urllib.parse.quote_plus(e["name"])


def summary(places: list[dict], inbox: set[str] | None = None) -> dict[int, tuple[int, int]]:
    inbox = inbox_stems() if inbox is None else inbox
    out: dict[int, tuple[int, int]] = {}
    for wave in sorted({e["wave"] for e in places}):
        group = [e for e in places if e["wave"] == wave]
        out[wave] = (sum(status(e, inbox) == "✓" for e in group), len(group))
    return out


def missing_wave1(places: list[dict]) -> list[str]:
    inbox = inbox_stems()
    return [e["id"] for e in places if e["wave"] == 1 and status(e, inbox) != "✓"]


def render(places: list[dict]) -> str:
    inbox = inbox_stems()
    sums = summary(places, inbox)
    rows = []
    for wave in sorted(sums):
        done, total = sums[wave]
        rows.append(f'<h2>Đợt {wave}: {done}/{total} quán đủ ảnh</h2>')
        for e in (x for x in places if x["wave"] == wave):
            st = status(e, inbox)
            photos = "".join(
                f"<li><b>{html.escape(p['kind'])}</b> → lưu tên <code>{html.escape(Path(p['file']).stem)}.jpg</code></li>"
                for p in e["photos"]
            )
            rows.append(
                f'<div class="row"><span class="st">{st}</span><div>'
                f'<div class="name">{html.escape(e["name"])}</div>'
                f'<div class="addr">{html.escape(e["address"])}</div>'
                f'<div class="links"><a href="{html.escape(maps_url(e))}" target="_blank" rel="noopener">Google Maps</a> · '
                f'<a href="{html.escape(foody_url(e))}" target="_blank" rel="noopener">Tìm trên Foody</a></div>'
                f"<ul>{photos}</ul></div></div>"
            )
    return f"""<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Checklist ảnh quán tuyển chọn</title>
<style>
body{{font:16px/1.5 system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#222}}
.row{{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #ddd}}
.st{{font-size:22px;width:28px;text-align:center}} .name{{font-weight:600}} .addr{{color:#666;font-size:14px}}
ul{{margin:4px 0 0;padding-left:18px;font-size:14px}} code{{background:#eee;padding:0 4px;border-radius:4px}}
</style></head><body>
<h1>Ảnh quán tuyển chọn</h1>
<p>Dữ liệu sinh từ <code>frontend/src/curated/hcm.json</code>. ✓ đủ ảnh · ⏳ có ảnh thô chờ xử lý · ✗ chưa có.</p>
<ol>
<li>Bấm link Google Maps / Foody của quán, lưu 2–3 ảnh.</li>
<li>Đặt tên ảnh đúng như trang ghi (đuôi gì cũng được) và thả vào <code>curated-inbox/</code>.</li>
<li>Chạy <code>python3 scripts/curated_images.py</code> (thu nhỏ, đổi WebP, cập nhật trang này).</li>
<li>Mở lại trang (F5) xem ✓. Làm đợt 1 trước; đợt 2 bổ sung dần.</li>
</ol>
{''.join(rows)}
</body></html>
"""


def main() -> None:
    places = load()
    OUT.write_text(render(places), encoding="utf-8")
    parts = [f"Đợt {w}: {d}/{t}" for w, (d, t) in summary(places).items()]
    print(f"Đã ghi {OUT.relative_to(ROOT)} — " + ", ".join(parts))


if __name__ == "__main__":
    main()
