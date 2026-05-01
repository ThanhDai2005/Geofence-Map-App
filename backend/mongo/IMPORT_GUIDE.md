# Hướng dẫn Import MongoDB Database

## Bước 1: Chuẩn bị

Đảm bảo bạn đã cài đặt MongoDB Database Tools:
- Download tại: https://www.mongodb.com/try/download/database-tools
- Hoặc cài qua package manager:
  ```bash
  # Windows (chocolatey)
  choco install mongodb-database-tools
  
  # macOS
  brew install mongodb-database-tools
  
  # Linux
  sudo apt-get install mongodb-database-tools
  ```

## Bước 2: Import tất cả collections vào MongoDB Atlas

Mở terminal/command prompt và chạy các lệnh sau:

### Connection String
```
mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel
```

### Import từng collection

```bash
# Di chuyển vào thư mục mongo
cd backend/mongo

# Import Users
mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=users --file=vngo_travel.users.json --jsonArray

# Import Zones
mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=zones --file=vngo_travel.zones.json --jsonArray

# Import POIs
mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=pois --file=vngo_travel.pois.json --jsonArray

# Import User Wallets
mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=userwallets --file=vngo_travel.userwallets.json --jsonArray

# Import User Unlock POIs
mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=userunlockpois --file=vngo_travel.userunlockpois.json --jsonArray

# Import User Unlock Zones
mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=userunlockzones --file=vngo_travel.userunlockzones.json --jsonArray

# Import Device Sessions
mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=devicesessions --file=vngo_travel.devicesessions.json --jsonArray

# Import Admin POI Audits
mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=adminpoiaudits --file=vngo_travel.adminpoiaudits.json --jsonArray

# Import POI Requests
mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=poirequests --file=vngo_travel.poirequests.json --jsonArray

# Import Translation Caches
mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=translationcaches --file=vngo_travel.translationcaches.json --jsonArray

# Import Analytics Collections
mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=uis_analytics_ingestion_cursors --file=vngo_travel.uis_analytics_ingestion_cursors.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=uis_analytics_rollups_daily --file=vngo_travel.uis_analytics_rollups_daily.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=uis_analytics_rollups_hourly --file=vngo_travel.uis_analytics_rollups_hourly.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=uis_device_profiles --file=vngo_travel.uis_device_profiles.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=uis_events_raw --file=vngo_travel.uis_events_raw.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=uis_user_profiles --file=vngo_travel.uis_user_profiles.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=uis_user_sessions --file=vngo_travel.uis_user_sessions.json --jsonArray

# Import Audio Collections
mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=audios --file=vngo_travel.audios.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=audioassets --file=vngo_travel.audioassets.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=audioqueues --file=vngo_travel.audioqueues.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=audio_play_events --file=vngo_travel.audio_play_events.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=audio_sessions --file=vngo_travel.audio_sessions.json --jsonArray

# Import Other Collections
mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=credittransactions --file=vngo_travel.credittransactions.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=events --file=vngo_travel.events.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=uis_identity_edges --file=vngo_travel.uis_identity_edges.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=languagepacks --file=vngo_travel.languagepacks.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=poichangerequests --file=vngo_travel.poichangerequests.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=poicontents --file=vngo_travel.poicontents.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=poidailystats --file=vngo_travel.poidailystats.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=poihourlystats --file=vngo_travel.poihourlystats.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=qrtokenusages --file=vngo_travel.qrtokenusages.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=revokedtokens --file=vngo_travel.revokedtokens.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=systemevents --file=vngo_travel.systemevents.json --jsonArray

mongoimport --uri="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel" --collection=zonepois --file=vngo_travel.zonepois.json --jsonArray
```

## Bước 3: Xác minh Import thành công

Sau khi import xong, kiểm tra trong MongoDB Atlas:
1. Truy cập https://cloud.mongodb.com
2. Đăng nhập vào cluster của bạn
3. Vào Collections tab
4. Kiểm tra các collections đã được import:
   - users: 4 users (admin, user, owner, levan)
   - zones: 3 zones (HCM District 1, Hanoi Old Quarter, Sapa)
   - pois: 30 POIs
   - Các collections khác

## Bước 4: Test Backend

```bash
cd backend
npm start
```

Kiểm tra API:
```bash
# Test get zones
curl http://localhost:3000/api/v1/zones

# Test get POIs
curl http://localhost:3000/api/v1/pois/nearby?lat=10.7769&lng=106.7009&radius=5000
```

## Thông tin đăng nhập test

### Admin Account
- Email: admin@vngo.com
- Password: password123
- Role: ADMIN

### User Account
- Email: user@vngo.com
- Password: password123
- Role: USER

### Owner Account
- Email: owner@vngo.com
- Password: password123
- Role: OWNER

## Lưu ý quan trọng

1. **Backup trước khi import**: Nếu database đã có dữ liệu, hãy backup trước
2. **Drop collections cũ**: Nếu muốn import lại từ đầu, drop collections cũ trước:
   ```bash
   # Trong MongoDB Atlas UI, chọn collection và click "Drop Collection"
   ```
3. **Indexes**: MongoDB sẽ tự động tạo indexes dựa trên schema khi backend chạy lần đầu
4. **Passwords**: Tất cả passwords đã được hash bằng bcrypt, password gốc là "password123"

## Troubleshooting

### Lỗi "command not found: mongoimport"
- Cài đặt MongoDB Database Tools (xem Bước 1)

### Lỗi "authentication failed"
- Kiểm tra lại connection string
- Đảm bảo IP của bạn được whitelist trong MongoDB Atlas

### Lỗi "duplicate key error"
- Collections đã có dữ liệu, drop collections cũ trước khi import

### Import chậm
- Bình thường, mỗi collection mất 1-5 giây
- Nếu quá chậm, kiểm tra kết nối internet
