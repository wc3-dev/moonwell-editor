using System.Text.Json.Serialization;
using MoonwellEditor.Files;

namespace MoonwellEditor.Model;

/// <summary>Why a command failed, as the page sees it in the error's <c>code</c>, so it can tell a reason from a bug.</summary>
[JsonConverter(typeof(CamelCaseEnum<ErrorCode>))]
public enum ErrorCode
{
    /// <summary>No such object.</summary>
    NoObject,

    /// <summary>No such field, or not at that level.</summary>
    NoField,

    /// <summary>Text in a number field.</summary>
    NotNumber,

    /// <summary>A value the field's type does not take: a yes/no field's other than 1 and 0, a choice's not on its list.</summary>
    BadValue,

    /// <summary>The id is taken.</summary>
    IdTaken,

    /// <summary>The id is not one the game takes.</summary>
    IdInvalid,

    /// <summary>The kind or the object cannot be edited.</summary>
    ReadOnly,

    /// <summary>Text a map file cannot hold.</summary>
    BadText,

    /// <summary>The map changed on disk since it was read.</summary>
    ChangedOnDisk,

    /// <summary>The map's files could not be read or written; the message says why.</summary>
    MapFile,

    /// <summary>No map is open.</summary>
    NoMap,

    /// <summary>The open map has unsaved edits, and the page did not say to discard them.</summary>
    Unsaved,

    /// <summary>The app has no command of that name.</summary>
    UnknownCommand,

    /// <summary>The request or its arguments are not what the command takes: a bug in the page.</summary>
    BadRequest,

    /// <summary>The command failed for a reason the page cannot act on; the message says what.</summary>
    Failed,

    /// <summary>No Warcraft III folder is chosen or found.</summary>
    GameDataMissing,

    /// <summary>The game data is still loading.</summary>
    GameDataLoading,

    /// <summary>The game data could not be loaded.</summary>
    GameDataFailed,

    /// <summary>A trigger edit was refused.</summary>
    TriggerEdit,

    /// <summary>The Warcraft III install's files are not open.</summary>
    NoAssets,

    /// <summary>No shell to run in the terminal.</summary>
    NoShell,
}
