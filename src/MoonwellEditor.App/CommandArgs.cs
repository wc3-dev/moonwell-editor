using System.Text.Json;
using System.Text.Json.Serialization;
using MoonwellEditor.Files;
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

/// <summary>The standard object a new id would be based on.</summary>
/// <param name="Kind">Its kind.</param>
/// <param name="BaseId">The standard object.</param>
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
