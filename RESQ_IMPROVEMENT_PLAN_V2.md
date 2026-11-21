# ResQ — Kế hoạch cải tiến v2 (sau khi đối chiếu dữ liệu thật)

> Nâng cấp từ `RESQ_IMPROVEMENT_PLAN.md` (v1). v1 giữ nguyên để đối chiếu.
> Ngày 21/11/2026 · Phạm vi: `resq-mobile` + `server` · Dùng nội bộ (bảo mật ở mức tối thiểu theo yêu cầu).

## 0. Kết luận ngắn

v1 **đúng hướng về kiến trúc** (một nguồn sự thật, Goong REST chỉ ở server, `RouteTracker` thuần TS, tách GPS theo màn).
Nhưng v1 coi **dữ liệu địa điểm là bài toán ETL** ("cào → chuẩn hoá → lưu → hiển thị theo khoảng cách"). Khi chạy thật
trên Hà Nội, đó lại là bài toán **chất lượng dữ liệu và xếp hạng** — và cả hai đều quyết định trực tiếp việc khách
đang gặp nạn có gọi đúng người hay không.

| Hạng mục | v1 | v2 (đã kiểm chứng bằng dữ liệu thật) |
|---|---|---|
| Giá Apify | ~$1,5/1.000 chỗ | **$4/1.000 chỗ** (gói FREE, pay-per-event). Lấy thêm ảnh kéo theo phí *place-details* **$2/1.000** + $0,5/ảnh. Ảnh đại diện **miễn phí** trong kết quả tìm kiếm. |
| Độ chính xác | Lọc polygon + đã đóng cửa | **Bộ chấm độ tin cậy** cho từng listing + phát hiện **mạng listing spam** ở mức tập dữ liệu (§2) |
| Xếp hạng | Sắp xếp theo khoảng cách, ETA = khoảng cách × 25 km/h | **Điểm đa tiêu chí có giải thích**: ETA theo giờ cao điểm → ETA thật Goong cho top 10, đúng dịch vụ, đang mở cửa, Bayes rating, độ tin cậy (§3) |
| Chiều ngược lại | Không có | **Gara → khách**: xếp đơn đang chờ quanh gara theo ETA gara→khách, SOS, thời gian chờ (§3.4) |
| Ảnh | Không có | Tải ảnh **một lần**, thu nhỏ WebP, lưu trong repo, phục vụ qua `/media/places/` (§4) |
| Lưu trữ địa điểm | Bảng SQLite `places` | **File có version `seed/places.json`** + chỉ mục lưới trong RAM. Lý do: Render free **xoá ổ đĩa mỗi lần khởi động** — bảng SQLite sẽ mất sau 15 phút server ngủ. |
| Playwright để giữ ảnh | Đề xuất | **Không cần**: URL ảnh là file CDN trực tiếp, `fetch` tải được. Playwright chỉ thêm độ nặng và rủi ro bị chặn. |

## 1. Những gì dữ liệu thật cho thấy (lần cào thử Thanh Xuân / Ba Đình)

- 2/3 kết quả đầu cho "gara ô tô Thanh Xuân" là **listing cò mồi**: tên nhồi từ khoá ("Gara Ô Tô **Gần Đây** - Minh Tâm Auto"), địa chỉ là **dãy số** (`334295603`), 0 đánh giá, "lưu động".
- **Một thương hiệu đăng 5 listing** với tên biến thể ("Gần Đây", "Gần Nhất", "Lưu Động", "Quận Ba Đình") để phủ bản đồ.
- **14/27** kết quả "gara ô tô" thực chất là **sửa / cứu hộ xe máy** — một app cứu hộ ô tô không được gửi khách tới đó.
- Ảnh đại diện có thể là **ảnh Street View** (mặt tiền thật) hoặc ảnh chủ đăng; một số URL khi đổi tham số kích thước trả về **ảnh giữ chỗ** giống hệt nhau → phải phát hiện bằng hash.
- Giờ mở cửa thật có đủ dạng: `07:00 to 23:30`, `Mở cửa cả ngày`, `Đóng cửa`, ca chia đôi, ca qua đêm.

→ Không có bước chất lượng, khoảng 1/3 danh sách gara là thông tin sai/không phù hợp.

## 2. Pipeline dữ liệu (đã cài đặt)

