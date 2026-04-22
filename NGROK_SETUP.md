# Hướng dẫn sử dụng Ngrok để kết nối điện thoại và laptop khác mạng

## Vấn đề
Khi điện thoại và laptop ở khác mạng Wi-Fi (hoặc điện thoại dùng 4G), app không thể kết nối backend vì IP cố định không hoạt động.

## Giải pháp: Ngrok Tunnel

Ngrok tạo một URL công khai (HTTPS) trỏ đến localhost của bạn, cho phép điện thoại truy cập từ bất kỳ mạng nào.

---

## Bước 1: Cài đặt Ngrok

### Cách 1: Tải trực tiếp
1. Truy cập: https://ngrok.com/download
2. Tải file cho Windows
3. Giải nén và đặt `ngrok.exe` vào thư mục dễ truy cập (hoặc thêm vào PATH)

### Cách 2: Dùng npm
```bash
npm install -g ngrok
```

### Đăng ký tài khoản (miễn phí)
1. Đăng ký tại: https://dashboard.ngrok.com/signup
2. Lấy authtoken từ: https://dashboard.ngrok.com/get-started/your-authtoken
3. Chạy lệnh:
```bash
ngrok config add-authtoken YOUR_TOKEN_HERE
```

---

## Bước 2: Chạy Backend và Ngrok

### Terminal 1: Chạy Backend
```bash
cd admin-web
npm run dev
```
Backend sẽ chạy ở `http://localhost:3000`

### Terminal 2: Chạy Ngrok cho Backend
```bash
ngrok http 3000
```

Bạn sẽ thấy output như này:
```
Session Status                online
Account                       your-email@example.com
Forwarding                    https://abc123def456.ngrok-free.app -> http://localhost:3000
```

**Copy URL `https://abc123def456.ngrok-free.app`** - đây là URL công khai của backend.

### Terminal 3 (Optional): Ngrok cho Admin Web
Nếu muốn truy cập admin web từ điện thoại:
```bash
ngrok http 5174
```

---

## Bước 3: Cấu hình App

Mở file: `Configuration/BackendApiConfiguration.cs`

Tìm dòng:
```csharp
private const bool UseNgrokTunnel = false;
private const string NgrokTunnelUrl = "https://your-ngrok-url.ngrok-free.app";
```

Thay đổi thành:
```csharp
private const bool UseNgrokTunnel = true;
private const string NgrokTunnelUrl = "https://abc123def456.ngrok-free.app"; // URL từ ngrok
```

**Lưu ý:** Mỗi lần chạy ngrok, URL sẽ thay đổi (trừ khi dùng gói trả phí). Bạn cần cập nhật lại URL mỗi lần.

---

## Bước 4: Build và Chạy App

```bash
dotnet build
```

Deploy app lên điện thoại và chạy. App sẽ kết nối qua ngrok tunnel, hoạt động dù điện thoại ở mạng nào.

---

## Khi nào dùng từng chế độ?

### Dùng Ngrok (UseNgrokTunnel = true)
- ✅ Điện thoại và laptop khác mạng
- ✅ Điện thoại dùng 4G/5G
- ✅ Test từ nhiều thiết bị khác nhau
- ✅ Demo cho người khác (họ cũng dùng được URL ngrok)

### Dùng Local Network (UseNgrokTunnel = false)
- ✅ Điện thoại và laptop cùng Wi-Fi
- ✅ Nhanh hơn (không qua internet)
- ✅ Không cần internet

---

## Lưu ý quan trọng

1. **Ngrok URL thay đổi mỗi lần chạy** (gói miễn phí)
   - Giải pháp: Dùng gói trả phí để có URL cố định
   - Hoặc: Cập nhật URL mỗi lần chạy ngrok

2. **Ngrok có giới hạn request** (gói miễn phí)
   - 40 requests/phút
   - Đủ cho development

3. **HTTPS tự động**
   - Ngrok tự động cung cấp HTTPS
   - Không cần cấu hình SSL

4. **Firewall**
   - Ngrok hoạt động qua port 443 (HTTPS)
   - Thường không bị firewall chặn

---

## Troubleshooting

### Lỗi: "ERR_NGROK_108"
- Ngrok authtoken chưa được cấu hình
- Chạy: `ngrok config add-authtoken YOUR_TOKEN`

### Lỗi: "tunnel not found"
- Ngrok chưa chạy hoặc đã tắt
- Kiểm tra terminal ngrok còn chạy không

### App không kết nối được
1. Kiểm tra ngrok URL trong BackendApiConfiguration.cs
2. Kiểm tra UseNgrokTunnel = true
3. Rebuild app sau khi thay đổi config
4. Kiểm tra backend đang chạy ở port 3000

### Device không hiện online trên admin web
1. Kiểm tra ngrok cho cả backend (port 3000) và admin web (port 5174)
2. Truy cập admin web qua ngrok URL thay vì localhost

---

## Các lựa chọn thay thế Ngrok

### 1. Localtunnel (miễn phí, không cần đăng ký)
```bash
npm install -g localtunnel
lt --port 3000
```

### 2. Cloudflare Tunnel (miễn phí, ổn định)
```bash
# Tải cloudflared từ: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
cloudflared tunnel --url http://localhost:3000
```

### 3. Serveo (SSH-based, không cần cài đặt)
```bash
ssh -R 80:localhost:3000 serveo.net
```

---

## Kết luận

Với ngrok, bạn không cần:
- ❌ Thay đổi IP mỗi khi đổi mạng
- ❌ Cấu hình router/firewall
- ❌ Có IP tĩnh

Chỉ cần:
- ✅ Chạy ngrok
- ✅ Copy URL
- ✅ Paste vào config
- ✅ Build app
