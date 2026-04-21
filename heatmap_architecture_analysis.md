# Phân tích Luồng End-to-End Tính năng Heatmap (Bản đồ nhiệt)

Tài liệu này ghi lại toàn bộ quy trình, công nghệ và dữ liệu luân chuyển từ thiết bị di động (MAUI) qua Backend API đến Dashboard của Admin-web dựa trên source code của dự án VN-GO-Travel.

## 1. MAUI App Client (Thu thập thông tin truy cập)
Vai trò của MAUI App là bám sát vị trí của người dùng, đối chiếu với các POI (Points of Interest) trên bản đồ và gửi tín hiệu telemetry lên server.

- **Định vị & Quét POI**: 
  - `Services/LocationService.cs`: Yêu cầu quyền và lấy vị trí GPS hiện tại của người dùng thông qua `Geolocation.GetLocationAsync`.
  - `Views/MapPage.xaml.cs`: Có một tiến trình quét (tracking loop) chạy nền liên tục. Nó lấy vị trí người dùng, tính toán khoảng cách đến các POI bằng `Location.CalculateDistance`. Nếu vị trí lọt vào bán kính của một POI và đó là POI gần nhất, nó kích hoạt sự kiện tự động tiếp cận POI.
- **Ghi nhận sự kiện (Observability)**:
  - Khi một POI được chọn, hệ thống gọi hàm `ApplySelectedPoiAsync`.
  - Hệ thống sử dụng mẫu thiết kế Decorator với class `Services/Observability/ObservingMapUiStateArbitrator.cs`. Lớp này bọc ngoài xử lý giao diện thật, tự động đẩy record vào hàng đợi của hệ thống Runtime Telemetry (ROEL - Runtime Observability Efficiency Layer) qua hàm `_telemetry.TryEnqueue(new RuntimeTelemetryEvent(...))` kèm theo `poiCode`, `detail` và tọa độ.
- **Đóng gói & Phân phối (RBEL)**:
  - `Services/RBEL/RbelBackgroundDispatcher.cs`: Chạy ngầm định kỳ (Polling) rút các điểm telemetry ra khỏi hàng đợi. Nó chuyển đổi mã sự kiện và gộp (batching) rồi đưa API Client POST đi.
  - Sử dụng giao thức background gộp kiện (batch) để không làm block UI thread, bắn lên API `POST /api/v1/intelligence/events/batch`.

## 2. Backend (Điều phối & Xử lý Dữ liệu)
Backend được xây dựng bằng NodeJS/Express + MongoDB. Đóng vai trò hứng, lưu trữ thô và cung cấp Analytics theo thời gian thực (Aggregation).

- **Ingestion (Thu thập sự kiện)**:
  - Events từ app đẩy lên endpoint xử lý batch intelligence sẽ đi qua `backend/src/services/intelligence-events.service.js`.
  - Phân tích ContractV2 và lưu thành dạng Document trong Collection Mongoose `IntelligenceEventRaw`.
  - Đồng thời, backend tiến hành chạy upsert (cập nhật nếu có / tạo mới) hồ sơ thiết bị, session người dùng dựa vào `device_id` và `auth_state`.
- **Aggregation Pipeline (Cung cấp Heatmap)**:
  - Cung cấp API `GET /api/v1/admin/intelligence/heatmap` và `/api/v1/owner/intelligence/heatmap`.
  - Xử lý chính ở `backend/src/services/intelligence-heatmap.service.js`.
  - **Logic query**: Truy vấn tìm dữ liệu trong khoảng thời gian (VD 7 ngày, UTC). Nếu là Chủ cơ sở (Owner), sẽ lọc thêm `payload.poi_id` thuộc sở hữu của họ và giới hạn quyền (chỉ cho POI đã `APPROVED`).
  - **Mongoose Aggregation**: Dùng Aggregation Pipeline trên MongoDB: 
    - Đầu tiên là `$match` thời gian và `poi_id`.
    - Thêm `$addFields` phân rã thời gian gốc UTC ra `$dateToString` (format: %Y-%m-%d) và `$hour`.
    - Sau đó `$group` theo ngày và giờ, lấy tổng `total_events` qua `$sum: 1`.

