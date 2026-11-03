using System.Text.Json;
using MoonwellEditor.Files;
using MoonwellEditor.Map;
using MoonwellEditor.Model;
using MoonwellEditor.Triggers;
using War3Net.Build.Audio;
using War3Net.Build.Environment;
using War3Net.Build.Extensions;

namespace MoonwellEditor.App;

/// <summary>The game's trigger functions, for the page's lists.</summary>
/// <param name="Categories">The function categories.</param>
/// <param name="Types">The value types.</param>
/// <param name="Presets">The named values.</param>
/// <param name="Functions">Every function.</param>
public sealed record TriggerCatalogView(
    IReadOnlyList<CatalogCategory> Categories,
    IReadOnlyList<CatalogType> Types,
    IReadOnlyList<CatalogPreset> Presets,
    IReadOnlyList<CatalogFunction> Functions);

/// <summary>A thing of the map that a trigger names: a region, a camera or a sound.</summary>
/// <param name="Type">The value type it fills (<c>rect</c>).</param>
/// <param name="Ref">The name a parameter holds (<c>gg_rct_Spawn</c>).</param>
/// <param name="Text">The name as shown (<c>Spawn &lt;gen&gt;</c>).</param>
public sealed record MapReference(string Type, string Ref, string Text);

/// <summary>The trigger editor's tree.</summary>
/// <param name="Items">The items.</param>
/// <param name="Variables">The variables.</param>
/// <param name="ReadOnly">True when nothing may be edited.</param>
/// <param name="Problem">Why it is read only; null when it is not, or for no reason the user need see.</param>
/// <param name="HeaderComment">The comment on the map's own script text.</param>
/// <param name="HeaderCode">The map's own script text.</param>
/// <param name="References">The regions, cameras and sounds the map has.</param>
/// <param name="Language">What the map's scripts are in.</param>
public sealed record TriggerTreeView(
    IReadOnlyList<TriggerTreeItem> Items,
    IReadOnlyList<VariableView> Variables,
    bool ReadOnly,
    string? Problem,
    string HeaderComment,
    string HeaderCode,
    IReadOnlyList<MapReference> References,
    MapLanguage Language);

/// <summary>A new item's id.</summary>
/// <param name="Id">The id.</param>
public sealed record NewTriggerItem(int Id);

/// <summary>A function's path after an edit.</summary>
/// <param name="Path">The path.</param>
public sealed record FunctionPlace(string Path);

/// <summary>The trigger editor's commands.</summary>
public sealed partial class Commands
{
    // The catalog of the install it was read from; another install reads it again.
    private (string Folder, TriggerCatalog Catalog)? _triggerCatalog;

    // The open map's regions, cameras and sounds; null until asked, and for another map.
    private List<MapReference>? _mapReferences;

    private TriggerCatalog Catalog()
    {
        var assets = Assets ?? throw new CommandException(ErrorCode.NoAssets, Texts.Get("app.assets.none"));
        if (_triggerCatalog is { } known && known.Folder == assets.Folder)
        {
            return known.Catalog;
        }

        var catalog = TriggerCatalog.Read(path => assets.GameFile(path, "sd"));
        _triggerCatalog = (assets.Folder, catalog);
        return catalog;
    }

    private TriggerCatalogView CatalogView()
    {
        var catalog = Catalog();
        return new TriggerCatalogView(catalog.Categories, catalog.Types, catalog.Presets, catalog.Functions);
    }

    private TriggerTreeView TriggerTree()
    {
        var document = Map().Triggers(Catalog());
        return new TriggerTreeView(
            document.Tree(),
            document.Variables(),
            document.ReadOnly,
            document.Problem,
            document.HeaderComment,
            document.HeaderCode,
            References(),
            Map().TriggerLanguage());
    }

    // The regions, cameras and sounds of the map, read once per map as nothing here changes them. They are only offered
    // in lists, so a file that cannot be read adds nothing.
    private List<MapReference> References()
    {
        if (_mapReferences != null)
        {
            return _mapReferences;
        }

        var store = _store!;
        var references = new List<MapReference>();
        Read(store, MapRegions.FileName, reader =>
        {
            foreach (var region in reader.ReadMapRegions().Regions)
            {
                references.Add(new MapReference("rect", TriggerNames.Region(region.Name), region.Name + " <gen>"));
            }
        });
        Read(store, MapCameras.FileName, reader =>
        {
            foreach (var camera in reader.ReadMapCameras().Cameras)
            {
                references.Add(new MapReference("camerasetup", TriggerNames.Camera(camera.Name), camera.Name + " <gen>"));
            }
        });
        Read(store, MapSounds.FileName, reader =>
        {
            foreach (var sound in reader.ReadMapSounds().Sounds)
            {
                var name = sound.Name.Replace("gg_snd_", "", StringComparison.Ordinal);
                references.Add(new MapReference("sound", sound.Name, name + " <gen>"));
            }
        });
        _mapReferences = references;
        return references;
    }

