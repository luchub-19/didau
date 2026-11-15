# Dữ liệu quán + bản đồ kiểu Google Maps (CR-17, T-100 → T-103)

Lập 2026-11-15 sau khi người dùng báo: (1) gõ "phúc long" ra cả loạt không biết chọn cái nào; (2) icon trên bản đồ nền
không tìm được, không bấm được — chỉ chấm cam bấm được; (3) thiếu mall, siêu thị; (4) chấm tròn khó dùng, chằng chịt,
đè lên icon + tên quán của bản đồ nền.

## 1. Nguyên nhân (đã kiểm trong code + dữ liệu)
| Hiện tượng | Nguyên nhân |
| :--- | :--- |
| Kết quả tìm không phân biệt được | `MapSearchBox.tsx` chỉ hiện icon + tên + km, không hiện `address`. Snapshot thiếu địa chỉ: Phúc Long 13/32 có, toàn TP 2 189/4 981. Không gom chuỗi; `build_osm_pois.py` không xuất `brand` (0 quán có brand dù backend đọc). |
| Icon nền không bấm/không tìm được | Hai lớp độc lập: icon + tên là của style OpenFreeMap Liberty (lớp `poi_r1/r7/r20`, source-layer `poi`, toàn bộ OSM), không gắn sự kiện; chấm cam là snapshot của mình chỉ 7 `amenity` ăn uống (`AMENITIES` trong `scripts/build_osm_pois.py`), lấy 2026-10-17. |
| Thiếu mall, siêu thị, rạp, karaoke | Truy vấn Overpass không có `shop=*`, `leisure=*`, `tourism=*`, `amenity=cinema/karaoke_box`. Enum `PlaceCategory` đã có `SHOPPING/ENTERTAINMENT/SIGHTSEEING` nhưng `osm_category()` không bao giờ sinh ra. |
| Chấm đè icon + tên nền, chằng chịt | `PoiLayer.ts` là lớp `circle` (không tham gia tránh chồng chữ), không có chữ; xa thì gom cụm bong bóng số (`CLUSTER_MAX_ZOOM = 14`), gần thì hiện hết. `in_bbox` xếp theo **tên**, nên `limit` cắt mất quán theo bảng chữ cái, không theo độ nổi bật. |

## 2. Nguồn dữ liệu (đo 2026-11-15)
| Nguồn | Phí / giấy phép | HCM: điểm hợp "đi chơi" | Ghi chú |
| :--- | :--- | --: | :--- |
| Snapshot hiện tại (OSM 7 loại) | miễn phí, ODbL | 4 981 | |
| OSM mở rộng (thêm shop/leisure/tourism/cinema/karaoke) | miễn phí, ODbL | ≈ 10 000 | có `opening_hours` ở một phần |
| **Overture Maps Places** release `2026-10-21.0` | miễn phí, CDLA-Permissive-2.0 (Meta, Microsoft, Foursquare, AllThePlaces…) | ≈ 99 000 (≥ 0,5 tin cậy: 69 439; ≥ 0,7: 38 731) | Phúc Long 183 điểm, gần như đủ số nhà; 1 275 mall, 276 rạp, ≈ 1 400 karaoke, 811 công viên. Không có giờ mở cửa; có điểm cũ (vd. "Thương Xá Tax" 0,98). |
| Google Places | trả phí, cấm lưu | — | Không dùng (luật dự án). |
| Foursquare OS Places | miễn phí, Apache-2.0 | chưa đo | Tuỳ chọn sau (T-104+). |

**Chọn:** Overture làm nguồn chính + OSM bù (giờ mở cửa, quán Overture thiếu). Lọc `confidence ≥ OVERTURE_MIN_CONF`
(**0,7** — người dùng chốt 2026-11-15, ≈ 39k điểm HCM; hằng trong script). Ghi công trên bản đồ: "© OpenStreetMap contributors · Overture Maps Foundation".

