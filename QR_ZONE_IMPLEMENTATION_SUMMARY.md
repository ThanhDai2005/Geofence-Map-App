# QR SCAN ZONE SYSTEM - IMPLEMENTATION SUMMARY

## Ngày: 2026-05-01

## Yêu cầu từ người dùng

Khi quét QR code:
1. ✅ Gọi API zone scan (không phải POI scan)
2. ✅ Hiển thị zone name (ví dụ: "Ho Chi Minh District 1")
3. ✅ Hiển thị bảng trắng với list các địa điểm trong zone
4. ✅ Bỏ phần focus/navigate vào POI cụ thể
5. ✅ Chỉ unlock zone (tải về tất cả POIs trong zone)
6. ✅ Không cần mua từng POI riêng lẻ

## Các thay đổi đã thực hiện

### A. Mobile App (.NET MAUI)

#### 1. Models/ZoneScanDtos.cs (MỚI)
- Tạo models cho Zone scan response:
  - `ZoneScanApiResponse` - Response envelope
  - `ZoneScanData` - Zone + POIs + Access status
  - `ZoneInfo` - Thông tin zone
  - `ZonePoiData` - Thông tin POI trong zone
  - `ZoneAccessStatus` - Trạng thái truy cập
  - `AudioInfo` - Thông tin audio

#### 2. Services/PoiEntryCoordinator.cs (SỬA)
**Thay đổi HandleSecureScanAsync():**
- Đổi endpoint: `pois/scan` → `zones/scan`
- Đổi response type: `PoiScanApiResponse` → `ZoneScanApiResponse`
- Bỏ phần focus vào POI: Xóa `_mapUi.ApplySelectedPoiByCodeAsync()`
- Đổi route: Navigate đến `/zonepois` thay vì `/poidetail` hoặc `//map`
- Pass zone code và zone name qua query params

**Thêm MergeZoneScanResultIntoLocalAsync():**
- Merge tất cả POIs từ zone scan vào local database
- Loop qua tất cả POIs trong zone
- Upsert từng POI vào local SQLite
- Register dynamic translations cho mỗi POI

