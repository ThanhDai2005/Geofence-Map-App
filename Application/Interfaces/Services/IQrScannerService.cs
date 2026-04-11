using MauiApp1.Models;

namespace MauiApp1.ApplicationContracts.Services;

/// <summary>Parses QR / deep-link payloads into normalized POI codes.</summary>
public interface IQrScannerService
{
    Task<QrParseResult> ParseAsync(string? input, CancellationToken cancellationToken = default);
}