## 3. Mô hình dữ liệu snapshot mới (`backend/app/data/places_{hcm,hn}.json.gz`)
Mỗi bản ghi:
`{external_id, name, category, kind, lat, lng, address, district, brand, brand_key, cuisine, opening_hours, phone, website,
score, minzoom, sources[]}`
- `external_id`: quán khớp được với OSM **giữ `osm:{type}/{id}`** (quán đã thêm vào phòng cũ vẫn tra được); quán chỉ có ở
  Overture → `ovt:{gers_id}`. Không đổi định dạng ở chỗ khác (`places.external_id` đã là chuỗi tự do ≤ 100).
- Gộp trùng: cùng tên chuẩn hoá (bỏ dấu, bỏ tiền tố "cà phê/quán/coffee & tea…") và cách < 50 m, hoặc cùng `brand_key`
  và cách < 30 m → một bản ghi; ưu tiên tên/địa chỉ Overture, giờ mở cửa OSM.
- `district`: tên khu vực gần nhất từ `districts_{hcm,hn}.json` (như ALGO-01), dùng khi `address` trống.
- `brand_key`: `brand.names.primary` (Overture) hoặc `brand` (OSM) chuẩn hoá; trống nếu không có.

### 3.1 `kind` → `category` → icon
| category (màu hiện có) | kind | Overture `basic_category` / OSM | icon Phosphor |
| :--- | :--- | :--- | :--- |
| FOOD | `restaurant` | restaurant, buffet…; `amenity=restaurant` | `ForkKnife` |
| FOOD | `eatery` | casual_eatery, food_court, food_truck_stand | `BowlFood` |
| FOOD | `fast_food` | fast_food_restaurant; `amenity=fast_food` | `Hamburger` |
| FOOD | `bakery` | bakery; `shop=bakery/pastry` | `Cake` |
| DRINK | `cafe` | coffee_shop, cafe; `amenity=cafe`, `shop=coffee` | `Coffee` |
| DRINK | `tea` | non_alcoholic_beverage_venue, smoothie_juice_bar; `shop=tea/beverages` | `Drop` |
| DRINK | `dessert` | dessert/ice cream; `amenity=ice_cream` | `IceCream` |
| DRINK | `bar` | bar, alcoholic_beverage_venue, dance_club; `amenity=bar/pub/nightclub` | `BeerStein` |
| SHOPPING | `mall` | shopping_mall, department_store; `shop=mall/department_store` | `Storefront` |
| SHOPPING | `supermarket` | supermarket/warehouse_club_store; `shop=supermarket` | `ShoppingCart` |
| ENTERTAINMENT | `cinema` | movie_theater; `amenity=cinema` | `FilmSlate` |
| ENTERTAINMENT | `karaoke` | tên/loại karaoke; `amenity=karaoke_box` | `Microphone` |
| ENTERTAINMENT | `play` | arcade, bowling, escape room, amusement_park | `GameController` |
| SIGHTSEEING | `park` | park, public_plaza; `leisure=park` | `Tree` |
| SIGHTSEEING | `museum` | museum, gallery, historic_site có tên | `Bank` |

Không lấy: cửa hàng tiện lợi (Circle K… — 1 615 điểm nội thành, làm rối), dịch vụ, thời trang, khách sạn. Icon thiếu trong
Phosphor bản đang dùng → chọn icon gần nhất cùng bộ, thêm vào `components/ui/Icon.tsx` (luật DESIGN §6).

### 3.2 Điểm nổi bật `score` (0–100) — không có dữ liệu "độ phổ biến" như Google nên dùng tín hiệu sẵn có
`score = 40·confidence + 8·min(nguồn−1, 2) + 8·(có website hoặc mạng xã hội) + 4·(có SĐT) + 12·(có brand_key)
+ 8·(khớp OSM) + trọng số kind` với trọng số: mall 25, cinema 22, museum/park 18, supermarket 10, play/karaoke 8, còn lại 0.
Quán bị host báo "đã đóng" (sau này) trừ khỏi snapshot ở lần build tới.