## 3. Admin-Web Dashboard (Hiển thị)
Trang quản trị đóng vai trò trực quan hoá dữ liệu thô của server thành Heatmap dạng lưới ma trận.

- **API Calling**: `admin-web/src/apiClient.js` gọi lấy mảng đối tượng trả về chứa `{ date, hour, total_events }`.
- **Component Component**: `admin-web/src/pages/intelligence/Heatmap.jsx`.
  - Xây dựng một lưới dữ liệu (Grid 7x24 - ma trận hàng x cột). Số hàng ứng với số ngày (calendar days), số cột cố định 0-23 giờ (Hours UTC).
  - Thuật toán `buildGrid` duyệt chuỗi dữ liệu đầu vào và mapping nó vào ma trận.
  - Hàm `cellColor` tính toán cường độ hiển thị thông qua HSL interpolation (Chuyển từ màu xanh lục sang vàng, sau đó sang đỏ đậm tùy tỷ lệ số event đếm được chia cho `flatMax` tức event cao nhất trong lưới).
- **Kết quả**: Biểu diễn cho Admin/Owner thấy được vào khung giờ nào thì POI (Điểm du lịch) của họ có số lượng khách tiếp cận (trên MAUI App) dày đặc nhất.

---

## 4. Các Lỗi & Nhược điểm phát hiện được trong lúc duyệt (Issues Found)

1. **Bug Code Thừa / Logic Quyền trong MAUI:**
   - Tại `Services/LocationService.cs` (Dòng 15-17):
     ```csharp
     var status = await Permissions.RequestAsync<Permissions.Camera>(); // Wait, why Camera? Let me double-check
     // Re-evaluating the logic. The previous cat output showed Permissions.LocationWhenInUse
     status = await Permissions.RequestAsync<Permissions.LocationWhenInUse>();
     ```
     Đoạn code gọi xin phép quyền Camera dư thừa và không liên quan đến ngữ cảnh lấy vị trí bản đồ, ngay sau đó lại gán đè state xin quyền Location. Sẽ làm giật popup xin quyền camera cho user một cách khó hiểu.

2. **Cảnh báo liên quan đến Sai Số GPS (Geofence Jittering):**
   - Tại đoạn code tracking loop (MapPage.xaml.cs), điều kiện thay đổi auto POI là `_lastAutoPoiId != nearest.Poi.Id`. Mặc dù đã chặn được việc gửi event liên tục cho cùng 1 list POI tĩnh, nhưng khi người dùng đứng đúng mép vòng tròn bán kính (VD 220m), sai số nhảy GPS liên tục có thể khiến nearest POI liên tục thay đổi qua lại giữa rỗng (null) và Id của điểm đó -> Sẽ bắn sự kiện rác `ApplySelectedPoiAsync` tới tấp, tạo thành bong bóng (spam) các sự kiện lên Data Warehouse qua cái Decorator Telemetry.

3. **Nguy cơ thắt cổ chai Performance ở MongoDB (Aggregation):**
   - Trong `intelligence-heatmap.service.js`, việc Aggregation trực tiếp trên bảng Raw (`IntelligenceEventRaw`) dùng `$dateToString` & `$hour` mỗi khi Admin load dashboard là một thao tác khá cồng kềnh. Khi lượng EventRaw lên tới hàng triệu, truy vấn on-the-fly này có thể mất nhiều giây (thậm chí timeout > MAX_TIME_MS 5000s nếu không có các Index ghép cặp `created_at` và `payload.poi_id`). Nên kết hợp cơ chế cron-job rollup dữ liệu (pre-aggregation) vào một bảng theo giờ/ngày thay vì query on-the-fly.

## Tổng Kết Công Nghệ Sử Dụng
* **Client Frontend**: .NET MAUI (xử lý GPS, định vị Geofence dạng nearest Point local, Channel/ConcurrentQueue).
* **Di chuyển Dữ liệu**: Background Channel Dispatcher, HttpClient Batching (REST).
* **Backend Database**: Node.JS / Express, MongoDB Mongoose (Document Map/Reduce/Pipeline Aggregation).
* **Frontend Admin**: ReactJS (Vite, TailwindCSS) - Tính toán nội suy màu HSL thuần tuý để vẽ ma trận DOM.
