namespace MauiApp1.Views;

public partial class ExplorePage : ContentPage
{
    public ExplorePage()
    {
        InitializeComponent();
    }

    private async void OnOpenMapClicked(object sender, EventArgs e)
    {
        await Shell.Current.GoToAsync("//map");
    }
}