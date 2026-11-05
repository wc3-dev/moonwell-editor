using System.Text;
using Moonwell.GameData;
using MoonwellEditor.Files;
using MoonwellEditor.Triggers;
using War3Net.Build.Extensions;
using War3Net.Build.Import;
using War3Net.IO.Mpq;
using Xunit.Abstractions;

namespace MoonwellEditor.Model.Tests;

[Collection(GameDataCollection.Name)]
public sealed class TriggerSaveTests(GameDataFixture game, ITestOutputHelper output) : IDisposable
{
    private const string WarChasers = "Maps/Scenario/(4)WarChasers.w3m";
    private const string ForgottenHollow = "Maps/ForsakenKingdom/Scenario/(1)ForgottenHollow.w3x";

    private readonly string _folder = Path.Combine(Path.GetTempPath(), "MoonwellEditor.TriggerSaveTests", Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(_folder))
        {
            Directory.Delete(_folder, true);
        }
    }

    // A copy of a map of the install, with the install's trigger catalog; null without an install.
    private (string Path, TriggerCatalog Catalog)? Copy(string path)
    {
        if (game.Data == null || GameInstall.Find() is not { } folder)
        {
            output.WriteLine(game.Reason);
            return null;
        }

        using var files = GameFiles.Open(folder);
        Directory.CreateDirectory(_folder);
        var target = Path.Combine(_folder, Path.GetFileName(path));
        File.WriteAllBytes(target, files.Read(path, "sd")!);
        return (target, TriggerCatalog.Read(name => files.Read(name, "sd")));
    }

    // The install's trigger catalog; null without an install.
    private TriggerCatalog? Catalog()
    {
        if (game.Data == null || GameInstall.Find() is not { } folder)
        {
            output.WriteLine(game.Reason);
            return null;
        }

        using var files = GameFiles.Open(folder);
        return TriggerCatalog.Read(name => files.Read(name, "sd"));
    }

    // A folder map with these files of a map of the install; null without an install.
    private (string Folder, TriggerCatalog Catalog)? Unpacked(string path, params string[] names)
    {
        if (Copy(path) is not var (archive, catalog))
        {
            return null;
        }

        var folder = Path.Combine(_folder, "folder");
        Directory.CreateDirectory(folder);
        var store = MapStore.Open(archive);
        foreach (var name in names)
        {
            File.WriteAllBytes(Path.Combine(folder, name), store.Read(name)!);
        }

        return (folder, catalog);
    }

    private static int Category(TriggerDocument document) =>
        document.Tree().First(item => item.Kind == TriggerItemKind.Category).Id;

    private static List<string> ImportedPaths(byte[]? imports)
    {
        if (imports == null)
        {
            return [];
        }

        using var reader = new BinaryReader(new MemoryStream(imports));
        return [.. reader.ReadImportedFiles().Files.Select(file => file.FullPath)];
    }

    [Theory]
    [InlineData(WarChasers, MapLanguage.Jass)]
    [InlineData(ForgottenHollow, MapLanguage.Lua)]
    public void A_map_says_what_language_its_scripts_are_in(string map, MapLanguage language)
    {
        if (Copy(map) is not var (path, _))
        {
            return;
        }

        Assert.Equal(language, Session.Open(MapStore.Open(path), game.Data!).TriggerLanguage());
    }

    [Fact]
    public void An_edit_is_unsaved_until_it_is_undone()
    {
        if (Copy(WarChasers) is not var (path, catalog))
        {
            return;
        }

        var session = Session.Open(MapStore.Open(path), game.Data!);
        var document = session.Triggers(catalog);

        session.EditTriggers(catalog, each => each.Add(TriggerItemKind.Trigger, Category(each)));

        Assert.True(session.Dirty);
        Assert.True(session.Undo());
        Assert.False(session.Dirty);
        Assert.Single(document.Tree(), item => item.Kind == TriggerItemKind.Root);
        Assert.DoesNotContain(document.Tree(), item => item.Name == "Untitled Trigger 001");
        Assert.True(session.Redo());
        Assert.Contains(document.Tree(), item => item.Name == "Untitled Trigger 001");
    }

    [Fact]
    public void A_refused_edit_changes_nothing_and_is_no_undo_step()
    {
        if (Copy(WarChasers) is not var (path, catalog))
        {
            return;
        }

        var session = Session.Open(MapStore.Open(path), game.Data!);
        var before = session.Triggers(catalog).TriggerBytes();

        Assert.Throws<TriggerEditException>(() => session.EditTriggers(catalog, each =>
        {
            var id = each.Add(TriggerItemKind.Trigger, Category(each));
            each.Rename(id, "   ");
            return id;
        }));

        Assert.Equal(before, session.Triggers(catalog).TriggerBytes());
        Assert.False(session.Dirty);
        Assert.False(session.Undo());
    }

    [Fact]
    public void A_save_writes_the_trigger_files_and_the_script_and_nothing_else()
    {
        if (Copy(WarChasers) is not var (path, catalog))
        {
            return;
        }

        var before = MapStore.Open(path);
        var names = new[] { "war3map.w3u", "war3map.doo", "war3mapUnits.doo", "war3map.w3e", "war3map.w3i", "war3map.wts" };
        var kept = names.ToDictionary(name => name, before.Read);
        var session = Session.Open(before, game.Data!);
        var id = session.EditTriggers(catalog, each =>
        {
            var made = each.Add(TriggerItemKind.Trigger, Category(each));
            each.AddFunction(made, null, 0, 0, FunctionKind.Event, "TriggerRegisterTimerEventPeriodic");
            each.AddFunction(made, null, 0, 0, FunctionKind.Action, "CreateNUnitsAtLoc");
            return made;
        });

        var report = session.Save();

        Assert.Equal(["war3map.wtg", "war3map.wct", "war3map.j"], report.Written);
        Assert.Equal("", report.Note);
        Assert.False(session.Dirty);
        var after = MapStore.Open(path);
        foreach (var name in names)
        {
            Assert.Equal(kept[name], after.Read(name));
        }

        var script = Encoding.UTF8.GetString(after.Read("war3map.j")!);
        Assert.Contains("gg_trg_Untitled_Trigger_001", script);
        Assert.Contains("call TriggerRegisterTimerEventPeriodic( gg_trg_Untitled_Trigger_001, 2 )", script);
        Assert.Contains("call CreateNUnitsAtLoc( 1, 'hfoo', Player(0), GetRectCenter(GetPlayableMapRect()), bj_UNIT_FACING )", script);
        var again = TriggerDocument.Read(after.Read("war3map.wtg"), after.Read("war3map.wct"), catalog);
        Assert.Null(again.Problem);
        Assert.Contains(again.Tree(), item => item.Id == id);
    }

    [Fact]
    public void A_moved_card_saves_its_place_in_the_map_and_lists_the_file_in_the_imports()
    {
        if (Copy(WarChasers) is not var (path, catalog))
        {
            return;
        }

        var before = MapStore.Open(path);
        var imported = ImportedPaths(before.Read(ImportedFiles.MapFileName));
        var session = Session.Open(before, game.Data!);
        var id = session.Triggers(catalog).Tree().First(item => item.Kind == TriggerItemKind.Trigger).Id;

        session.EditTriggers(catalog, each =>
        {
            each.SetPlaces([new CardMove(id, 120, 60)]);
            return 0;
        });

        Assert.True(session.Dirty);
        var report = session.Save();
        Assert.Equal([TriggerDocument.LayoutFile, ImportedFiles.MapFileName], report.Written);
        Assert.False(session.Dirty);
        var after = MapStore.Open(path);
        Assert.NotNull(after.Read(TriggerDocument.LayoutFile));
        Assert.Equal([.. imported, TriggerDocument.LayoutFile], ImportedPaths(after.Read(ImportedFiles.MapFileName)));

        var again = Session.Open(after, game.Data!);
        var card = again.Triggers(catalog).Cards(again.Triggers(catalog).Tree().First(item => item.Id == id).Parent, again).Single(each => each.Id == id);
        Assert.Equal(new CardPlace(120, 60, false), card.Place);
    }

    [Fact]
    public void A_card_moved_again_writes_only_the_layout_file()
    {
        if (Copy(WarChasers) is not var (path, catalog))
        {
            return;
        }

        var session = Session.Open(MapStore.Open(path), game.Data!);
        var id = session.Triggers(catalog).Tree().First(item => item.Kind == TriggerItemKind.Trigger).Id;
        session.EditTriggers(catalog, each =>
        {
            each.SetPlaces([new CardMove(id, 120, 60)]);
            return 0;
        });
        session.Save();

        session.EditTriggers(catalog, each =>
        {
            each.SetPlaces([new CardMove(id, 200, 80)]);
            return 0;
        });

        Assert.Equal([TriggerDocument.LayoutFile], session.Save().Written);
    }

    [Fact]
    public void A_later_session_lists_the_layout_file_only_once()
    {
        if (Copy(WarChasers) is not var (path, catalog))
        {
            return;
        }

        var first = Session.Open(MapStore.Open(path), game.Data!);
        var id = first.Triggers(catalog).Tree().First(item => item.Kind == TriggerItemKind.Trigger).Id;
        first.EditTriggers(catalog, each =>
        {
            each.SetPlaces([new CardMove(id, 120, 60)]);
            return 0;
        });
        first.Save();

        var second = Session.Open(MapStore.Open(path), game.Data!);
        second.EditTriggers(catalog, each =>
        {
            each.SetPlaces([new CardMove(id, 200, 80)]);
            return 0;
        });

        Assert.Equal([TriggerDocument.LayoutFile], second.Save().Written);
        var paths = ImportedPaths(MapStore.Open(path).Read(ImportedFiles.MapFileName));
        Assert.Single(paths, each => each == TriggerDocument.LayoutFile);
    }

    [Fact]
    public void A_map_whose_triggers_were_not_edited_saves_no_trigger_file()
    {
        if (Copy(WarChasers) is not var (path, catalog))
        {
            return;
        }

        var session = Session.Open(MapStore.Open(path), game.Data!);
        session.Triggers(catalog);

        Assert.Empty(session.Save().Written);
    }

    [Fact]
    public void A_lua_map_keeps_its_script_and_the_save_says_so()
    {
        if (Copy(ForgottenHollow) is not var (path, catalog))
        {
            return;
        }

        var session = Session.Open(MapStore.Open(path), game.Data!);
        session.EditTriggers(catalog, each => each.Add(TriggerItemKind.Trigger, Category(each)));

        var report = session.Save();

        Assert.Equal(["war3map.wtg", "war3map.wct"], report.Written);
        Assert.Contains("Lua", report.Note);
    }

    [Fact]
    public void A_reload_drops_the_edits()
    {
        if (Copy(WarChasers) is not var (path, catalog))
        {
            return;
        }

        var session = Session.Open(MapStore.Open(path), game.Data!);
        session.EditTriggers(catalog, each => each.Add(TriggerItemKind.Trigger, Category(each)));

        session.Reload();

        Assert.False(session.Dirty);
        Assert.DoesNotContain(session.Triggers(catalog).Tree(), item => item.Name == "Untitled Trigger 001");
    }

    [Fact]
    public void A_map_info_that_cannot_be_read_leaves_the_script_and_the_save_says_so()
    {
        if (Copy(WarChasers) is not var (path, catalog))
        {
            return;
        }

        MapStore.Open(path).Write([("war3map.w3i", new byte[] { 1, 2, 3 })]);
        var script = MapStore.Open(path).Read("war3map.j");
        var session = Session.Open(MapStore.Open(path), game.Data!);
        session.EditTriggers(catalog, each => each.Add(TriggerItemKind.Trigger, Category(each)));
        session.Set(ObjectKind.Unit, "hfoo", "uhpm", 0, "500");

        var report = session.Save();

        Assert.Equal(["war3map.w3u", "war3map.wtg", "war3map.wct"], report.Written);
        Assert.Contains("war3map.w3i could not be read", report.Note);
        Assert.Equal(script, MapStore.Open(path).Read("war3map.j"));
        Assert.False(session.Dirty);
    }

    [Fact]
    public void Triggers_are_read_only_when_the_script_or_imports_are_under_another_locale()
    {
        if (Catalog() is not { } catalog)
        {
            return;
        }

        var made = TriggerDocument.Read(null, null, catalog);
        made.Add(TriggerItemKind.Trigger, -1);
        Directory.CreateDirectory(_folder);
        var path = Path.Combine(_folder, "localized.w3x");
        var german = (MpqLocale)0x407;
        var files = new List<MpqFile>
        {
            MpqFile.New(new MemoryStream(made.TriggerBytes()!), "war3map.wtg"),
            MpqFile.New(new MemoryStream(made.CustomTextBytes()!), "war3map.wct"),
            MpqFile.New(new MemoryStream("function main takes nothing returns nothing\nendfunction\n"u8.ToArray()), "war3map.j", german),
        };
        using (var archive = new MemoryStream())
        {
            MpqArchive.Create(archive, files, new MpqArchiveCreateOptions(), leaveOpen: true).Dispose();
            File.WriteAllBytes(path, archive.ToArray());
        }

        var document = Session.Open(MapStore.Open(path), game.Data!).Triggers(catalog);

        Assert.True(document.ReadOnly);
        Assert.Contains("war3map.j", document.Problem);
    }

    [Fact]
    public void An_undo_after_a_save_writes_the_layout_back()
    {
        if (Copy(WarChasers) is not var (path, catalog))
        {
            return;
        }

        var session = Session.Open(MapStore.Open(path), game.Data!);
        var id = session.Triggers(catalog).Tree().First(item => item.Kind == TriggerItemKind.Trigger).Id;
        session.EditTriggers(catalog, each =>
        {
            each.SetPlaces([new CardMove(id, 120, 60)]);
            return 0;
        });
        session.Save();

        Assert.True(session.Undo());

        Assert.True(session.Dirty);
        Assert.Equal([TriggerDocument.LayoutFile], session.Save().Written);
        var again = Session.Open(MapStore.Open(path), game.Data!);
        var parent = again.Triggers(catalog).Tree().First(item => item.Id == id).Parent;
        Assert.Null(again.Triggers(catalog).Cards(parent, again).Single(each => each.Id == id).Place);
    }

    [Fact]
    public void An_undo_after_a_save_writes_the_trigger_files_back_on_a_map_that_had_none()
    {
        if (Catalog() is not { } catalog)
        {
            return;
        }

        using var map = TempMap.Of("we-3.0");
        var session = Session.Open(MapStore.Open(map.Folder), game.Data!);
        session.EditTriggers(catalog, each => each.Add(TriggerItemKind.Trigger, -1));
        Assert.Equal(["war3map.wtg", "war3map.wct"], session.Save().Written);

        Assert.True(session.Undo());

        Assert.True(session.Dirty);
        Assert.Equal(["war3map.wtg", "war3map.wct"], session.Save().Written);
        var again = Session.Open(MapStore.Open(map.Folder), game.Data!).Triggers(catalog);
        Assert.Null(again.Problem);
        Assert.DoesNotContain(again.Tree(), item => item.Name == "Untitled Trigger 001");
    }

    [Fact]
    public void A_script_a_failed_save_did_not_write_is_written_by_the_next_save()
    {
        if (Unpacked(WarChasers, "war3map.w3i", "war3map.wtg", "war3map.wct", "war3map.j", "war3mapUnits.doo")
            is not var (folder, catalog))
        {
            return;
        }

        var session = Session.Open(MapStore.Open(folder), game.Data!);
        session.EditTriggers(catalog, each => each.Add(TriggerItemKind.Trigger, Category(each)));
        var script = Path.Combine(folder, "war3map.j");
        using (File.Open(script, FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            Assert.Throws<MapFileException>(() => session.Save());
        }

        session.Save();

        Assert.Contains("gg_trg_Untitled_Trigger_001", File.ReadAllText(script));
        Assert.False(session.Dirty);
    }
}