```
Apify (Google Maps Scraper)          seed/raw/*.json  ← lưu NGUYÊN dữ liệu thô: xử lý lại miễn phí
   │  scripts/apify-crawl.ts             │
   │  - ước tính chi phí + chặn nếu vượt credit còn lại
   │  - cào theo 12 quận (Google trả dồn về trung tâm nếu cào cả thành phố)
   ▼
scripts/build-places.ts
   1. normalizeRaw: Hà Nội (bbox + địa chỉ), bỏ đã đóng cửa, phân nhóm, loại xe máy, dịch vụ, giờ mở cửa
   2. assessQuality: confidence 0..1 + lý do (flags)
   3. dedupePlaces: placeId → cùng SĐT ≤ 300 m → tên giống ≥ 0,85 ≤ 60 m (gộp dịch vụ + ảnh)
   4. collapseListingNetworks: thương hiệu ≥ 3 listing → phạt −0,15 và giữ 1 listing / 3 km
   5. ảnh: tải → kiểm tra kích thước → WebP ≤ 720 px q62 (~30 KB) → loại ảnh giữ chỗ (hash trùng ở ≥ 2 nơi)
   ▼
seed/places.json + seed/place-images/*.webp   (commit vào repo → chạy được trên Render free)
```

**Độ tin cậy** (`server/src/places.ts › assessQuality`):

| Tín hiệu | Ảnh hưởng |
|---|---|
| ≥ 100 / ≥ 20 / ≥ 5 đánh giá; 0 đánh giá | +0,25 / +0,18 / +0,08; −0,18 |
| Tên nhồi ≥ 4 từ khoá dịch vụ | −0,20 |
| Tên quảng cáo ("gần đây", "24/7", "lưu động", "giá rẻ", số điện thoại trong tên) | −0,15 |
| Địa chỉ là dãy số / plus code; có tên phố | −0,20; +0,08 |
| Có SĐT; gara không có SĐT | +0,05; −0,10 |
| Chưa xác minh doanh nghiệp | −0,05 |
| Chuỗi lớn (Petrolimex, PVOIL, VinFast, hãng xe) | +0,10 |

`trust = high (≥ 0,7) · medium (≥ 0,45) · low`. Mặc định **ẩn `low`**; khách có thể bật xem với nhãn "Thông tin chưa xác minh — gọi điện xác nhận trước".

## 3. Thuật toán ghép vị trí (đã cài đặt + test)

### 3.1. Chỉ mục không gian
Lưới ô 1 km (`GridIndex`). Truy vấn bán kính chỉ xét các ô giao vòng tròn rồi tính haversine chính xác;
KNN mở rộng bán kính 1 → 2 → 4 … km tới khi đủ k. Với 10³–10⁴ điểm: < 1 ms/truy vấn, không cần PostGIS.

### 3.2. ETA
```
ETA_ước_tính = 1,5' + (khoảng cách × 1,35 [hệ số đường bộ nội đô]) / v(giờ)
v = 14 km/h (7–9h, 16:30–19h ngày thường) · 24 km/h (ban ngày) · 32 km/h (22h–5h)   — giờ Việt Nam
```
Top 10 ứng viên được thay bằng **ETA thật Goong DistanceMatrix** (`refine=1`, cache 10 phút theo lưới ~110 m).
App hiển thị ngay ETA ước tính, rồi cập nhật ETA thật ở nền.

### 3.3. Điểm xếp hạng khách → địa điểm
```
score = 0,42·e^(−ETA/15)            ETA 5' → 0,72 · 15' → 0,37 · 30' → 0,14
      + 0,20·đúng_dịch_vụ           có đúng dịch vụ 1 · gara chung 0,45
      + 0,16·mở_cửa                 mở 1 · sắp đóng 0,55 · chưa rõ 0,5 · đóng 0 (cứu hộ kéo xe: 0,35)
      + 0,10·(Bayes(rating) − 3)/2  Bayes = (4,0·15 + r·n)/(15 + n) — 4,9★/3 lượt < 4,6★/800 lượt
      + 0,12·confidence
```
Mỗi kết quả trả kèm `reasons` ("1,2 km · ~6 phút", "Có dịch vụ lốp", "Mở cửa 24 giờ", "★4,6 (230)") và `breakdown`.

### 3.4. Chiều ngược lại: địa điểm → khách
`GET /api/places/:id/orders` (tài xế / admin) và `GET /api/admin/orders/:id/places`:
```
score = 0,45·e^(−ETA_gara→khách/15) + 0,25·SOS + 0,20·min(1, phút_chờ/20) + 0,10·gara_có_dịch_vụ
```
ETA luôn tính theo **chiều gara → khách** (đường một chiều làm hai chiều khác nhau).

