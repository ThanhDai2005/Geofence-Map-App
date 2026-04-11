using System.Collections.ObjectModel;
using MauiApp1.Models;
using Microsoft.Maui.Controls;

namespace MauiApp1.ApplicationContracts.Services;

/// <summary>Language pack download UX and persisted state (simulated today).</summary>
public interface ILanguagePackService
{
    ObservableCollection<LanguagePack> Packs { get; }

    LanguagePack? GetPack(string code);

    Task<LanguagePackEnsureResult> EnsureAvailableAsync(string code, Page hostPage, CancellationToken cancellationToken = default);

    void AddDynamicLanguage(string code, string nativeName, string displayName);
}