### 3.3 `minzoom` — top-N theo ô lưới, không dùng ngưỡng chung
Ngưỡng chung làm Quận 1 dày đặc, ngoại thành trống. Thay vào đó với từng mức zoom z, chia lưới, mỗi ô giữ N quán điểm cao
nhất chưa có `minzoom`, gán `minzoom = z`:

| z | ô lưới | N mỗi ô | Ý nghĩa |
| :-: | :-: | :-: | :--- |
| 12 | 0,08° (~9 km) | 2 (chỉ kind mall/cinema/museum/park) | mốc lớn toàn TP |
| 13 | 0,02° | 3 | chuỗi lớn, quán tin cậy cao |
| 14 | 0,01° | 4 | |
| 15 | 0,005° | 5 | |
| 16 | 0,0025° | 6 | |
| 17 | — | mọi quán còn lại | |

Bộ lưới + N là hằng trong script; T-101 chỉnh theo ảnh chụp thật.

## 4. Giao diện bản đồ (quyết định người dùng 2026-11-15)
- **Một lớp quán duy nhất là của mình.** Trên style nền, các lớp `source-layer = poi` thêm điều kiện ẩn `class` mình có dữ
  liệu thay thế: `restaurant, fast_food, cafe, bar, beer, ice_cream, bakery, food_court, shop (mall/supermarket/department_store),
  grocery, cinema, theatre, karaoke, park, museum, art_gallery, attraction, playground, bowling…`. **Giữ** bệnh viện, trường,
  chợ, chùa/nhà thờ, bến xe/metro, khách sạn, ngân hàng… làm mốc định hướng (người dùng chọn "chỉ tắt nhóm mình thay thế").
  Danh sách `class` chính xác: đọc style Liberty thật lúc làm T-101 (`map.getStyle().layers`), ghi vào code một hằng.
- **Bỏ lớp `circle` + gom cụm.** Thay bằng 3 lớp `symbol` trên cùng nguồn:
  1. `poi-dot` — quán có `minzoom ≤ zoom + 2` nhưng chưa tới `minzoom`: **chấm nhỏ không chữ** (ảnh `dot-{category}`
     ~7px), `icon-allow-overlap` + `icon-ignore-placement` (không chiếm chỗ của chữ). Người dùng chọn "chỉ hiện chấm nhỏ".
     Không hiện dưới z14.
  2. `poi-icon` — `zoom ≥ minzoom`: vòng tròn màu loại ~22px + icon trắng theo `kind`, tên bên cạnh.
     `text-field: name`, Noto Sans (glyph OpenFreeMap, đủ dấu Việt) cỡ 12 (13 từ z16), màu = màu loại đậm, halo màu nền 1,5px,
     `text-max-width: 8`, `text-variable-anchor: [right, left, top, bottom]` + `text-radial-offset`, **`text-optional: true`**
     (chật thì bỏ chữ giữ icon), `symbol-sort-key: -score` (chật thì quán điểm cao thắng). Lớp này nằm trên mọi lớp nền
     nên MapLibre đặt chữ của mình trước, tên đường nhường chỗ.
  3. `poi-selected` — quán đang chọn: ghim to (giọt nước màu loại + icon), luôn hiện, tên đậm, `*-allow-overlap`.
- **Luôn hiện, bỏ qua `minzoom`:** quán đã thêm vào phòng (`RoomPlacesLayer` — giữ như hiện tại, nằm trên cùng), quán đang
  chọn, và các chi nhánh khi bấm "Xem N chi nhánh" (T-102, filter tạm theo `brand_key`).
- Ảnh icon dựng lúc chạy: SVG Phosphor → canvas → `map.addImage(id, img, {pixelRatio: 2})`; đổi theme sáng/tối thì dựng lại
  (như `getDynamicCategoryColors()`). Vùng bấm = cả icon (lớn hơn chấm cũ).