### 3.5. API
| Endpoint | Ai | Ghi chú |
|---|---|---|
| `GET /api/places/nearby?lat&lng&category&issue&radiusM&openNow&q&minTrust&refine` | mọi vai trò | xếp hạng + lý do |
| `GET /api/places/:id` | mọi vai trò | chi tiết + ảnh + giờ mở cửa |
| `GET /api/places/:id/orders` | tài xế, admin | gara → khách |
| `GET /api/admin/orders/:id/places` | admin | gara phù hợp cho một đơn |
| `GET /api/places/meta` | mọi vai trò | số lượng theo nhóm, thời điểm dữ liệu |
| `GET /media/places/<hash>-<n>.webp` | công khai | cache 30 ngày, tên file chống đoán đường dẫn |

## 4. Ảnh
- Đợt cào chính chỉ lấy **ảnh đại diện miễn phí**. Ảnh bổ sung (tối đa 3) chỉ mua cho **top gara tin cậy cao**
  bằng lượt cào theo `placeIds` (~$0,0075/chỗ) — tiêu tiền đúng chỗ khách hay xem.
- Ảnh lưu trong repo (~30 KB/ảnh). Nếu vượt ~50 MB: chuyển sang object storage (Cloudflare R2 free 10 GB) — chỉ đổi `serveImage`.

## 5. App (đã cài đặt)
- `GarageList`: GPS thật (không còn R6/mock), 2 tab *Gara sửa chữa* / *Cứu hộ kéo xe*, sắp xếp *Phù hợp nhất / Gần nhất / Đánh giá cao*, lọc *Đang mở*, nút "để tổng đài điều phối".
- `PlaceDetail` (mới): ảnh vuốt ngang, giờ mở cửa, dịch vụ, gọi / chỉ đường / yêu cầu hỗ trợ, cảnh báo listing chưa xác minh.
- `ReMaps`: bản đồ Goong thật + chấm vị trí + vòng sai số + marker đánh số theo hạng (4 nhóm), chạm marker ↔ nổi bật thẻ, tìm theo tên.
- `RescueRequest`: ghi đơn vị khách chọn vào đơn → điều phối thấy ngay.
- Admin: ngăn chi tiết đơn có "Gara phù hợp gần khách" (ảnh + lý do + nút gọi).

## 6. Việc còn lại (theo thứ tự giá trị)

| # | Việc | Vì sao | Công |
|---|---|---|---|
| 1 | Cào ảnh bổ sung cho top ~120 gara tin cậy cao | Khách xem ảnh nhiều nhất ở đây | 0,5 ngày, ~$0,9 |
| 2 | Vòng phản hồi: nút "Báo sai thông tin" → `place_feedback` → admin ẩn/sửa | Dữ liệu tự tốt dần; chặn cò mồi lọt lưới | 1 ngày |
| 3 | Học ETA từ chuyến thật: so `track_points` với ETA dự đoán → hiệu chỉnh `roadFactor`, tốc độ theo giờ/quận | ETA là tiêu chí nặng nhất | 1–2 ngày |
| 4 | Header vị trí thật (`LocationProvider`), Home bỏ "Hội viên/Khám phá", `Membership` (v1 §3.1–3.3) | Như v1 — vẫn đúng | 2–3 ngày |
| 5 | Gara đối tác: cờ `verified` do admin bật, ưu tiên +0,1 | Lớp dữ liệu chất lượng cao không phụ thuộc Google | 1 ngày |
| 6 | Làm mới dữ liệu mỗi 30 ngày (lượt cào theo `placeIds` cho chỗ đã có + 1 lượt khám phá) | Giờ mở cửa / đóng cửa thay đổi | script có sẵn |

## 7. Chỉ số theo dõi
- **Tỉ lệ gọi thành công** tới gara top 3 (khách bấm Gọi → không quay lại đổi gara trong 5 phút).
- **Sai số ETA** P50/P90 (dự đoán vs. thực tế từ `track_points`).
- **Tỉ lệ listing `low`** trong top 10 (mục tiêu 0 khi `minTrust` mặc định).
- **Chi phí dữ liệu/tháng** (Apify) và **request Goong/ngày**.

## 8. Chạy lại toàn bộ dữ liệu
```bash
cd server
npm run crawl -- --plan scripts/crawl-plan.json --dry            # xem ước tính chi phí
npm run crawl -- --plan scripts/crawl-plan.json --skip-existing  # chỉ cào lượt còn thiếu
npm run build-places                                             # chuẩn hoá + ảnh (chạy lại miễn phí)
npm test
```
