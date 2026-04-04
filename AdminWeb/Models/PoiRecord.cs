using System.ComponentModel.DataAnnotations;

namespace AdminWeb.Models;

public sealed class PoiRecord
{
    [Key]
    [Required]
    [MaxLength(128)]
    public string Id { get; set; } = "";

    [Required]
    [MaxLength(64)]
    public string Code { get; set; } = "";

    [Required]
    [MaxLength(8)]
    public string LanguageCode { get; set; } = "vi";

    public double Latitude { get; set; }
    public double Longitude { get; set; }

    public int Radius { get; set; } = 50;
    public int Priority { get; set; } = 1;

    [Required]
    [MaxLength(256)]
    public string Name { get; set; } = "";

    [Required]
    [MaxLength(600)]
    public string Summary { get; set; } = "";

    [Required]
    public string NarrationShort { get; set; } = "";

    [Required]
    public string NarrationLong { get; set; } = "";

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

