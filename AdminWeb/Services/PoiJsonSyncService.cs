using System.Text.Json;
using AdminWeb.Models;
using Microsoft.EntityFrameworkCore;

namespace AdminWeb.Services;

public sealed class PoiJsonSyncService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true
    };

    public static string NormalizeLang(string? lang)
    {
        var l = (lang ?? "vi").Trim().ToLowerInvariant();
        return l is "vi" or "en" or "zh" or "ja" ? l : "vi";
    }

    public async Task<int> ImportFromJsonAsync(DbContext db, string jsonPath, CancellationToken ct = default)
    {
        if (!File.Exists(jsonPath))
            return 0;

        var json = await File.ReadAllTextAsync(jsonPath, ct);
        json = json.Replace("\u00A0", " ");

        var items = JsonSerializer.Deserialize<List<PoiRecord>>(json, JsonOptions) ?? [];

        var now = DateTimeOffset.UtcNow;
        foreach (var p in items)
        {
            p.Code = (p.Code ?? "").Trim();
            p.LanguageCode = NormalizeLang(p.LanguageCode);
            p.Id = $"{p.Code}_{p.LanguageCode}";
            p.Name ??= "";
            p.Summary ??= "";
            p.NarrationShort ??= "";
            p.NarrationLong ??= "";
            if (string.IsNullOrWhiteSpace(p.NarrationShort))
                p.NarrationShort = !string.IsNullOrWhiteSpace(p.Summary) ? p.Summary : p.Name;
            if (string.IsNullOrWhiteSpace(p.NarrationLong))
                p.NarrationLong = p.NarrationShort;
            if (p.Radius <= 0) p.Radius = 50;
            p.UpdatedAt = now;
        }

        // Upsert by unique (Code,LanguageCode)
        // EF Core 10 doesn't have a simple built-in bulk upsert; do it per record for simplicity.
        var set = db.Set<PoiRecord>();
        var count = 0;

        foreach (var item in items.Where(x => !string.IsNullOrWhiteSpace(x.Code)))
        {
            var existing = await set.AsQueryable()
                .FirstOrDefaultAsync(p => p.Code == item.Code && p.LanguageCode == item.LanguageCode, ct);

            if (existing == null)
            {
                await set.AddAsync(item, ct);
                count++;
            }
            else
            {
                existing.Latitude = item.Latitude;
                existing.Longitude = item.Longitude;
                existing.Radius = item.Radius;
                existing.Priority = item.Priority;
                existing.Name = item.Name;
                existing.Summary = item.Summary;
                existing.NarrationShort = item.NarrationShort;
                existing.NarrationLong = item.NarrationLong;
                existing.UpdatedAt = now;
                count++;
            }
        }

        await db.SaveChangesAsync(ct);
        return count;
    }

    public async Task<string> ExportToJsonAsync(DbContext db, CancellationToken ct = default)
    {
        var items = await db.Set<PoiRecord>()
            .AsNoTracking()
            .OrderBy(p => p.Code)
            .ThenBy(p => p.LanguageCode)
            .ToListAsync(ct);

        return JsonSerializer.Serialize(items, JsonOptions);
    }
}

