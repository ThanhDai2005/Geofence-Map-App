namespace MauiApp1.Models;

/// <summary>
/// Carries the result of a localization lookup including fallback metadata.
/// </summary>
public readonly struct LocalizationResult
{
    public PoiLocalization? Localization { get; init; }

    /// <summary>True when the returned localization is NOT in the requested language.</summary>
    public bool IsFallback { get; init; }

    /// <summary>The language code that was actually used (may differ from requested).</summary>
    public string UsedLang { get; init; }

    /// <summary>The explicitly requested language code.</summary>
    public string RequestedLang { get; init; }

    public static LocalizationResult Miss(string req) => new() { Localization = null, IsFallback = false, UsedLang = "", RequestedLang = req };
}
