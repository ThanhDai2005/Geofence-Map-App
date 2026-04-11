namespace MauiApp1.Models;

public class PoiEntryResult
{
    public bool Success { get; set; }
    public string? Error { get; set; }

    /// <summary>False when <see cref="Success"/> is true but navigation was intentionally skipped (e.g. duplicate guard).</summary>
    public bool Navigated { get; set; } = true;
}