- Phác hoạ:
```
 z14 (xa)            z15–16                          đang chọn / z17+
   ·  chấm nhỏ        (☕) Phúc Long                    ┌───┐
   ·                  (🍴) Cơm Tấm Ba Ghiền              │ ☕ │ Phúc Long Coffee & Tea
                      ↑ vòng màu loại + icon trắng      └─▼─┘
```

## 5. Ô tìm kiếm kiểu Google Maps
- Mỗi dòng: icon kind · **tên** (phần khớp in đậm) · dòng phụ xám `address` (rút gọn "số + đường, quận") hoặc `district`
  · khoảng cách + "Đang mở / Đã đóng" nếu có giờ.
- Bàn phím: ↑/↓/Enter/Esc; ưu tiên khung bản đồ đang xem (giữ tham số `lat,lng`).
- (T-102) Dòng đầu "**Phúc Long** · Xem 183 chi nhánh" khi ≥ 3 quán cùng `brand_key` khớp truy vấn → bấm: bản đồ hiện mọi
  chi nhánh, `fitBounds`, danh sách xếp gần → xa. Dưới đó 3–4 chi nhánh gần nhất.
- Xếp hạng backend: độ khớp tên (như hiện tại) → `score` → khoảng cách (khoảng cách thắng `score` khi chênh > 3 km).

## 6. Kiến trúc theo bước
| Bước | Task | Đợt | Nội dung |
| :-: | :-: | :-: | :--- |
| A | T-100 | MVP | Script `build_places.py` (Overture DuckDB + Overpass, gộp, kind/score/minzoom/district/brand) → snapshot mới; backend đọc trường mới, `PoiResponse` thêm trường (CR-17 A), `in_bbox` xếp theo `score` giảm dần; ô tìm có dòng phụ + bàn phím. |
| B | T-101 | MVP nếu kịp | Lớp bản đồ §4 (ẩn `poi` nền theo class, 3 lớp symbol, icon + tên, bỏ gom cụm). Vẫn tải theo bbox (đã xếp theo score nên `limit` giữ đúng quán nổi bật). |
| C | T-102 | sau MVP | Tìm trong Postgres (`pg_trgm` + `unaccent`, bảng `pois` nạp từ snapshot lúc deploy); endpoint chuỗi `brands` (CR-17 B); dòng "Xem N chi nhánh". |
| D | T-103 | sau MVP | Nguồn bản đồ tĩnh cả TP: thử trước **một file GeoJSON rút gọn** (`id,n,k,c,z,s` ≈ 1,5 MB nén) cho MapLibre tự cắt tile trong worker — bỏ tải theo bbox; nếu đo trên máy yếu chậm (> 1,5 s hoặc khựng) thì chuyển **PMTiles** (`tippecanoe`, mỗi điểm `tippecanoe.minzoom`). |

RAM: ≈ 39k bản ghi (+ OSM bù) trong RAM ở bước A — dùng `@dataclass(slots=True)`, đo RSS (Render free 512 MB, mục tiêu < 250 MB).

## 7. Đã chốt với người dùng (2026-11-15)
1. Mall / siêu thị / rạp / công viên **được thêm vào phòng và bình chọn** như quán ăn (enum đã có, hoà phiếu tính theo từng
   loại nên không vỡ OMP).
2. Ngưỡng tin cậy Overture: **≥ 0,7**.
3. Chỉ ẩn POI nền nhóm mình thay thế; quán chưa tới `minzoom` hiện chấm nhỏ không chữ.

## 8. Đã làm ở T-100 (2026-11-15) — chi tiết lệch/bổ sung so với §3, §5
- **Kind Overture**: xét `taxonomy.primary` trước `basic_category` (bakery, ice_cream_shop, bubble_tea_shop, karaoke_venue,
  pool_billiards, grocery_store…). `grocery_store` → `supermarket` (Bách Hoá Xanh/Co.op nằm ở đây). Tên có "karaoke" luôn là
  `karaoke`. **Không lấy** `historic_site` (mẫu thử ra chung cư) và `warehouse_club_store` (toàn kho/công ty). Bảng: `osm_mapping.py`.
