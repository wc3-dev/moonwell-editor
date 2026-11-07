using System.Text.Json;
using System.Text.Json.Serialization;
using MoonwellEditor.Files;
using MoonwellEditor.Map;
using MoonwellEditor.Model;

namespace MoonwellEditor.App;

/// <summary>A kind of object.</summary>
/// <param name="Kind">The kind.</param>
public sealed record KindArgs(ObjectKind Kind);

/// <summary>An object.</summary>
/// <param name="Kind">Its kind.</param>
/// <param name="Id">Its id.</param>
public sealed record ObjectArgs(ObjectKind Kind, string Id);

/// <summary>One field of an object at a level.</summary>
/// <param name="Kind">The object's kind.</param>
/// <param name="Id">The object's id.</param>
/// <param name="Field">The field's id.</param>
/// <param name="Level">The level, from 1, for a per-level field; 0 for any other.</param>
public sealed record FieldArgs(ObjectKind Kind, string Id, string Field, int Level);

/// <summary>A field to set, typed as text.</summary>
/// <param name="Kind">The object's kind.</param>
/// <param name="Id">The object's id.</param>
/// <param name="Field">The field's id.</param>
/// <param name="Level">The level, from 1, for a per-level field; 0 for any other.</param>
/// <param name="Value">The value, as it was typed.</param>
public sealed record SetFieldArgs(ObjectKind Kind, string Id, string Field, int Level, string Value);

/// <summary>A custom object to make, based on a standard one.</summary>
/// <param name="Kind">Its kind.</param>
/// <param name="BaseId">The standard object it is based on.</param>
/// <param name="Id">Its id; left out or null for the next free one.</param>
public sealed record CreateObjectArgs(ObjectKind Kind, string BaseId, string? Id = null);

/// <summary>A custom object to make as a copy of another.</summary>
/// <param name="Kind">Its kind.</param>
/// <param name="FromId">The object it copies.</param>
/// <param name="Id">Its id; left out or null for the next free one.</param>
public sealed record CopyObjectArgs(ObjectKind Kind, string FromId, string? Id = null);

/// <summary>The object a new id would be based on, or a copy made of.</summary>
/// <param name="Kind">Its kind.</param>
/// <param name="BaseId">The standard object, or the custom object copied.</param>
public sealed record NextIdArgs(ObjectKind Kind, string BaseId);

/// <summary>A map to open.</summary>
/// <param name="Path">A map folder or an archive file; left out or null for the user to pick one.</param>
/// <param name="Archive">With no path: true asks for an archive, false for a folder.</param>
/// <param name="Discard">True lets the app drop unsaved edits: the user chose Discard (or saved).</param>
public sealed record OpenMapArgs(string? Path = null, bool Archive = false, bool Discard = false);

/// <summary>How to read the map again.</summary>
/// <param name="Discard">True lets the app drop unsaved edits.</param>
public sealed record ReloadArgs(bool Discard = false);

/// <summary>A search.</summary>
/// <param name="Query">What was typed.</param>
/// <param name="Limit">The most hits to give.</param>
public sealed record SearchArgs(string Query, int Limit);

/// <summary>The table's rows to give.</summary>
/// <param name="Kind">The kind.</param>
/// <param name="Ids">The objects, in the order of the rows.</param>
/// <param name="Columns">The columns, in order.</param>
public sealed record TableArgs(ObjectKind Kind, IReadOnlyList<string> Ids, IReadOnlyList<Column> Columns);

/// <summary>Cells to set as one edit.</summary>
/// <param name="Kind">The kind.</param>
/// <param name="Edits">The cells.</param>
public sealed record SetCellsArgs(ObjectKind Kind, IReadOnlyList<CellEdit> Edits);

/// <summary>The window frame's colours, each <c>#rrggbb</c>.</summary>
/// <param name="Surface">The title bar's.</param>
/// <param name="Border">The border's.</param>
public sealed record FrameColorsArgs(string Surface, string Border);

/// <summary>A scale for the page.</summary>
/// <param name="Percent">The scale, in percent: one of <see cref="Commands.UiScales"/>.</param>
public sealed record UiScaleArgs(int Percent);

/// <summary>What the icon and model pickers list.</summary>
[JsonConverter(typeof(CamelCaseEnum<AssetListKind>))]
public enum AssetListKind
{
    /// <summary>The game's icons.</summary>
    Icon,

    /// <summary>The game's models.</summary>
    Model,
}

/// <summary>The game's files for a picker.</summary>
/// <param name="Kind">Icons or models.</param>
/// <param name="Mode">The graphics mode: <c>sd</c>, <c>hd</c> or <c>de</c>.</param>
public sealed record AssetListArgs(AssetListKind Kind, string Mode = "de");

/// <summary>The map view's scene to build.</summary>
/// <param name="Mode">The graphics mode: <c>sd</c>, <c>hd</c> or <c>de</c>.</param>
public sealed record MapSceneArgs(string Mode = "de");