    private static void Read(IMapStore store, string name, Action<BinaryReader> read)
    {
        try
        {
            if (store.Read(name) is { } bytes)
            {
                using var reader = new BinaryReader(new MemoryStream(bytes));
                read(reader);
            }
        }
        catch (Exception exception) when (exception is not OutOfMemoryException)
        {
            // Left out of the lists; a parameter that names it still shows.
        }
    }

    private TriggerView TriggerOf(int id) => Map().Triggers(Catalog()).Trigger(id, Map());

    private T EditTriggers<T>(Func<TriggerDocument, T> change) => Changed(Map().EditTriggers(Catalog(), change));

    private object? EditTriggers(Action<TriggerDocument> change) => EditTriggers<object?>(document =>
    {
        change(document);
        return null;
    });

    private static IEnumerable<CommandEntry> TriggerCommands() =>
    [
        CommandEntry.Of("triggerCatalog", (Commands c) => c.CatalogView()),
        CommandEntry.Of("triggerTree", (Commands c) => c.TriggerTree()),
        CommandEntry.Of("trigger", (Commands c, IdArgs a) => c.TriggerOf(a.Id)),
        CommandEntry.Of("triggerAdd", (Commands c, TriggerAddArgs a) =>
            c.EditTriggers(document => new NewTriggerItem(document.Add(a.Kind, a.Parent)))),
        CommandEntry.Do("triggerRename", (Commands c, RenameArgs a) =>
            c.EditTriggers(document => document.Rename(a.Id, a.Name))),
        CommandEntry.Do("triggerOptions", (Commands c, TriggerOptionsArgs a) =>
            c.EditTriggers(document => document.SetOptions(a.Id, a.Enabled, a.InitiallyOn, a.RunOnInit, a.Description))),
        CommandEntry.Do("triggerCode", (Commands c, TriggerCodeArgs a) =>
            c.EditTriggers(document => document.SetCode(a.Id, a.Code))),
        CommandEntry.Do("triggerHeader", (Commands c, TriggerHeaderArgs a) =>
            c.EditTriggers(document => document.SetHeader(a.Comment, a.Code))),
        CommandEntry.Do("triggerDelete", (Commands c, IdArgs a) => c.EditTriggers(document => document.Delete(a.Id))),
        CommandEntry.Do("triggerMove", (Commands c, TriggerMoveArgs a) =>
            c.EditTriggers(document => document.Move(a.Id, a.Parent, a.Index))),
        CommandEntry.Of("triggerVariableAdd", (Commands c, VariableAddArgs a) => c.EditTriggers(document =>
            new NewTriggerItem(document.AddVariable(new VariableInput(a.Name, a.Type, a.IsArray, a.Size, a.Initial), a.Parent)))),
        CommandEntry.Do("triggerVariableSet", (Commands c, VariableSetArgs a) => c.EditTriggers(document =>
            document.SetVariable(a.Id, new VariableInput(a.Name, a.Type, a.IsArray, a.Size, a.Initial)))),
        CommandEntry.Of("triggerFunctionAdd", (Commands c, FunctionAddArgs a) => c.EditTriggers(document =>
            new FunctionPlace(document.AddFunction(a.Id, a.Parent, a.Branch, a.Index, a.Kind, a.Name)))),
        CommandEntry.Do("triggerFunctionCopy", (Commands c, FunctionPathArgs a) =>
            c.Map().Triggers(c.Catalog()).CopyFunction(a.Id, a.Path)),
        CommandEntry.Of("triggerFunctionPaste", (Commands c, FunctionPasteArgs a) => c.EditTriggers(document =>
            new FunctionPlace(document.PasteFunction(a.Id, a.Parent, a.Branch, a.Index)))),
        CommandEntry.Do("triggerFunctionChange", (Commands c, FunctionChangeArgs a) =>
            c.EditTriggers(document => document.ChangeFunction(a.Id, a.Path, a.Name))),
        CommandEntry.Do("triggerFunctionDelete", (Commands c, FunctionPathArgs a) =>
            c.EditTriggers(document => document.DeleteFunction(a.Id, a.Path))),
        CommandEntry.Do("triggerFunctionEnable", (Commands c, FunctionEnableArgs a) =>
            c.EditTriggers(document => document.EnableFunction(a.Id, a.Path, a.Enabled))),
        CommandEntry.Of("triggerCards", (Commands c, CardsArgs a) => c.Map().Triggers(c.Catalog()).Cards(a.Parent, c.Map())),
        CommandEntry.Do("triggerPlaces", (Commands c, PlacesArgs a) => c.EditTriggers(document => document.SetPlaces(a.Places))),
        CommandEntry.Do("triggerFolded", (Commands c, FoldedArgs a) => c.EditTriggers(document =>
        {
            document.SetPlaces(a.Places);
            document.SetFolded(a.Id, a.Folded);
        })),
        CommandEntry.Do("triggerFunctionMove", (Commands c, FunctionMoveArgs a) => c.EditTriggers(document =>
            document.MoveFunction(a.From, a.Path, a.Id, a.Parent, a.Branch, a.Index))),
        CommandEntry.Do("triggerParameter", (Commands c, ParameterArgs a) =>
            c.EditTriggers(document => document.SetParameter(a.Id, a.Path, new ParamInput(a.Kind, a.Value)))),
    ];
}
