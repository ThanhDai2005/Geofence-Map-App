using SQLite;
using System.Text.Json;

namespace MauiApp1.Models;

[Table("pois")]
public class Poi
{
    [PrimaryKey]
    public string Id { get; set; } = ""; // Code + Language

    public string Code { get; set; } = "";
    public string LanguageCode { get; set; } = "";

    // Flattened text fields
    public string Name { get; set; } = "";
    public string Summary { get; set; } = ""; // hiển thị trên bản đồ
    public string NarrationShort { get; set; } = ""; // văn bản đọc khi vào vùng geofence, fallback về Name nếu trống
    public string NarrationLong { get; set; } = ""; // văn bản hiển thị trong chi tiết POI, fallback về NarrationShort nếu trống

    // Geolocation and behavior
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public double Radius { get; set; } = 50;
    public int Priority { get; set; } = 1;

    // Compatibility helpers used by existing view code
    public string GetName(string? lang = null) => Name;
    public string GetDescription(string? lang = null) => Summary;
}