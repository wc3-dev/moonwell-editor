using System.Globalization;
using System.Text;
using MoonwellEditor.Files;
using MoonwellEditor.Model;
using MoonwellEditor.Triggers;
using War3Net.CodeAnalysis.Jass;

namespace MoonwellEditor.Map.Tests;

// What a World Editor map makes in the game comes from its script: a save that changed the placed units and items
// writes them there too.
public sealed class PlacedScriptSaveTests(ITestOutputHelper output)
{
    private (TempFolder Folder, IMapStore Store, Session Session, TerrainEditor Editor)? Open(string map)
    {
        var files = InstallGameFiles.Open();
        var install = InstallMaps.Open(map);
        if (files == null || install == null || TestGameData.Data == null)
        {
            output.WriteLine(InstallMaps.NoInstall);
            return null;
        }

        var folder = new TempFolder();
        var path = Path.Combine(folder.Path, Path.GetFileName(install.Path));
        File.Copy(install.Path, path);
        var store = MapStore.Open(path);
        var session = TestGameData.Open(store)!;
        return (folder, store, session, TerrainEditor.Open(session, store, files)!);
    }

    private static string Script(IMapStore store, string name) =>
        Encoding.UTF8.GetString(MapStore.Open(store.Path).Read(name)!).Replace("\r\n", "\n");

    private static string Coordinate(float value) => value.ToString("0.0", CultureInfo.InvariantCulture);

    // The lines of a function of the script, from its first to its end.
    private static List<string> Function(string script, string start, string end)
    {
        var lines = script.Split('\n').ToList();
        var from = lines.IndexOf(start);
        Assert.True(from >= 0, start);
        return lines.Skip(from).TakeWhile(line => line != end).ToList();
    }

    [Fact]
    public void A_unit_and_an_item_placed_on_a_jass_map_are_made_by_its_script()
    {
        if (Open(InstallMaps.LostTemple) is not var (folder, store, session, editor))
        {
            return;
        }

        using (folder)
        {
            var before = Script(store, "war3map.j");
            var creeps = editor.Things("sd").Where(thing => thing.Kind == ThingKind.Unit && thing.Owner == 24).ToList();
            var (moved, removed) = (creeps[0], creeps[1]);
            var (x, y) = (1280f, -6400f);
            editor.Place(PlaceKind.Unit, "hpea", x, y, 0);
            editor.Place(PlaceKind.Item, "phea", x + 128, y, 0);
            editor.Move(moved.Number, moved.X + 256, moved.Y);
            editor.Remove(removed.Number);

            var report = session.Save();

            Assert.Equal("", report.Note);
            Assert.Contains("war3map.j", report.Written);
            var script = Script(store, "war3map.j");
            var units = Function(script, "function CreateUnitsForPlayer0 takes nothing returns nothing", "endfunction");
            Assert.Contains($"    set u = BlzCreateUnitWithSkin( p, 'hpea', {Coordinate(x)}, {Coordinate(y)}, 270.000, 'hpea' )", units);
            Assert.Contains("    call CreateUnitsForPlayer0(  )", Function(script, "function CreatePlayerUnits takes nothing returns nothing", "endfunction"));
            Assert.Contains($"    call BlzCreateItemWithSkin( 'phea', {Coordinate(x + 128)}, {Coordinate(y)}, 'phea' )", Function(script, "function CreateAllItems takes nothing returns nothing", "endfunction"));
            var main = Function(script, "function main takes nothing returns nothing", "endfunction");
            Assert.Equal(main.IndexOf("    call CreateAllItems(  )") + 1, main.IndexOf("    call CreateAllUnits(  )"));
            Assert.Contains($"'{moved.TypeId}', {Coordinate(moved.X + 256)}, {Coordinate(moved.Y)},", script);
            Assert.DoesNotContain($"'{removed.TypeId}', {Coordinate(removed.X)}, {Coordinate(removed.Y)},", script);
            JassSyntaxFactory.ParseCompilationUnit(script);

            // Only the parts for placed things changed: the script from the triggers on is as it was.
            var triggers = "//*  Triggers";
            Assert.Equal(before[before.IndexOf(triggers, StringComparison.Ordinal)..].Replace("    call CreateAllUnits(  )\n", "    call CreateAllItems(  )\n    call CreateAllUnits(  )\n"), script[script.IndexOf(triggers, StringComparison.Ordinal)..]);
        }
    }

    [Fact]
    public void A_unit_and_an_item_placed_on_a_lua_map_are_made_by_its_script()
    {
        if (Open(InstallMaps.ForgottenHollow) is not var (folder, store, session, editor))
        {
            return;
        }

        using (folder)
        {
            var (x, y) = (-14400f, 15400f);
            editor.Place(PlaceKind.Unit, "hpea", x, y, 0);
            editor.Place(PlaceKind.Item, "phea", x + 128, y, 0);

            var report = session.Save();

            Assert.Equal("", report.Note);
            var script = Script(store, "war3map.lua");
            Assert.Contains($"u = BlzCreateUnitWithSkin(p, FourCC(\"hpea\"), {Coordinate(x)}, {Coordinate(y)}, 270.000, FourCC(\"hpea\"))", Function(script, "function CreateUnitsForPlayer0()", "end"));
            Assert.Contains("CreateUnitsForPlayer0()", Function(script, "function CreatePlayerUnits()", "end"));
            var items = Function(script, "function CreateAllItems()", "end");
            var made = items.IndexOf($"i = BlzCreateItemWithSkin(FourCC(\"phea\"), {Coordinate(x + 128)}, {Coordinate(y)}, FourCC(\"phea\"))");
            Assert.True(made > 0);
            Assert.Equal("BlzSetItemColor(i, ConvertPlayerColor(0))", items[made + 1]);
        }
    }

    [Fact]
    public void A_unit_placed_and_named_by_a_trigger_in_one_save_is_set_where_it_is_made()
    {
        if (Open(InstallMaps.LostTemple) is not var (folder, store, session, editor))
        {
            return;
        }

        using (folder)
        {
            var catalog = TriggerCatalog.Read(path => InstallGameFiles.Open()!.File(path, "sd"));
            var number = editor.Place(PlaceKind.Unit, "hpea", 1280, -6400, 0);
            var name = editor.Things("sd")[number - 1].Ref!;
            session.EditTriggers(catalog, document =>
            {
                var id = document.Add(TriggerItemKind.Trigger, document.Tree().First(item => item.Kind == TriggerItemKind.Category).Id);
                var kill = document.AddFunction(id, null, 0, 0, FunctionKind.Action, "KillUnit");
                document.SetParameter(id, kill + "/p0", new ParamInput(ParameterKind.Variable, name));
                return id;
            });

            var report = session.Save();

            Assert.Equal("", report.Note);
            var script = Script(store, "war3map.j");
            Assert.Single(script.Split('\n'), line => line.Trim().StartsWith("unit ", StringComparison.Ordinal) && line.Contains(name, StringComparison.Ordinal));
            Assert.Contains($"    set {name} = BlzCreateUnitWithSkin( p, 'hpea', 1280.0, -6400.0, 270.000, 'hpea' )", script);
            Assert.Contains($"call KillUnit( {name} )", script);
            JassSyntaxFactory.ParseCompilationUnit(script);
        }
    }
}
