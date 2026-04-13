using MauiApp1.Services;
using MauiApp1.ViewModels;

namespace MauiApp1.Views;

public partial class LoginPage : ContentPage
{
    private readonly INavigationService _nav;

    public LoginPage(LoginViewModel viewModel, INavigationService nav)
    {
        InitializeComponent();
        BindingContext = viewModel;
        _nav = nav;
    }

    private void OnCloseClicked(object sender, EventArgs e)
    {
        if (global::Microsoft.Maui.Controls.Application.Current?.MainPage is NavigationPage nav)
        {
            if (nav.Navigation.NavigationStack.Count > 1)
            {
                _ = nav.PopAsync();
                return;
            }

            if (nav.CurrentPage is LoginPage)
            {
                global::Microsoft.Maui.Controls.Application.Current?.Quit();
                return;
            }
        }

        _ = _nav.PopModalAsync();
    }
}
