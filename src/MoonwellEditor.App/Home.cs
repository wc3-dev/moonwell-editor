using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace MoonwellEditor.App;

/// <summary>A file in the .moonwell folder that was saved or deleted, sent with the <c>homeChanged</c> event.</summary>
/// <param name="File">
/// The file's place in the folder, with forward slashes: <c>settings.json</c>, <c>hotkeys.json</c> or
/// <c>themes/name.json</c>.
/// </param>
/// <param name="Text">The file's text now; null when it was deleted.</param>
public sealed record HomeChange(string File, string? Text);

/// <summary>The window's colours from the theme the page showed last, each <c>#rrggbb</c> (see <see cref="Home.LastPageColors"/>).</summary>
/// <param name="Gutter">The page's background between its panels, for the window before the page loads.</param>
/// <param name="Panel">The panels' background, for the title bar.</param>
/// <param name="Border">The panels' border, for the window's frame.</param>
public sealed record PageColors(string Gutter, string Panel, string Border);

/// <summary>
/// The editor's folder in the user's home, <c>C:\Users\name\.moonwell</c>: <c>settings.json</c>, <c>hotkeys.json</c>,
/// <c>state.json</c>, the user's own themes in <c>themes\</c> and the schemas in <c>schemas\</c> (Sven, 2026-11-02). The
/// page cannot touch the disk, so this class reads the files for it (<see cref="BootScript"/>), writes what it sends
/// (<see cref="Write"/>, <see cref="SetState"/>) and tells it what changed on disk (<see cref="Watch"/>). A missing or
/// damaged file gives the defaults, so a bad file never stops the app from starting.
/// </summary>
public sealed class Home : IDisposable
{
    /// <summary>The environment variable that names another folder to use, as the test editors do.</summary>
    public const string FolderVariable = "MOONWELL_EDITOR_HOME";

    /// <summary>How many maps <see cref="RememberMap"/> keeps.</summary>
    public const int RecentMapsKept = 10;

    // Comments and trailing commas are allowed in what a person edits, as VS Code reads its own files.
    private static readonly JsonDocumentOptions Lenient = new()
    {
        CommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static readonly JsonSerializerOptions Indented = new()
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    // The files the page may write: a name is letters, digits, spaces, dots, dashes and underscores, so it cannot leave
    // its folder. \z, not $, which would let a name end in a line break.
    private static readonly Regex Writable = new(
        @"^(?:settings\.json|hotkeys\.json|themes/[A-Za-z0-9][A-Za-z0-9 ._-]*\.json|schemas/[A-Za-z0-9][A-Za-z0-9 ._-]*\.schema\.json)\z",
        RegexOptions.CultureInvariant);

    private static readonly Regex HexColor = new(@"^#[0-9A-Fa-f]{6}\z", RegexOptions.CultureInvariant);

    // A saved file is raised once it has been quiet this long, as an editor saves in several steps.
    private static readonly TimeSpan Quiet = TimeSpan.FromMilliseconds(150);

    // A file that is held is read up to this many times, this far apart (150 ms in all) before it is given up on.
    private const int ReadAttempts = 4;
    private const int ReadPause = 50;

    private readonly string? _legacyPath;
    private readonly object _lock = new();
    private readonly List<FileSystemWatcher> _watchers = [];

    // The latest event each file was heard with, so only the last one of a burst is acted on.
    private readonly Dictionary<string, long> _pending = [];
    private long _heard;
    private volatile string? _gameFolder;
    private bool _disposed;

    /// <summary>
    /// Reads <c>settings.json</c>. Nothing is written until the page or the commands change something, and no other
    /// file is read until it is asked for, so two editors on one folder always see each other's changes.
    /// </summary>
    /// <param name="folder">The .moonwell folder (see <see cref="DefaultFolder"/>); it need not exist yet.</param>
    /// <param name="legacyFolder">
    /// The folder of the settings the app kept before the .moonwell folder (<c>%LOCALAPPDATA%\MoonwellEditor</c>); null
    /// for none. Its Warcraft III folder is used while there is no <c>settings.json</c>, and its recent maps while there
    /// is no <c>state.json</c>.
    /// </param>
    public Home(string folder, string? legacyFolder = null)
    {
        Folder = folder;
        _legacyPath = legacyFolder == null ? null : Path.Combine(legacyFolder, "settings.json");

        // A settings.json that is there, even a damaged one, means the move from the old settings has happened: the old
        // file is not read again, and the install found is used until the file is mended.
        _gameFolder = File.Exists(At("settings.json"))
            ? FolderIn(ObjectIn(ReadOrNull(At("settings.json"))), "game.folder")
            : LegacyGameFolder();
    }

    /// <summary>
    /// The folder to use: the one <c>MOONWELL_EDITOR_HOME</c> names, else <c>.moonwell</c> in the user's home folder.
    /// </summary>
    /// <param name="environment">Reads an environment variable; null when it is not set.</param>
    /// <returns>The folder's path.</returns>
    public static string DefaultFolder(Func<string, string?> environment)
    {
        var named = environment(FolderVariable);
        return string.IsNullOrWhiteSpace(named)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".moonwell")
            : named;
    }