/// <summary>One step of a ground brush's stroke in the Terrain Editor.</summary>
/// <param name="Tool">What the brush does.</param>
/// <param name="Points">Where it is used, each an x and a y, in the order the mouse passed them.</param>
/// <param name="Shape">The brush's outline.</param>
/// <param name="Size">How many corners across the brush is, 1 to 8.</param>
/// <param name="Strength">How far a raise or lower moves the ground in the middle at each point, in game units.</param>
/// <param name="Tile">The tile a paint gives, by its id (<c>Ldrt</c>); null for the other tools.</param>
/// <param name="First">True for a stroke's first step: the one before it, if still open, is closed.</param>
/// <param name="Mode">The graphics mode the map view draws in: <c>sd</c>, <c>hd</c> or <c>de</c>.</param>
/// <param name="CliffType">The cliff type a cliff tool gives: its number in the map's list.</param>
public sealed record TerrainStrokeArgs(
    GroundTool Tool,
    IReadOnlyList<float[]> Points,
    BrushShape Shape,
    int Size,
    float Strength,
    string? Tile,
    bool First,
    string Mode = "de",
    int CliffType = 0);

/// <summary>A thing to place in the Terrain Editor.</summary>
/// <param name="Kind">What kind of thing.</param>
/// <param name="TypeId">Its type's id, <c>hfoo</c>.</param>
/// <param name="X">Where it goes.</param>
/// <param name="Y">Where it goes.</param>
/// <param name="Owner">The player a unit belongs to: 0 for player 1, 24 Neutral Hostile, 27 Neutral Passive.</param>
public sealed record PlaceArgs(PlaceKind Kind, string TypeId, float X, float Y, int Owner = 0);

/// <summary>A placed thing to change, by its number (see <c>terrainThings</c>), with what to change.</summary>
/// <param name="Number">The thing's number, from 1.</param>
/// <param name="X">Where a move takes it.</param>
/// <param name="Y">Where a move takes it.</param>
/// <param name="Degrees">How far a turn turns it, counter-clockwise.</param>
/// <param name="Scale">The scale a resize gives a doodad or destructable.</param>
/// <param name="Owner">The player a unit is given to.</param>
public sealed record ThingArgs(int Number, float X = 0, float Y = 0, float Degrees = 0, float Scale = 1, int Owner = 0);

/// <summary>A region to make or change in the Terrain Editor.</summary>
/// <param name="Number">The region's number, from 1; 0 for a new one.</param>
/// <param name="Left">Its left edge.</param>
/// <param name="Bottom">Its bottom edge.</param>
/// <param name="Right">Its right edge.</param>
/// <param name="Top">Its top edge.</param>
/// <param name="Name">Its name; null keeps it (a new one's own).</param>
public sealed record RegionArgs(int Number, float Left, float Bottom, float Right, float Top, string? Name = null);

/// <summary>A camera to make or change in the Terrain Editor, in the game's terms.</summary>
/// <param name="Number">The camera's number, from 1; 0 for a new one.</param>
/// <param name="X">The x it looks at.</param>
/// <param name="Y">The y it looks at.</param>
/// <param name="Rotation">Which way it looks, in degrees counter-clockwise from east (90 looks north).</param>
/// <param name="AngleOfAttack">How it tilts, in degrees (304 looks 56 degrees down).</param>
/// <param name="Distance">How far it stands from what it looks at.</param>
/// <param name="Name">Its name; null keeps it (a new one's own).</param>
public sealed record CameraArgs(
    int Number, float X, float Y, float Rotation, float AngleOfAttack, float Distance, string? Name = null);

/// <summary>A map's path.</summary>
/// <param name="Path">The map folder's or archive file's path.</param>
public sealed record PathArgs(string Path);

/// <summary>A shell to start.</summary>
/// <param name="Shell">The shell's id; one no longer on this PC, or "", runs the default.</param>
/// <param name="Columns">The terminal's width, in characters.</param>
/// <param name="Rows">The terminal's height, in lines.</param>
public sealed record TerminalStartArgs(string Shell, int Columns, int Rows);

/// <summary>What was typed in a shell.</summary>
/// <param name="Id">The shell's id.</param>
/// <param name="Text">The text.</param>
public sealed record TerminalWriteArgs(int Id, string Text);

/// <summary>A shell's new size.</summary>
/// <param name="Id">The shell's id.</param>
/// <param name="Columns">The terminal's width, in characters.</param>
/// <param name="Rows">The terminal's height, in lines.</param>
public sealed record TerminalResizeArgs(int Id, int Columns, int Rows);

/// <summary>A running shell.</summary>
/// <param name="Id">The shell's id.</param>
public sealed record TerminalIdArgs(int Id);

/// <summary>A file of the .moonwell folder to write.</summary>
/// <param name="File">Its place in the folder: <c>settings.json</c>, <c>hotkeys.json</c>, a theme or a schema.</param>
/// <param name="Text">Its new text.</param>
public sealed record WriteHomeArgs(string File, string Text);

/// <summary>A value for <c>state.json</c>.</summary>
/// <param name="Key">Its key.</param>
/// <param name="Value">The value, any JSON.</param>
public sealed record SetStateArgs(string Key, JsonElement Value);

/// <summary>The .moonwell folder, or a file in it, to open in the shell.</summary>
/// <param name="File">The file; left out or null for the folder.</param>
public sealed record OpenHomeArgs(string? File = null);