- **Gộp trùng**: thêm điều kiện **cùng category** (quán trong mall không bị gộp vào mall) và luật "tên này là tiền tố của tên
  kia (≥ 4 ký tự), < 50 m" ("Phúc Long" ↔ "Phúc Long - Lê Lợi"). Hai id OSM gộp vào một quán → id sau thành `aliases`.
- **Điểm OSM-only**: dùng `confidence` giả định 0,6 (`OSM_ONLY_CONF`). "khớp OSM" (+8) chỉ tính khi có cả hai nguồn.
- **district**: tâm khu vực gần nhất trong 5 km; xa hơn (Biên Hoà, Thủ Dầu Một, Tân An — bbox HCM rộng hơn TP cũ) thì lấy
  `locality` của Overture bỏ tiền tố "Quận/Huyện/Thành phố".
- **OSM không cắt theo bbox** (lấy cả vùng ISO) để giữ mọi id của snapshot cũ; quán cũ đã mất khỏi OSM nằm ở mục `retired`.
- **Xếp hạng tìm** (§5): gộp "trùng khít / đầu tên / đủ từ" thành một tầng — nếu không, quán tên đúng "Highlands" ở Hà Nội
  đứng trên "Highlands Coffee" cách 400 m. Thứ tự: tầng khớp → dải 3 km (`floor(km/3)`) → `score` → km.
- Chưa làm ở T-100: "Đang mở / Đã đóng" trong dòng kết quả; icon theo `kind` (cần thêm icon vào `Icon.tsx`, để T-101).

## 9. Đã làm ở T-101 (2026-11-15) — lớp bản đồ §4
- **Class POI nền đọc từ tile thật** (OpenFreeMap `planet/20261101`, 6 điểm × 9 tile z14: Q1, Q3, Thủ Đức, Q7, Tân Bình,
  Hoàn Kiếm). Liberty có 4 lớp `source-layer = poi`: `poi_r1` (z15), `poi_r7` (z16), `poi_r20` (z17), `poi_transit`. Ẩn
  (`BASEMAP_HIDDEN_POI_*` trong `PoiLayer.ts`): class `restaurant, fast_food, cafe, bar, beer, ice_cream, bakery, cinema, park,
  museum, theme_park, water_park` + subclass `mall, department_store, supermarket, coffee, tea, beverages, pastry, gallery,
  arts_centre, karaoke(_box), bowling_alley, amusement_arcade, escape_game`. **Giữ** `grocery/marketplace` (chợ), `theatre`
  (Nhà hát TP — mình không có kind này, lệch §4), `attraction`, `playground`, `art_gallery/artwork` (tượng), cửa hàng tiện lợi,
  bệnh viện, trường, tôn giáo, giao thông, khách sạn, ngân hàng. Nối vào filter gốc bằng `['all', gốc, giữ]`, mỗi lớp một lần
  (`hideBasemapPois`); style raster dự phòng không có lớp nào để ẩn.
- **Ba lớp symbol** (`poi-dot`, `poi-icon`, `poi-selected`) trên nguồn GeoJSON không gom cụm; lọc theo `["zoom"]` so với
  `minzoom` của quán (MapLibre đánh giá filter ở zoom nguyên). Quán thiếu `minzoom`/`kind` (snapshot cũ) → z17 + icon theo
  category. Chữ: Noto Sans **Bold** (Regular mảnh quá trên nền đường vàng), 12 → 13 từ z16.
- **Ảnh icon**: path Phosphor bản `fill` chép vào `poiIcons.ts`, vẽ bằng `Path2D` (đồng bộ, không cần react-dom/server);
  vòng màu loại + glyph/viền màu `surface` (trắng ở theme sáng, nâu tối ở theme tối — luôn tương phản với màu loại). 51 ảnh
  (15 kind + 7 category × icon/ghim, 7 chấm); đổi theme → `updateImage`.