    /// <summary>The .moonwell folder.</summary>
    public string Folder { get; }

    /// <summary>
    /// The Warcraft III install's folder the user chose (<c>game.folder</c> in <c>settings.json</c>), or null for the
    /// install the app finds. While there is no <c>settings.json</c> it is the folder the old settings held.
    /// </summary>
    public string? GameFolder => _gameFolder;

    /// <summary>The maps opened lately, newest first (see <see cref="RememberMap"/>), as <c>state.json</c> holds them now.</summary>
    public IReadOnlyList<string> RecentMaps
    {
        get
        {
            lock (_lock)
            {
                return Maps(LoadState() ?? new JsonObject());
            }
        }
    }

    /// <summary>
    /// The colours of the theme the page showed last (<c>lastTheme</c> in <c>state.json</c>, which the page keeps), so the
    /// window starts in them rather than in a dark grey that flashes before a light theme (Sven, 2026-11-03). Null when
    /// there is no such theme, or a colour is missing or not <c>#rrggbb</c>. A hand-edited file with a key twice also gives
    /// null: the window is made from this, and a bad file never stops the app from starting.
    /// </summary>
    public PageColors? LastPageColors
    {
        get
        {
            try
            {
                JsonObject? vars;
                lock (_lock)
                {
                    vars = (LoadState()?["lastTheme"] as JsonObject)?["vars"] as JsonObject;
                }

                string? Color(string name) =>
                    vars?[name] is JsonValue value && value.TryGetValue<string>(out var text) && HexColor.IsMatch(text)
                        ? text
                        : null;

                return Color("--background-gutter") is { } gutter
                    && Color("--background-panel") is { } panel
                    && Color("--border-normal") is { } border
                        ? new PageColors(gutter, panel, border)
                        : null;
            }
            catch (Exception exception) when (exception is ArgumentException or InvalidOperationException)
            {
                return null;
            }
        }
    }

    /// <summary>
    /// Raised, on a background thread, when <c>settings.json</c>, <c>hotkeys.json</c> or a theme was saved or deleted,
    /// by <see cref="Write"/> or by anything else, once the file has been quiet for a moment (see <see cref="Watch"/>).
    /// </summary>
    public event Action<HomeChange>? Changed;

    /// <summary>
    /// Raised, on a background thread, when a saved <c>settings.json</c> names another Warcraft III folder than
    /// <see cref="GameFolder"/> was: the new one, or null for the install found. A <c>settings.json</c> that cannot be
    /// parsed changes nothing.
    /// </summary>
    public event Action<string?>? GameFolderChanged;

    /// <summary>
    /// The full path of a place in the folder: the folder itself (null), the themes folder (<c>themes</c>) or a file that
    /// <see cref="Write"/> accepts.
    /// </summary>
    /// <param name="file">The place, with forward slashes.</param>
    /// <returns>The path.</returns>
    /// <exception cref="ArgumentException">There is no such place.</exception>
    public string PathOf(string? file)
    {
        if (file == null)
        {
            return Folder;
        }

        if (file != "themes" && !Writable.IsMatch(file))
        {
            throw new ArgumentException($"There is no place \"{file}\" in the folder to open.");
        }

        return At(file);
    }

    /// <summary>
    /// Puts a map (a folder or an archive file) first in <see cref="RecentMaps"/> and saves <c>state.json</c>. The same map
    /// spelled with other letter case is taken out first, and only the newest <see cref="RecentMapsKept"/> are kept.
    /// </summary>
    /// <param name="map">The map folder's or archive file's path.</param>
    /// <exception cref="IOException"><c>state.json</c> is there but cannot be read, so it is not written over.</exception>
    public void RememberMap(string map)
    {
        lock (_lock)
        {
            var state = StateToChange();
            var maps = Maps(state);
            maps.RemoveAll(known => string.Equals(known, map, StringComparison.OrdinalIgnoreCase));
            maps.Insert(0, map);
            if (maps.Count > RecentMapsKept)
            {
                maps.RemoveRange(RecentMapsKept, maps.Count - RecentMapsKept);
            }

            SaveMaps(state, maps);
        }
    }

