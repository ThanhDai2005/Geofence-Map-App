using Microsoft.Maui.Storage;

namespace MauiApp1.Services;

public class PremiumService : IPremiumService
{
    private const string PremiumKey = "is_premium_v1";

    public bool IsPremium
    {
        get => Preferences.Get(PremiumKey, false);
        set => Preferences.Set(PremiumKey, value);
    }
}