#### 3. Views/ZonePoisPage.xaml (MỚI)
Tạo UI page hiển thị list POIs trong zone:
- **Header**: Zone name, description, POI count (màu xanh #2196F3)
- **POI List**: CollectionView với các POI items
  - Hiển thị: Name, Summary, Code
  - Click vào POI → Navigate đến POI detail
- **Access Frame**: Thông báo purchase (màu cam #FFF3E0)
  - Hiển thị giá zone
  - Button "Purchase Zone"
  - Ẩn nếu user đã có access
- **Loading Indicator**: Hiển thị khi đang load

#### 4. Views/ZonePoisPage.xaml.cs (MỚI)
Logic xử lý ZonePoisPage:
- `LoadZonePoisAsync()`: Load POIs từ local database
- `CheckAccessStatusAsync()`: Kiểm tra user có access zone không
- `OnPoiSelected()`: Navigate đến POI detail khi click
- `OnPurchaseClicked()`: Gọi API `POST /api/v1/purchase/zone`

#### 5. AppShell.xaml.cs (SỬA)
- Đăng ký route: `Routing.RegisterRoute("zonepois", typeof(ZonePoisPage))`

#### 6. MauiProgram.cs (SỬA)
- Đăng ký DI: `builder.Services.AddTransient<ZonePoisPage>()`

### B. Backend (Node.js/Express)

**Không cần thay đổi gì!** Backend đã có đầy đủ:
- ✅ `POST /api/v1/zones/scan` - Zone QR scan endpoint
- ✅ `POST /api/v1/purchase/zone` - Purchase zone endpoint
- ✅ `GET /api/v1/zones/:code` - Get zone info + access status
- ✅ Zone service với access control
- ✅ Credit transaction system

### C. Database (MongoDB)

#### 1. Thêm 17 collections mới (backend/mongo/)
Tạo các file JSON cho collections còn thiếu:
- `vngo_travel.audios.json`
- `vngo_travel.audioassets.json`
- `vngo_travel.audioqueues.json`
- `vngo_travel.audio_play_events.json`
- `vngo_travel.audio_sessions.json`
- `vngo_travel.credittransactions.json`
- `vngo_travel.events.json`
- `vngo_travel.uis_identity_edges.json`
- `vngo_travel.languagepacks.json`
- `vngo_travel.poichangerequests.json`
- `vngo_travel.poicontents.json`
- `vngo_travel.poidailystats.json`
- `vngo_travel.poihourlystats.json`
- `vngo_travel.qrtokenusages.json`
- `vngo_travel.revokedtokens.json`
- `vngo_travel.systemevents.json`
- `vngo_travel.zonepois.json`

**Tổng cộng: 35 collections** (trước: 18, sau: 35)

#### 2. Import Scripts
- `backend/mongo/IMPORT_GUIDE.md` - Hướng dẫn chi tiết
- `backend/mongo/import-all.sh` - Script tự động cho Linux/macOS
- `backend/mongo/import-all.bat` - Script tự động cho Windows

## Flow hoạt động mới

### 1. User quét QR code
```
User quét QR → QrScannerPage
  ↓
PoiEntryCoordinator.HandleSecureScanAsync()
  ↓
POST /api/v1/zones/scan { token }
  ↓
Backend trả về:
{
  zone: { code, name, description, price, poiCount },
  pois: [ { code, name, summary, location, ... }, ... ],
  accessStatus: { hasAccess, requiresPurchase, price }
}
```

### 2. Merge POIs vào local database
```
MergeZoneScanResultIntoLocalAsync()
  ↓
Loop qua tất cả POIs
  ↓
Upsert từng POI vào SQLite
  ↓
Register dynamic translations
```

### 3. Navigate đến ZonePoisPage
```
Navigate("/zonepois?zoneCode=XXX&zoneName=YYY&lang=vi")
  ↓
ZonePoisPage.OnNavigatedTo()
  ↓
LoadZonePoisAsync() - Load POIs từ local DB
  ↓
CheckAccessStatusAsync() - Kiểm tra access
  ↓
Hiển thị UI:
  - Header: Zone name, description
  - List: Tất cả POIs trong zone
  - Footer: Purchase button (nếu chưa có access)
```

### 4. User click POI
```
OnPoiSelected()
  ↓
Navigate("/poidetail?code=XXX&lang=vi")
  ↓
PoiDetailPage hiển thị chi tiết POI
```

### 5. User purchase zone
```
OnPurchaseClicked()
  ↓
POST /api/v1/purchase/zone { zoneCode }
  ↓
Backend:
  - Trừ credits từ wallet
  - Tạo UserUnlockZone record
  - Tạo CreditTransaction record
  - Unlock tất cả POIs trong zone
  ↓
Ẩn purchase frame
  ↓
User có thể xem tất cả POIs
```

## Điểm khác biệt so với trước

| Trước (POI-based) | Sau (Zone-based) |
|-------------------|------------------|
| Quét QR → Focus vào 1 POI | Quét QR → Hiển thị list POIs trong zone |
| Navigate đến POI detail hoặc Map | Navigate đến ZonePoisPage |
| Mua từng POI riêng lẻ | Mua cả zone (unlock tất cả POIs) |
| API: POST /api/v1/pois/scan | API: POST /api/v1/zones/scan |
| Response: 1 POI data | Response: Zone + List POIs |

## Cách test

### 1. Import database
```bash
cd backend/mongo

# Windows
import-all.bat

# Linux/macOS
chmod +x import-all.sh
./import-all.sh
```

### 2. Start backend
```bash
cd backend
npm install
npm start
```

### 3. Test API
```bash
# Get zones
curl http://localhost:3000/api/v1/zones

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@vngo.com","password":"password123"}'

# Generate zone QR token (admin only)
curl -X POST http://localhost:3000/api/v1/admin/zones/generate-qr \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"zoneId":"<zone_id>"}'

# Scan zone QR
curl -X POST http://localhost:3000/api/v1/zones/scan \
  -H "Content-Type: application/json" \
  -d '{"token":"<qr_token>"}'
```

### 4. Build mobile app
```bash
# Build Android
dotnet build -f net8.0-android

# Build iOS
dotnet build -f net8.0-ios

# Run
dotnet run
```

### 5. Test QR scan flow
1. Mở app → Tab QR
2. Quét QR code của zone
3. Xem ZonePoisPage hiển thị list POIs
4. Click vào POI → Xem detail
5. Quay lại → Click "Purchase Zone"
6. Sau khi mua → Purchase frame biến mất

## Thông tin đăng nhập

### Admin
- Email: admin@vngo.com
- Password: password123
- Credits: 1000

### User
- Email: user@vngo.com
- Password: password123
- Credits: 50

### Owner
- Email: owner@vngo.com
- Password: password123
- Credits: 100

## Zones có sẵn

1. **HO_CHI_MINH_CITY_DISTRICT_1**
   - Name: Ho Chi Minh City District 1
   - Price: 100 credits
   - POIs: 5 (Chợ Bến Thành, Nhà thờ Đức Bà, Bưu điện Trung tâm, Dinh Độc Lập, Bảo tàng Chứng tích Chiến tranh)

2. **HANOI_OLD_QUARTER**
   - Name: Hanoi Old Quarter & Hoan Kiem Lake
   - Price: 100 credits
   - POIs: 6 (Hồ Gươm, Lăng Bác, Văn Miếu, Chùa Một Cột, Phố Cổ HN, Nhà thờ Lớn HN)

3. **SAPA_MOUNTAIN_TOWN**
   - Name: Sapa Mountain Town
   - Price: 150 credits
   - POIs: 4 (Sapa, Fansipan, Cat Cat, Thác Bạc)

## Files đã tạo/sửa

### Tạo mới (7 files)
1. `Models/ZoneScanDtos.cs`
2. `Views/ZonePoisPage.xaml`
3. `Views/ZonePoisPage.xaml.cs`
4. `backend/mongo/IMPORT_GUIDE.md`
5. `backend/mongo/import-all.sh`
6. `backend/mongo/import-all.bat`
7. `backend/mongo/vngo_travel.*.json` (17 files)

### Sửa đổi (3 files)
1. `Services/PoiEntryCoordinator.cs`
2. `AppShell.xaml.cs`
3. `MauiProgram.cs`

## Kết luận

✅ Hoàn thành 100% yêu cầu:
- QR scan hiển thị zone với list POIs
- Không focus vào POI cụ thể
- Chỉ unlock zone (không mua từng POI)
- Database đầy đủ 35 collections
- Scripts tự động import
- Hướng dẫn chi tiết

Backend không cần thay đổi gì vì đã có đầy đủ API zone-based system!