- **Bấm**: một handler `click` cho cả map, `queryRenderedFeatures` với vùng đệm 8 px, chọn hình gần nhất tính tới **mép**
  (icon r=11, chấm r=3,5, ghim tâm lệch lên) — bấm sát chấm cạnh icon vẫn ra chấm; bấm trúng ghim quán của phòng thì nhường
  (`yieldTo`). Kiểm thật bằng chuột CDP: icon z16, chấm z15 desktop, chấm 390px — đều mở thẻ quán.
- **Lưới/N §3.3 giữ nguyên**: ảnh thật khung 650×740 (desktop) có z13 Q1 28 icon / Thủ Đức 20; z15 50 / 32 icon + ~320 / 420
  chấm; z17 32 / 18 icon (va chạm tự lọc). Không quá dày hay trống. Ảnh: `docs/phase7/screens/map-poi/` (24 ô
  {q1, thuduc} × {z13, z15, z17} × {light, dark} × {desktop, 390} + 2 ảnh ghim đang chọn z16).
- **Lỗi dữ liệu thấy trên ảnh** → task riêng **T-104** (`tasks/T-104.md`): "Vincom Center Đồng Khởi" (Overture, website lạ) nằm ở
  Thủ Đức; 847/1 441 quán `supermarket` có tên không phải siêu thị (Circle K, cafe, đặc sản, công ty — từ `grocery_store`); mall trùng.
- **Theme tối — người dùng chốt "giữ trắng" (2026-11-15)**: nền Liberty không đổi theo theme, nên lớp quán luôn dùng bảng màu sáng
  (`MAP_COLORS` trong `PoiLayer.ts`: `CATEGORY_COLORS` đậm, glyph + viền chữ `#FFFFFF`) ở cả hai theme; không dựng lại ảnh khi đổi
  theme (lệch §4 "đổi theme thì dựng lại"). Ảnh `*-dark-*` đã chụp lại.

## 10. Đã làm ở T-104 (2026-11-15) — làm sạch dữ liệu quán
Làm bằng **luật trong code**, dựng lại snapshot từ cache Overture `2026-10-21.0` + Overpass (cùng nguồn T-100). Không vá tay từng quán;
`scripts/places_overrides.json` (`drop`/`kind`/`move`, mỗi mục có lý do) hiện **rỗng** — chưa có ca nào luật không bắt được.
- **Loại** (`osm_mapping.py`): `grocery_store`/`organic_grocery_store`/OSM `shop=supermarket` chỉ là `supermarket` khi tên khớp chuỗi
  siêu thị (Co.op, Bách Hoá Xanh, WinMart/VinMart, Lotte Mart, AEON, GO!, Big C, Emart, MM Mega, Kingfood, Satra, Annam, Nam An, Tops,
  Finelife…) hoặc có "siêu thị / …mart / …market" mà không phải cửa hàng chuyên doanh (sữa, tóc, xe máy, điện máy, shop…). Còn lại
  đổi theo tên (cà phê → `cafe`; trà/sinh tố → `tea`; mall/TTTM/plaza → `mall`; bánh → `bakery`; phở/cơm/lẩu → `restaurant`) hoặc **bỏ**.
  OSM `shop=supermarket` **không** còn được tin vô điều kiện: tên vẫn phải có dấu hiệu (nhiều tiệm tạp hoá bị gắn nhầm).
