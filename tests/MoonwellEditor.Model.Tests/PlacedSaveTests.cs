using System.Text;
using Moonwell.GameData;
using MoonwellEditor.Files;
using MoonwellEditor.Triggers;
using War3Net.Build.Extensions;
using War3Net.Build.Info;
using War3Net.Build.Widget;
using Xunit.Abstractions;

namespace MoonwellEditor.Model.Tests;

[Collection(GameDataCollection.Name)]
public sealed class PlacedSaveTests(GameDataFixture game, ITestOutputHelper output)
{
    // The install's maps, as paths in its storage, each written once to a temp file kept between runs; empty without an
    // install.
    private IEnumerable<(string Path, IMapStore Store)> InstallMaps()
    {
        if (game.Data == null || GameInstall.Find() is not { } folder)
        {
            output.WriteLine(game.Reason);
            yield break;
        }

        using var files = GameFiles.Open(folder);
        foreach (var path in files.List("Maps/", "sd", ".w3x", ".w3m"))
        {
            var target = Path.Combine(Path.GetTempPath(), "MoonwellEditor.Model.Tests", "maps", path.Replace('/', '_'));
            if (!File.Exists(target))
            {
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                File.WriteAllBytes(target + ".part", files.Read(path, "sd")!);
                File.Move(target + ".part", target, true);
            }

            yield return (path, MapStore.Open(target));
        }

        // Lua maps World Editor 3.0.1 saved from the install's JASS maps, in a folder named by MOONWELL_LUA_MAPS, when set.
        if (Environment.GetEnvironmentVariable("MOONWELL_LUA_MAPS") is { Length: > 0 } lua)
        {
            foreach (var file in Directory.GetFiles(lua).Where(file => file.EndsWith(".w3x", StringComparison.OrdinalIgnoreCase)
                || file.EndsWith(".w3m", StringComparison.OrdinalIgnoreCase)))
            {
                yield return (file, MapStore.Open(file));
            }
        }
    }

    private static MapInfo Info(IMapStore store)
    {
        using var reader = new BinaryReader(new MemoryStream(store.Read(MapInfo.FileName)!));
        return reader.ReadMapInfo();
    }

    private static string? Script(IMapStore store, MapInfo info) =>
        (info.ScriptLanguage == ScriptLanguage.Lua
            ? store.Read("war3map.lua") ?? store.Read(@"scripts\war3map.lua")
            : store.Read("war3map.j") ?? store.Read(@"scripts\war3map.j")) is { } bytes
            ? Encoding.UTF8.GetString(bytes)
            : null;

    [Fact]
    public void A_map_whose_units_did_not_change_gets_its_own_script_back()
    {
        var maps = 0;
        var same = 0;
        var unread = 0;
        var kinds = new Dictionary<string, int>();
        foreach (var (path, store) in InstallMaps())
        {
            var info = Info(store);
            var script = Script(store, info);
            var units = store.Read(MapUnits.FileName);
            if (script == null || units == null)
            {
                continue;
            }

            try
            {
                Session.UnitsOf(units);
            }
            catch (ArgumentException)
            {
                // War3Net cannot read these units, so a save leaves the script as it is.
                unread++;
                continue;
            }

            maps++;
            var session = Session.Open(store, game.Data!);
            var built = session.PlacedScriptFor(script, info, units, units, out var problem);
            // Some community maps' Lua has its functions indented; the parts written come out as World Editor's do now.
            static string Flat(string text) => System.Text.RegularExpressions.Regex.Replace(text, @"(?m)^[ 	]+", "");
            if (built == script || (built != null && info.ScriptLanguage == ScriptLanguage.Lua && Flat(built) == Flat(script)))
            {
                same++;
                continue;
            }

            var key = PlacedScript.FirstDifference(script, session.PlacedSources(info), Session.UnitsOf(units)) ?? problem ?? "different";
            key = key.Length > 300 ? key[..300] : key;
            kinds[key] = kinds.GetValueOrDefault(key) + 1;
            if (kinds[key] == 1)
            {
                output.WriteLine($"{path} ({info.ScriptLanguage}, editor {info.EditorVersion}): {key}");
            }
        }

        output.WriteLine($"{same} of {maps} the same, {unread} with units War3Net cannot read");
        foreach (var (key, count) in kinds.OrderByDescending(pair => pair.Value))
        {
            output.WriteLine($"{count}: {key}");
        }

        // GnollWood S2 (editor 6140) drops random items with ChooseRandomItemExWithFilter, and Monopoly S2 has no blank
        // line after its drop functions' locals: their script is left as it is, with the note.
        Assert.True(maps > 200 || game.Data == null);
        Assert.True(same >= maps - 2, $"{same} of {maps}");
    }

    [Fact]
    public void A_script_whose_units_were_changed_by_hand_is_left_as_it_is_and_says_why()
    {
        var found = InstallMaps().FirstOrDefault(map => map.Path == "Maps/FrozenThrone/(4)LostTemple.w3x");
        if (found.Store is not { } store)
        {
            return;
        }

        var info = Info(store);
        var units = store.Read(MapUnits.FileName)!;
        var script = Script(store, info)!.Replace("'nfor', -809.6, 6474.4", "'nfor', -809.6, 6000.0", StringComparison.Ordinal);
        var session = Session.Open(store, game.Data!);

        var built = session.PlacedScriptFor(script, info, units, units, out var problem);

        Assert.Null(built);
        Assert.Equal(Texts.Get("app.triggers.unitsCut"), problem);
    }
}