    /// <summary>
    /// Takes a map out of <see cref="RecentMaps"/>, spelled in any letter case, and saves <c>state.json</c>.
    /// </summary>
    /// <param name="map">The map folder's or archive file's path.</param>
    /// <exception cref="IOException"><c>state.json</c> is there but cannot be read, so it is not written over.</exception>
    public void ForgetMap(string map)
    {
        lock (_lock)
        {
            var state = StateToChange();
            var maps = Maps(state);
            maps.RemoveAll(known => string.Equals(known, map, StringComparison.OrdinalIgnoreCase));
            SaveMaps(state, maps);
        }
    }

    /// <summary>
    /// Whether the app opens the last map at start (<c>editor.reopenLastMap</c> in <c>settings.json</c>), read from the
    /// file as it is now. False when the key is missing or not true, or the file has a mistake.
    /// </summary>
    public bool ReopenLastMap =>
        ObjectIn(ReadOrNull(At("settings.json"))) is { } root
        && root.TryGetPropertyValue("editor.reopenLastMap", out var node)
        && node is JsonValue value
        && value.TryGetValue<bool>(out var reopen)
        && reopen;

    /// <summary>
    /// Sets one top-level key of <c>state.json</c>, keeping the others, and saves the file. The file is read again first,
    /// so what another editor on the same folder saved lately is kept.
    /// </summary>
    /// <param name="key">The key.</param>
    /// <param name="value">Its new value, any JSON.</param>
    /// <exception cref="ArgumentException">The key is empty.</exception>
    /// <exception cref="IOException"><c>state.json</c> is there but cannot be read, so it is not written over.</exception>
    public void SetState(string key, JsonElement value)
    {
        if (key.Length == 0)
        {
            throw new ArgumentException("The state key cannot be empty.");
        }

        lock (_lock)
        {
            var state = StateToChange();
            state[key] = JsonNode.Parse(value.GetRawText());
            SaveState(state);
        }
    }

    /// <summary>
    /// Writes one of the files the page owns: <c>settings.json</c>, <c>hotkeys.json</c>, <c>themes/name.json</c> or
    /// <c>schemas/name.schema.json</c>. The folders are made if they are not there. The text goes to a side file first, so
    /// a crash half way never leaves a broken file, and a file that already holds the text is not touched.
    /// </summary>
    /// <param name="file">The file's place in the folder, with forward slashes.</param>
    /// <param name="text">What to write.</param>
    /// <exception cref="ArgumentException">
    /// The file is not one of those, or its name has other characters than letters, digits, spaces, dots, dashes and
    /// underscores.
    /// </exception>
    public void Write(string file, string text)
    {
        if (!Writable.IsMatch(file))
        {
            throw new ArgumentException($"The file \"{file}\" is not one the editor writes.");
        }

        var path = At(file);
        lock (_lock)
        {
            if (TryRead(path, out var current, patient: false) && current == text)
            {
                return;
            }

            WriteThroughSideFile(path, text);
        }
    }

    /// <summary>
    /// The script the page runs before it paints (<c>https://game.moonwelleditor/home.js</c>), which sets
    /// <c>window.moonwellHome</c> to the folder's path and the text of <c>settings.json</c>, <c>hotkeys.json</c> and
    /// <c>state.json</c> (null for a file that is missing), the themes in <c>themes\</c> as <c>{ file, text }</c>, and
    /// <c>legacy</c>: while there is no <c>settings.json</c>, the old settings' Warcraft III folder, for the move from
    /// today's storage; else null. A file that is there but held by another program is tried again for a moment. One that
    /// stays held has no text, like a missing one, but its name is in <c>unreadable</c> (<c>settings.json</c>,
    /// <c>hotkeys.json</c>, <c>state.json</c> or <c>themes/name.json</c>; an empty list when none), so the page does not
    /// take it for a file that is not there and write over it. A <c>settings.json</c> that is there never brings the old
    /// settings back.
    /// </summary>
    /// <returns>The script.</returns>
    public string BootScript()
    {
        var unreadable = new List<string>();
        var boot = new
        {
            folder = Folder,
            settings = ReadForBoot("settings.json", unreadable),
            hotkeys = ReadForBoot("hotkeys.json", unreadable),
            state = ReadForBoot("state.json", unreadable),
            themes = Themes(unreadable),
            legacy = File.Exists(At("settings.json")) ? null : new { gameFolder = LegacyGameFolder() },
            unreadable,
        };
        return "window.moonwellHome = " + JsonSerializer.Serialize(boot, Json) + ";";
    }