- **Bỏ ở MỌI kind** (`is_excluded`): cửa hàng tiện lợi (Circle K, FamilyMart, Ministop, GS25, 7-Eleven, B's mart, "Cửa hàng tiện lợi"),
  công ty/TNHH, điện máy, viễn thông, bảo hiểm, ngân hàng/ATM, đại lý, showroom, nhà phân phối, nghĩa trang, bãi đỗ xe, chung cư/nhà đất.
  Chợ truyền thống bỏ ở kind mall/supermarket.
- **Mốc lớn phải "ra dáng"** (`LANDMARK_NAME` + `_KIND_REJECT`): mall/rạp/công viên/bảo tàng/khu vui chơi mà tên không có dấu hiệu của loại
  (hoặc có dấu hiệu loại khác: tiệm tạp hoá, lớp học, xưởng phim, nghĩa trang, Lotteria…) bị bỏ. Đây là nguồn rác lớn nhất: ~80 % "mall"
  của T-100 là tiệm tạp hoá/đại lý OSM `shop=mall`.
- **Trùng mốc lớn** (`places_clean.merge_landmarks`): cùng kind + < 150 m + chung ≥ 2 từ có nghĩa (bỏ TTTM/Trung tâm thương mại, cắt tên ở
  dấu phẩy đầu, "megamall" = "mega mall", sai chính tả crescent/aeon/vincom được chuẩn hoá); tên này nằm trọn trong tên kia → nới 400 m
  (trừ rạp: hai cụm CGV cách 300 m là hai rạp); cùng thương hiệu < 60 m ("Parkson Vietnam" + "Parkson Saigon Tourist"). Người thắng: có OSM
  → điểm cao; id người thua vào `aliases`. Tenant ("Nhà Sách Văn Lang - Pearl Plaza", "C Club at Crescent Mall") bị bỏ nếu mall mẹ có trong 700 m.
  Mall/rạp **chỉ của Overture** mang tên viết sai thương hiệu mà không nằm cạnh mall thật ("Crensent Mall" ở Q3) bị bỏ.
- **Sai vị trí** (`places_clean.position_flags`): (a) tên/địa chỉ nhắc quận X nhưng quán cách tâm X > bán kính (mall/rạp: bán kính quận;
  quán thường: ≥ 12 km và gấp đôi bán kính; huyện rộng như Bình Chánh/Củ Chi dùng 20 km vì tâm hộp bao không đại diện);
  (b) mall/rạp "thương hiệu + địa danh" mà địa danh được ≥ 5 quán khác nhắc tới ở cụm cách 2,5–25 km và quanh mốc không có quán nào nhắc.
  **Bỏ tự động chỉ khi** là mall/rạp của riêng Overture (không khớp OSM); còn lại chỉ in báo cáo (`audit_places.py`). Phát hiện (b) này bắt
  được "Vincom Center Đồng Khởi" (Thủ Đức, cách cụm "Đồng Khởi" Q1 11,5 km) và "MM Mega Market Bình Phú" (Q12, địa chỉ ghi Bình Phú Q6).
- **Id**: `retired` giờ gồm mọi id của snapshot `pois_*` cũ **và** `places_*` hiện có (kể cả `retired` của nó) không còn ở bản mới; alias của
  quán cũ đã bị bỏ cũng thành một bản ghi retired. Kiểm bằng so tập id: HCM 46 940 id cũ, HN 27 342 — **0 id không tra được** (osm:* cũ 6 697 / 4 215, thiếu 0).
- **Công cụ**: `scripts/audit_places.py` (chạy lại sau mỗi build; `--cache-dir` thêm bảng kind ← taxonomy Overture), `scripts/places_clean.py`.

### Số đo trước → sau (`audit_places.py`, cùng seed)
| | HCM trước | HCM sau | HN trước | HN sau |
| :--- | --: | --: | --: | --: |
| tổng quán | 46 821 | 44 226 | 27 268 | 25 772 |
| supermarket | 1 441 | 476 | 1 051 | 416 |
| mall | 1 033 | 159 | 452 | 109 |
| cinema | 161 | 97 | 120 | 68 |
| park | 661 | 416 | 432 | 274 |
| museum | 246 | 93 | 236 | 101 |
| tiện lợi/công ty/điện máy còn ở mọi kind | 453 | **0** | 300 | **0** |
| tên không khớp mẫu kind: supermarket / mall (đếm) | 828 / 823 | 2 / 14 | 578 / 324 | 1 / 11 |
| cờ vị trí (còn lại, chỉ báo cáo) | 127 | 105 | 38 | 30 |
| cặp mốc lớn gần nhau trùng tên | 204 | 11 | 169 | 19 |
| mall theo hãng: vincom / aeon / lotte / crescent | 23 / 6 / 17 / 4 | 17 / 4 / 10 / 1 | 19 / 6 / 10 / – | 13 / 4 / 4 / – |
- Số quán HCM giảm 2 595 (5,5 %): ~1 000 supermarket + ~870 mall + còn lại là tiệm/đại lý/tenant, gộp mốc 119, bỏ 5 sai vị trí, 11 tên sai thương hiệu.
- **Mẫu ngẫu nhiên 100 `supermarket` HCM** (seed 104/105, đọc bằng mắt): lần 1 sai 2 ("Siêu thị go Tuyển Dụng", "Kệ Siêu Thị Giá Rẻ"), lần 2 sai 2
  ("Cửa Hàng Tiện Lợi Shop&Go!", "AEON Mail Bình Dương" — là mall viết sai). Cả bốn đã thêm luật (tuyển dụng, kệ siêu thị, cửa hàng tiện lợi) → **≥ 97 % đúng**,
  0 cửa hàng tiện lợi. Tên mẫu: WinMart, Co.opmart Hóc Môn, Bách Hóa Xanh, Kingfoodmart Nguyễn Thị Định, Tops Market An Phú, Big C, AEON Nguyễn Văn Linh, Satra Foods, Metro Cash and Carry, MM Mega Market…
- **Mẫu ≥ 50/kind** (mall, cinema, museum, park, play, karaoke, dessert, bakery): trước khi lọc, `play` sai ~12 % (tiệm, kho, "Khu đô thị"), `park` ~8 %
  (nghĩa trang, ga metro, nhà đất), `museum` ~25 % (lớp nhạc/vẽ, tattoo studio), `cinema` ~10 % (xưởng phim, cà phê phim), `dessert`/`bakery` ~4 % (đại lý gas,
  khuôn bánh). Sau khi thêm luật theo kind: mẫu mới còn lỗi lẻ (≈ 2–4 %): vài công viên mang tên đường, đền/chùa ở kind museum (vẫn là điểm tham quan).
- Tìm vẫn đúng: "phuc long" (Phuc Long Coffee & Tea…), "vincom" (Vincom Plaza Ba Tháng Hai, Vincom Center…), "bach hoa xanh" (Bách Hóa Xanh…), "crescent" (Crescent Mall), "aeon".
- **RSS backend** không tăng: `PoiService()` nạp 74 089 → 70 010 bản ghi, maxrss 215 → 214 MB, nạp 1,16 → 1,15 s.
- Ảnh bản đồ chụp lại: `docs/phase7/screens/map-poi-t104/` (Thủ Đức z15 {sáng, tối, 390 px} — không còn mall nào ở chỗ cũ; Q1 z13 {sáng, tối, 390 px}). Cần nhìn lại bằng mắt người trước G2.
- **Còn lại / chưa làm**: 105 cờ HCM + 30 HN (mốc nhiều nơi trùng tên, phường trùng tên quận) chỉ là báo cáo — chưa duyệt từng cái; "Vincom Mega Mall" (OSM, 10,8434/106,8428) và
  "Vincom Grand Park Quận 9" (Overture, 10,8388/106,8298) cách 1,4 km nhưng có thể là một mall — chưa gộp vì chưa kiểm vị trí thật; "GO An Lạc" ≈ "BigC An Lạc" (đổi tên) chưa gộp.
  Chạy lại `build_places.py` phải kèm `--cache-dir` có parquet cũ (hoặc tải lại ~140 MB).
