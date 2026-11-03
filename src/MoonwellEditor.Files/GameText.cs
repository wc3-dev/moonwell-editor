using System.Text;

namespace MoonwellEditor.Files;

/// <summary>The game's INI-like text files: World Editor's data (<c>UI\WorldEditData.txt</c>) and its strings.</summary>
public static class GameText
{
    /// <summary>The value of the first <paramref name="key"/> in <c>[<paramref name="section"/>]</c>; null when none.</summary>
    public static string? Entry(string text, string section, string key)
    {
        foreach (var (lineSection, lineKey, value) in Lines(text))
        {
            if (lineSection == section && lineKey == key)
            {
                return value;
            }
        }

        return null;
    }

    /// <summary>
    /// Each <c>KEY=text</c> line of a strings file, whatever its section, its text without quotes; the first of a key
    /// counts, in any case.
    /// </summary>
    public static Dictionary<string, string> Strings(byte[]? bytes)
    {
        var strings = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (bytes != null)
        {
            foreach (var (_, key, value) in Lines(Encoding.UTF8.GetString(bytes)))
            {
                strings.TryAdd(key, Unquoted(value));
            }
        }

        return strings;
    }

    private static IEnumerable<(string Section, string Key, string Value)> Lines(string text)
    {
        var section = "";
        foreach (var raw in text.Split('\n'))
        {
            var line = raw.Trim();
            if (line.StartsWith('['))
            {
                section = line.TrimStart('[').TrimEnd(']');
                continue;
            }

            var equals = line.IndexOf('=');
            if (equals > 0 && !line.StartsWith("//", StringComparison.Ordinal))
            {
                yield return (section, line[..equals].TrimEnd(), line[(equals + 1)..].TrimStart());
            }
        }
    }

    /// <summary>A text without its quotes; the game's files leave some closing quotes out.</summary>
    public static string Unquoted(string text) => text.StartsWith('"') ? text[1..].TrimEnd('"') : text;
}
