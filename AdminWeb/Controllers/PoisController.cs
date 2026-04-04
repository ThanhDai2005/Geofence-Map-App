using AdminWeb.Data;
using AdminWeb.Models;
using AdminWeb.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QRCoder;

namespace AdminWeb.Controllers;

public sealed class PoisController : Controller
{
    private readonly AdminDbContext _db;
    private readonly PoiJsonSyncService _sync;

    public PoisController(AdminDbContext db, PoiJsonSyncService sync)
    {
        _db = db;
        _sync = sync;
    }

    [HttpGet("/pois")]
    public async Task<IActionResult> Index(string? q, string? code, string? lang)
    {
        lang = string.IsNullOrWhiteSpace(lang) ? null : PoiJsonSyncService.NormalizeLang(lang);

        var query = _db.Pois.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(code))
            query = query.Where(p => p.Code == code.Trim());
        if (!string.IsNullOrWhiteSpace(lang))
            query = query.Where(p => p.LanguageCode == lang);
        if (!string.IsNullOrWhiteSpace(q))
        {
            q = q.Trim();
            query = query.Where(p => p.Code.Contains(q) || p.Name.Contains(q));
        }

        var items = await query
            .OrderBy(p => p.Code)
            .ThenBy(p => p.LanguageCode)
            .Take(500)
            .ToListAsync();

        return View(items);
    }

    [HttpGet("/pois/create")]
    public IActionResult Create()
    {
        return View(new PoiRecord
        {
            Code = "",
            LanguageCode = "vi",
            Radius = 50,
            Priority = 1
        });
    }

    [HttpPost("/pois/create")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Create(PoiRecord model)
    {
        model.Code = (model.Code ?? "").Trim();
        model.LanguageCode = PoiJsonSyncService.NormalizeLang(model.LanguageCode);
        model.Id = $"{model.Code}_{model.LanguageCode}";
        model.Name ??= "";
        model.Summary ??= "";
        model.NarrationShort ??= "";
        model.NarrationLong ??= "";
        if (string.IsNullOrWhiteSpace(model.NarrationShort))
            model.NarrationShort = !string.IsNullOrWhiteSpace(model.Summary) ? model.Summary : model.Name;
        if (string.IsNullOrWhiteSpace(model.NarrationLong))
            model.NarrationLong = model.NarrationShort;
        if (model.Radius <= 0) model.Radius = 50;
        model.UpdatedAt = DateTimeOffset.UtcNow;

        if (string.IsNullOrWhiteSpace(model.Code))
            ModelState.AddModelError(nameof(PoiRecord.Code), "Code is required");
        if (!ModelState.IsValid)
            return View(model);

        _db.Pois.Add(model);
        await _db.SaveChangesAsync();
        return RedirectToAction(nameof(Index), new { code = model.Code });
    }

    [HttpGet("/pois/edit")]
    public async Task<IActionResult> Edit(string code, string lang)
    {
        var l = PoiJsonSyncService.NormalizeLang(lang);
        var item = await _db.Pois.FirstOrDefaultAsync(p => p.Code == code && p.LanguageCode == l);
        return item == null ? NotFound() : View(item);
    }

    [HttpPost("/pois/edit")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Edit(PoiRecord model)
    {
        var l = PoiJsonSyncService.NormalizeLang(model.LanguageCode);
        var item = await _db.Pois.FirstOrDefaultAsync(p => p.Code == model.Code && p.LanguageCode == l);
        if (item == null) return NotFound();

        item.Latitude = model.Latitude;
        item.Longitude = model.Longitude;
        item.Radius = model.Radius <= 0 ? 50 : model.Radius;
        item.Priority = model.Priority;
        item.Name = model.Name ?? "";
        item.Summary = model.Summary ?? "";
        item.NarrationShort = model.NarrationShort ?? "";
        item.NarrationLong = model.NarrationLong ?? "";
        if (string.IsNullOrWhiteSpace(item.NarrationShort))
            item.NarrationShort = !string.IsNullOrWhiteSpace(item.Summary) ? item.Summary : item.Name;
        if (string.IsNullOrWhiteSpace(item.NarrationLong))
            item.NarrationLong = item.NarrationShort;
        item.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();
        return RedirectToAction(nameof(Index), new { code = item.Code });
    }

    [HttpPost("/pois/delete")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Delete(string code, string lang)
    {
        var l = PoiJsonSyncService.NormalizeLang(lang);
        var item = await _db.Pois.FirstOrDefaultAsync(p => p.Code == code && p.LanguageCode == l);
        if (item == null) return NotFound();
        _db.Pois.Remove(item);
        await _db.SaveChangesAsync();
        return RedirectToAction(nameof(Index), new { code });
    }

    [HttpGet("/pois/export")]
    public async Task<IActionResult> Export()
    {
        var json = await _sync.ExportToJsonAsync(_db);
        return File(System.Text.Encoding.UTF8.GetBytes(json), "application/json; charset=utf-8", "pois.json");
    }

    // QR for the MAUI app to scan: encode only the POI code (or "poi:{code}" if you prefer later).
    [HttpGet("/qr/{code}")]
    public IActionResult Qr(string code)
    {
        code = (code ?? "").Trim();
        if (string.IsNullOrWhiteSpace(code)) return BadRequest();

        using var generator = new QRCodeGenerator();
        using var data = generator.CreateQrCode(code, QRCodeGenerator.ECCLevel.Q);
        var png = new PngByteQRCode(data).GetGraphic(10);
        return File(png, "image/png");
    }
}

