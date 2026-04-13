namespace MauiApp1.Services;

/// <summary>
/// Manages the premium state of the application locally using Preferences.
/// </summary>
public interface IPremiumService
{
    bool IsPremium { get; set; }
}
