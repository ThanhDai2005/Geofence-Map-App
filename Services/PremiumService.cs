using System.Net.Http.Json;
using Microsoft.Maui.Storage;

namespace MauiApp1.Services;

public class PremiumService : IPremiumService
{
    private const string PremiumKey = "is_premium_v1";
    private readonly ApiService _apiService;
    private readonly AuthService _authService;

    public PremiumService(ApiService apiService, AuthService authService)
    {
        _apiService = apiService;
        _authService = authService;
    }

    public bool IsPremium
    {
        get => Preferences.Get(PremiumKey, false);
        set => Preferences.Set(PremiumKey, value);
    }

    public async Task<bool> ActivatePremiumAsync()
    {
        try
        {
            System.Diagnostics.Debug.WriteLine("[PREMIUM] ActivatePremiumAsync: calling API...");
            var response = await _apiService.PostAsJsonAsync("premium/activate", new { });

            System.Diagnostics.Debug.WriteLine($"[PREMIUM] ActivatePremiumAsync: status={response.StatusCode}");

            if (response.IsSuccessStatusCode)
            {
                IsPremium = true;

                // Cập nhật trạng thái Premium trong AuthService
                System.Diagnostics.Debug.WriteLine("[PREMIUM] ActivatePremiumAsync: refreshing auth status...");
                await _authService.RefreshPremiumStatusAsync();
                System.Diagnostics.Debug.WriteLine("[PREMIUM] ActivatePremiumAsync: success");

                return true;
            }

            var errorContent = await response.Content.ReadAsStringAsync();
            System.Diagnostics.Debug.WriteLine($"[PREMIUM] ActivatePremiumAsync: failed with {errorContent}");
            return false;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[PREMIUM] ActivatePremiumAsync error: {ex.Message}");
            System.Diagnostics.Debug.WriteLine($"[PREMIUM] ActivatePremiumAsync stack: {ex.StackTrace}");
            return false;
        }
    }
}
