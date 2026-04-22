using System;
using Microsoft.Maui.Storage;

namespace MauiApp1.Services;

/// <summary>
/// Quản lý giới hạn số lần quét QR dựa trên trạng thái đăng nhập và premium.
/// - Chưa đăng nhập: 10 lần
/// - Đã đăng nhập: 20 lần
/// - Premium: không giới hạn
/// </summary>
public class QrScanLimitService
{
    private const string KeyScanCount = "qr_scan_count";
    private const string KeyLastResetDate = "qr_scan_last_reset";

    private const int LimitGuest = 10;
    private const int LimitAuthenticated = 20;

    private readonly AuthService _auth;

    public QrScanLimitService(AuthService auth)
    {
        _auth = auth;
    }

    /// <summary>Kiểm tra xem có thể quét QR không.</summary>
    public bool CanScan()
    {
        // Premium không giới hạn
        if (_auth.IsPremium)
            return true;

        ResetIfNewDay();

        var count = GetCurrentCount();
        var limit = _auth.IsAuthenticated ? LimitAuthenticated : LimitGuest;

        return count < limit;
    }

    /// <summary>Tăng số lần quét sau khi quét thành công.</summary>
    public void IncrementScanCount()
    {
        if (_auth.IsPremium)
            return; // Premium không cần đếm

        ResetIfNewDay();

        var count = GetCurrentCount();
        Preferences.Default.Set(KeyScanCount, count + 1);
    }

    /// <summary>Lấy số lần quét còn lại.</summary>
    public int GetRemainingScans()
    {
        if (_auth.IsPremium)
            return int.MaxValue;

        ResetIfNewDay();

        var count = GetCurrentCount();
        var limit = _auth.IsAuthenticated ? LimitAuthenticated : LimitGuest;

        return Math.Max(0, limit - count);
    }

    /// <summary>Lấy thông báo giới hạn.</summary>
    public string GetLimitMessage()
    {
        if (_auth.IsPremium)
            return "Premium: Không giới hạn";

        var remaining = GetRemainingScans();
        var limit = _auth.IsAuthenticated ? LimitAuthenticated : LimitGuest;

        if (_auth.IsAuthenticated)
            return $"Còn {remaining}/{limit} lần quét hôm nay";
        else
            return $"Còn {remaining}/{limit} lần quét (Đăng nhập để tăng lên 20 lần)";
    }

    /// <summary>Reset số lần quét nếu sang ngày mới.</summary>
    private void ResetIfNewDay()
    {
        var lastReset = Preferences.Default.Get(KeyLastResetDate, string.Empty);
        var today = DateTime.UtcNow.Date.ToString("yyyy-MM-dd");

        if (lastReset != today)
        {
            Preferences.Default.Set(KeyScanCount, 0);
            Preferences.Default.Set(KeyLastResetDate, today);
        }
    }

    private int GetCurrentCount()
    {
        return Preferences.Default.Get(KeyScanCount, 0);
    }

    /// <summary>Reset thủ công (dùng cho testing hoặc admin).</summary>
    public void ResetCount()
    {
        Preferences.Default.Set(KeyScanCount, 0);
        Preferences.Default.Set(KeyLastResetDate, DateTime.UtcNow.Date.ToString("yyyy-MM-dd"));
    }
}
