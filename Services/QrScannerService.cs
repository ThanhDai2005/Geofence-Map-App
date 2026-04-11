using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Models;

namespace MauiApp1.Services;

public sealed class QrScannerService : IQrScannerService
{
    public Task<QrParseResult> ParseAsync(string? input, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(QrResolver.Parse(input));
    }
}
