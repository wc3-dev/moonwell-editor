using System.Text.Json;

namespace MoonwellEditor.App;

/// <summary>The commands for the .moonwell folder. See <see cref="Home"/>.</summary>
public sealed partial class Commands
{
    /// <summary>
    /// Raised, on a background thread, when <c>settings.json</c>, <c>hotkeys.json</c> or a theme was saved or deleted, by
    /// another program or by the editor's own <c>writeHome</c> (the <c>homeChanged</c> event).
    /// </summary>
    public event Action<HomeChange>? HomeChanged;

    // A refused name is the page's mistake; a file that cannot be written is the disk's, and answers as "failed".
    private object? WriteHome(string file, string text)
    {
        try
        {
            _home.Write(file, text);
        }
        catch (ArgumentException exception)
        {
            throw BadRequest(exception.Message);
        }

        return null;
    }

    private object? SetState(string key, JsonElement value)
    {
        try
        {
            _home.SetState(key, value);
        }
        catch (ArgumentException exception)
        {
            throw BadRequest(exception.Message);
        }

        return null;
    }

    // The folder, the themes folder (made if it is not there yet) or one of the files the page writes, in the shell.
    private object? OpenHome(string? file)
    {
        string path;
        try
        {
            path = _home.PathOf(file);
        }
        catch (ArgumentException exception)
        {
            throw BadRequest(exception.Message);
        }

        if (file is null or "themes")
        {
            Directory.CreateDirectory(path);
        }

        _open(path);
        return null;
    }

    private static JsonElement ValueOf(JsonElement args) =>
        args.ValueKind == JsonValueKind.Object && args.TryGetProperty("value", out var value)
            ? value
            : throw BadRequest("The argument value is missing.");

    // settings.json names another folder (the page wrote it, or the user edited the file): load it, or the install found
    // when it names none, unless that is the one loaded already. With nothing to load the data in use stays.
    private void LoadGameFolder(string? folder)
    {
        var target = folder ?? _findGame();
        if (string.IsNullOrEmpty(target))
        {
            return;
        }

        lock (_lock)
        {
            if (string.Equals(_source, target, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }
        }

        Begin(target);
    }
}
