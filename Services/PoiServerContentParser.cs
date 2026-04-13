using MauiApp1.Models;

namespace MauiApp1.Services;

/// <summary>
/// API nearby / QR scan returns a single long <c>content.vi</c> blob. Map and detail UI expect
/// short <see cref="PoiLocalization.Name"/> / <see cref="PoiLocalization.NarrationShort"/> fields.
/// This splits paragraphs so logged-in sync does not put the entire story into the title line.
/// </summary>
internal static class PoiServerContentParser
{
    public static PoiLocalization BuildLocalization(string code, string lang, string? rawFull)
    {
        var full = (rawFull ?? "").Trim();
        if (string.IsNullOrEmpty(full))
            return new PoiLocalization { Code = code, LanguageCode = lang };

        var blocks = full
            .Split(new[] { "\r\n\r\n", "\n\n" }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(b => b.Length > 0)
            .ToList();

        string name;
        string summary;
        string narrShort;
        var narrLong = full;

        if (blocks.Count >= 3)
        {
            name = Truncate(blocks[0], 100);
            summary = Truncate(blocks[1], 350);
            narrShort = blocks[2].Length > 400 ? Truncate(blocks[2], 400) : blocks[2];
        }
        else if (blocks.Count == 2)
        {
            name = Truncate(blocks[0], 100);
            summary = Truncate(blocks[1], 350);
            narrShort = Truncate(blocks[1], 260);
        }
        else
        {
            var lines = full.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(l => l.Trim())
                .Where(l => l.Length > 0)
                .ToList();

            if (lines.Count >= 2)
            {
                name = Truncate(lines[0], 100);
                var body = string.Join(" ", lines.Skip(1));
                summary = Truncate(body, 200);
                narrShort = body.Length <= 280 ? body : Truncate(body, 280);
            }
            else
            {
                name = Truncate(full, 72);
                summary = "";
                narrShort = full.Length <= 220 ? full : Truncate(full, 220);
            }
        }

        return new PoiLocalization
        {
            Code = code,
            LanguageCode = lang,
            Name = name,
            Summary = summary,
            NarrationShort = narrShort,
            NarrationLong = narrLong
        };
    }

    private static string Truncate(string s, int max)
    {
        if (string.IsNullOrEmpty(s) || s.Length <= max)
            return s;
        return s[..max].TrimEnd() + "…";
    }
}
