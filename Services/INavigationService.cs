namespace MauiApp1.Services;

public interface INavigationService
{
    Task PushModalAsync(Page page, bool animated = true);
    Task PopModalAsync(bool animated = true);
    Task NavigateToAsync(string route, bool animated = true);
    Task NavigateToAsync(string route, IDictionary<string, object> parameters, bool animated = true);
    Task GoBackAsync(bool animated = true);
}
