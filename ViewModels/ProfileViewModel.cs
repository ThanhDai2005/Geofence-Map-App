using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Input;
using MauiApp1.Services;
using MauiApp1.Views;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Maui.Controls;
using Microsoft.Maui.Graphics;

namespace MauiApp1.ViewModels;

public sealed class ProfileViewModel : INotifyPropertyChanged
{
    private readonly AuthService _auth;
    private readonly INavigationService _nav;
    private readonly IServiceProvider _services;
    private readonly IPremiumService _premiumService;

    public ProfileViewModel(AuthService auth, INavigationService nav, IServiceProvider services, IPremiumService premiumService)
    {
        _auth = auth;
        _nav = nav;
        _services = services;
        _premiumService = premiumService;

        LoginCommand = new Command(() => _ = OpenLoginAsync());
        LogoutCommand = new Command(() => _ = LogoutCoreAsync(), () => _auth.IsAuthenticated);
        UpgradePremiumCommand = new Command(() => _ = UpgradePremiumAsync(), () => _auth.IsAuthenticated && !_auth.IsPremium);

        _auth.SessionChanged += (_, _) => MainThread.BeginInvokeOnMainThread(RefreshFromAuth);
        _auth.PropertyChanged += (_, e) =>
        {
            if (e.PropertyName is nameof(AuthService.IsAuthenticated) or nameof(AuthService.Email)
                or nameof(AuthService.Role) or nameof(AuthService.IsPremium) or nameof(AuthService.IsOwner)
                or nameof(AuthService.IsAdmin))
                MainThread.BeginInvokeOnMainThread(RefreshFromAuth);
        };

        RefreshFromAuth();
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public string DisplayEmail => string.IsNullOrEmpty(_auth.Email) ? "Chua dang nhap" : _auth.Email;

    public string RoleDisplay => _auth.IsAuthenticated ? _auth.Role : "-";

    public string PremiumDisplay => _auth.IsAuthenticated ? (_auth.IsPremium ? "💎 Thành viên Premium" : "🌟 Tài khoản Phổ thông") : "-";

    public bool IsLoggedIn => _auth.IsAuthenticated;

    public bool IsNotLoggedIn => !_auth.IsAuthenticated;

    public bool ShowOwnerSection => _auth.IsAuthenticated && _auth.IsOwner;

    public bool ShowAdminSection => _auth.IsAuthenticated && _auth.IsAdmin;

    public bool CanUpgradePremium => _auth.IsAuthenticated && !_auth.IsPremium;

    public ICommand LoginCommand { get; }

    public ICommand LogoutCommand { get; }

    public ICommand UpgradePremiumCommand { get; }

    public void RefreshFromAuth()
    {
        OnPropertyChanged(nameof(DisplayEmail));
        OnPropertyChanged(nameof(RoleDisplay));
        OnPropertyChanged(nameof(PremiumDisplay));
        OnPropertyChanged(nameof(IsLoggedIn));
        OnPropertyChanged(nameof(IsNotLoggedIn));
        OnPropertyChanged(nameof(ShowOwnerSection));
        OnPropertyChanged(nameof(ShowAdminSection));
        OnPropertyChanged(nameof(CanUpgradePremium));
        (LogoutCommand as Command)?.ChangeCanExecute();
        (UpgradePremiumCommand as Command)?.ChangeCanExecute();
    }

    private async Task OpenLoginAsync()
    {
        var page = _services.GetRequiredService<LoginPage>();
        await _nav.PushModalAsync(page).ConfigureAwait(false);
    }

    private async Task LogoutCoreAsync()
    {
        await _auth.LogoutAsync().ConfigureAwait(false);
        await MainThread.InvokeOnMainThreadAsync(async () =>
        {
            RefreshFromAuth();
            if (Shell.Current != null)
                await _nav.NavigateToAsync("//profile");
        });
    }

    private async Task UpgradePremiumAsync()
    {
        try
        {
            var result = await MainThread.InvokeOnMainThreadAsync(async () =>
            {
                return await global::Microsoft.Maui.Controls.Application.Current!.MainPage!.DisplayAlert(
                    "🚀 Nâng tầm Trải nghiệm",
                    "Trở thành thành viên Premium để tận hưởng đặc quyền quét QR không giới hạn và lắng nghe thuyết minh chuyên sâu tại mọi điểm đến.",
                    "Nâng cấp ngay",
                    "Hủy"
                );
            });

            if (!result) return;

            // Gọi API để kích hoạt Premium
            var success = await _premiumService.ActivatePremiumAsync();

            await MainThread.InvokeOnMainThreadAsync(async () =>
            {
                if (success)
                {
                    await global::Microsoft.Maui.Controls.Application.Current!.MainPage!.DisplayAlert(
                        "🎉 Chào mừng Thành viên mới!",
                        "Bạn đã kích hoạt thành công Đặc quyền Premium. Giờ đây, mọi câu chuyện chuyên sâu đã sẵn sàng chờ bạn khám phá. Thưởng thức ngay nhé!",
                        "Bắt đầu trải nghiệm"
                    );
                    RefreshFromAuth();
                }
                else
                {
                    await global::Microsoft.Maui.Controls.Application.Current!.MainPage!.DisplayAlert(
                        "🔔 Thông báo",
                        "Dịch vụ đang bận xử lý, vui lòng thử lại sau giây lát.",
                        "OK"
                    );
                }
            });
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[PROFILE] UpgradePremiumAsync error: {ex}");
        }
    }

    private void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