    /// <summary>
    /// Starts watching <c>settings.json</c>, <c>hotkeys.json</c> and <c>themes\*.json</c> for changes, the editor's own
    /// writes included. Each file that changed is raised once as <see cref="Changed"/>, after 150 ms without another
    /// change, so a save made in several steps is read whole. The folders are made if they are not there. A folder that
    /// cannot be made or watched (it is a file, it is locked, its path is wrong) only means changes to the files are not
    /// noticed: the editor still starts.
    /// </summary>
    public void Watch()
    {
        FileSystemWatcher[] failed = [];
        lock (_lock)
        {
            if (_disposed || _watchers.Count > 0)
            {
                return;
            }

            try
            {
                Directory.CreateDirectory(At("themes"));
                _watchers.Add(WatchFolder(
                    Folder,
                    name => name.Equals("settings.json", StringComparison.OrdinalIgnoreCase) ? "settings.json"
                        : name.Equals("hotkeys.json", StringComparison.OrdinalIgnoreCase) ? "hotkeys.json"
                        : null));
                _watchers.Add(WatchFolder(
                    At("themes"),
                    name => name.EndsWith(".json", StringComparison.OrdinalIgnoreCase) ? "themes/" + name : null));
            }
            catch (Exception exception) when (
                exception is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
            {
                // The first watcher goes too, so nothing is half watched.
                failed = [.. _watchers];
                _watchers.Clear();
            }
        }

        foreach (var watcher in failed)
        {
            watcher.Dispose();
        }
    }

    /// <summary>Stops watching.</summary>
    public void Dispose()
    {
        FileSystemWatcher[] watchers;
        lock (_lock)
        {
            _disposed = true;
            _pending.Clear();
            watchers = [.. _watchers];
            _watchers.Clear();
        }

        foreach (var watcher in watchers)
        {
            watcher.Dispose();
        }
    }

    // Temporary files (a name ending in .tmp, or an editor's own) never name a file, so they are not heard.
    private FileSystemWatcher WatchFolder(string folder, Func<string, string?> fileOf)
    {
        var watcher = new FileSystemWatcher(folder, "*.json")
        {
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
        };
        void Hear(string? name)
        {
            if (name != null && fileOf(name) is { } file)
            {
                Heard(file);
            }
        }

        watcher.Created += (_, e) => Hear(e.Name);
        watcher.Changed += (_, e) => Hear(e.Name);
        watcher.Deleted += (_, e) => Hear(e.Name);
        watcher.Renamed += (_, e) =>
        {
            Hear(e.OldName);
            Hear(e.Name);
        };
        try
        {
            watcher.EnableRaisingEvents = true;
        }
        catch
        {
            watcher.Dispose();
            throw;
        }

        return watcher;
    }

    private void Heard(string file)
    {
        long mine;
        lock (_lock)
        {
            if (_disposed)
            {
                return;
            }

            mine = _pending[file] = ++_heard;
        }

        _ = Task.Delay(Quiet).ContinueWith(_ => Settled(file, mine), TaskScheduler.Default);
    }

    // Runs once the quiet is over, but only for the last event of a burst.
    private void Settled(string file, long heard)
    {
        lock (_lock)
        {
            if (_disposed || !_pending.TryGetValue(file, out var latest) || latest != heard)
            {
                return;
            }

            _pending.Remove(file);
        }

        // A file an editor still holds is tried again a moment later; one that stays locked is left for its next save.
        if (!TryRead(At(file), out var text))
        {
            return;
        }

        Changed?.Invoke(new HomeChange(file, text));
        if (file == "settings.json")
        {
            CheckGameFolder(text);
        }
    }

    private void CheckGameFolder(string? text)
    {
        string? folder = null;
        if (text != null)
        {
            var root = ObjectIn(text);
            if (root == null)
            {
                // A mistake in the file: the folder stays as it was until the file is mended.
                return;
            }

            folder = FolderIn(root, "game.folder");
        }

        lock (_lock)
        {
            if (folder == _gameFolder)
            {
                return;
            }

            _gameFolder = folder;
        }

        GameFolderChanged?.Invoke(folder);
    }

    // A file's text for the boot script; null when it is missing, or when it stays held, which names it in the list.
    private string? ReadForBoot(string file, List<string> unreadable)
    {
        if (TryRead(At(file), out var text))
        {
            return text;
        }

        unreadable.Add(file);
        return null;
    }

    private List<BootTheme> Themes(List<string> unreadable)
    {
        var themes = new List<BootTheme>();
        try
        {
            var files = Directory.EnumerateFiles(At("themes"), "*.json")
                .Where(path => path.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
                .Order(StringComparer.OrdinalIgnoreCase);
            foreach (var path in files)
            {
                var file = "themes/" + Path.GetFileName(path);
                if (!TryRead(path, out var text))
                {
                    unreadable.Add(file);
                }
                else if (text != null)
                {
                    themes.Add(new BootTheme(file, text));
                }
            }
        }
        catch (Exception exception) when (
            exception is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
        {
            // No themes folder yet, or one that cannot be read: no themes.
        }

        return themes;
    }

    private sealed record BootTheme(string File, string Text);

    private string? LegacyGameFolder() => FolderIn(LegacySettings(), "gameFolder");

    private JsonObject LegacyState()
    {
        var state = new JsonObject();
        if (LegacySettings()?["recentMaps"] is JsonArray old)
        {
            var maps = new JsonArray();
            foreach (var item in old)
            {
                if (item is JsonValue value && value.TryGetValue<string>(out var map))
                {
                    maps.Add(map);
                }
            }

            state["recentMaps"] = maps;
        }

        return state;
    }

    private JsonObject? LegacySettings() => _legacyPath == null ? null : ObjectIn(ReadOrNull(_legacyPath));

    // state.json as it is on disk now; the old settings' recent maps while there is no file yet. Null when the file is
    // there but cannot be read, and so must not be written over.
    private JsonObject? LoadState()
    {
        if (!File.Exists(At("state.json")))
        {
            return LegacyState();
        }

        return TryRead(At("state.json"), out var text) ? ObjectIn(text) ?? new JsonObject() : null;
    }

    private JsonObject StateToChange() =>
        LoadState() ?? throw new IOException("state.json is there but cannot be read, so it is left as it is.");

    private static List<string> Maps(JsonObject state)
    {
        var maps = new List<string>();
        if (state["recentMaps"] is JsonArray array)
        {
            foreach (var item in array)
            {
                if (item is JsonValue value && value.TryGetValue<string>(out var map))
                {
                    maps.Add(map);
                }
            }
        }

        return maps;
    }

    private void SaveMaps(JsonObject state, List<string> maps)
    {
        var array = new JsonArray();
        foreach (var known in maps)
        {
            array.Add(known);
        }

        state["recentMaps"] = array;
        SaveState(state);
    }

    private void SaveState(JsonObject state) => WriteThroughSideFile(At("state.json"), state.ToJsonString(Indented));

    private string At(string file) => Path.Combine(Folder, file.Replace('/', Path.DirectorySeparatorChar));

    private static void WriteThroughSideFile(string path, string text)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);

        // A name of its own, so a second editor saving the same file never meets this one's half-written side file.
        var temporary = $"{path}.{Guid.NewGuid():N}.tmp";
        try
        {
            File.WriteAllText(temporary, text);
            File.Move(temporary, path, true);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            try
            {
                File.Delete(temporary);
            }
            catch (Exception inner) when (inner is IOException or UnauthorizedAccessException)
            {
                // Left behind; it has a name of its own and nothing reads it.
            }

            throw;
        }
    }

    // The text of a file, without a byte order mark; null when it is not there or cannot be read.
    private static string? ReadOrNull(string path) => TryRead(path, out var text) ? text : null;

    // False when the file is there but cannot be read; its text is null when it is not there (or its path cannot name a
    // file). A file another program holds is tried again for a moment, as an editor or a scanner lets go quickly.
    private static bool TryRead(string path, out string? text, bool patient = true)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                text = File.ReadAllText(path);
                return true;
            }
            catch (Exception exception) when (
                exception is FileNotFoundException or DirectoryNotFoundException or ArgumentException or NotSupportedException)
            {
                text = null;
                return true;
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                if (!patient || attempt == ReadAttempts)
                {
                    text = null;
                    return false;
                }

                Thread.Sleep(ReadPause);
            }
        }
    }

    // The JSON object in a file's text; null for no text, or text that is not an object or has a mistake.
    private static JsonObject? ObjectIn(string? text)
    {
        if (text == null)
        {
            return null;
        }

        try
        {
            return JsonNode.Parse(text, null, Lenient) as JsonObject;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    // A folder named by a key; null when the key is missing, null or not text.
    private static string? FolderIn(JsonObject? root, string key) =>
        root != null
        && root.TryGetPropertyValue(key, out var node)
        && node is JsonValue value
        && value.TryGetValue<string>(out var folder)
        && !string.IsNullOrWhiteSpace(folder)
            ? folder
            : null;
}
