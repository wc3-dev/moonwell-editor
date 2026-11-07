using MoonwellEditor.Files;
using MoonwellEditor.Triggers;
using War3Net.Build.Environment;
using War3Net.Build.Extensions;
using War3Net.Build.Info;
using War3Net.Build.Widget;

namespace MoonwellEditor.Model;

/// <summary>
/// The script's placed units and items. World Editor makes a map's units and items in its script, so when a part changed
/// <c>war3mapUnits.doo</c>, a save writes the script's parts for them again, before that file.
/// </summary>
public sealed partial class Session
{
    // Why the last Changes left the placed units and items out of the script; "" when it did not.
    private string _placedNote = "";

    private void AddPlacedScript(List<(string Name, byte[] Bytes)> changes)
    {
        _placedNote = "";
        var at = changes.FindIndex(change => change.Name == MapUnits.FileName);
        if (at < 0)
        {
            return;
        }

        MapInfo? info;
        try
        {
            info = ReadInfo();
        }
        catch (Exception exception) when (exception is not OutOfMemoryException)
        {
            _placedNote = Texts.Get("app.triggers.unitsFailed", ("reason", exception.Message));
            return;
        }

        // A map with no script (a Moonwell project's) has its script made by its build, from war3mapUnits.doo.
        var name = info == null ? null : ScriptFileOf(info);
        if (info == null || name == null || _store.Read(name) is not { } bytes)
        {
            return;
        }

        try
        {
            var written = PlacedScriptFor(StrictUtf8.GetString(bytes), info, _baseline.GetValueOrDefault(MapUnits.FileName), changes[at].Bytes, out var problem);
            if (written == null)
            {
                _placedNote = problem ?? "";
                return;
            }

            _baseline[name] = bytes;
            changes.Insert(at, (name, StrictUtf8.GetBytes(written)));
        }
        catch (Exception exception) when (exception is not OutOfMemoryException)
        {
            _placedNote = Texts.Get("app.triggers.unitsFailed", ("reason", exception.Message));
        }
    }

    /// <summary>
    /// <paramref name="script"/> with the placed units and items of <paramref name="units"/>, the script having been made
    /// from <paramref name="before"/>; null, with the reason in <paramref name="problem"/>, when it cannot be written.
    /// </summary>
    internal string? PlacedScriptFor(string script, MapInfo info, byte[]? before, byte[] units, out string? problem)
    {
        if (before == null)
        {
            problem = Texts.Get("app.triggers.unitsCut");
            return null;
        }

        var named = _triggers?.PlacedNames().Where(each => !each.StartsWith("gg_dest_", StringComparison.Ordinal)) ?? [];
        return PlacedScript.Write(script, PlacedSources(info), UnitsOf(before), UnitsOf(units), named, out problem);
    }

    /// <summary>What the script's placed units and items are written with beside them.</summary>
    internal PlacedScript.Sources PlacedSources(MapInfo info)
    {
        MapRegions? regions = null;
        if (_store.Read(MapRegions.FileName) is { } bytes)
        {
            using var reader = new BinaryReader(new MemoryStream(bytes));
            regions = reader.ReadMapRegions();
        }

        return new(info, regions, Field, id => _kinds[ObjectKind.Item].Find(id) is { Custom: true });
    }

    /// <summary>The units, items and start locations of a <c>war3mapUnits.doo</c>.</summary>
    internal static MapUnits UnitsOf(byte[] bytes)
    {
        using var reader = new BinaryReader(new MemoryStream(bytes));
        return reader.ReadMapUnits();
    }

    // An ability's, an item's or a unit's value of a field, by the field's first letter, with the map's changes; null when
    // it has none.
    private string? Field(string id, string field)
    {
        var kind = field[0] switch
        {
            'i' => ObjectKind.Item,
            'u' => ObjectKind.Unit,
            _ => ObjectKind.Ability,
        };
        var data = _game.Kind(kind);
        var found = _kinds[kind].Find(id);
        var resolver = ResolverOf(kind, data);
        if (found != null && resolver.MapText(field, found) is { } text)
        {
            return text;
        }

        var standard = found is { Custom: true } ? data.Object(found.BaseId) : data.Object(id);
        return standard == null || data.Field(field) is not { } info ? null : resolver.StandardValue(info, 0, standard);
    }
}
