using System.Text.Json.Serialization;
using MoonwellEditor.Files;

namespace MoonwellEditor.Triggers;

/// <summary>What an item of the trigger tree is.</summary>
[JsonConverter(typeof(CamelCaseEnum<TriggerItemKind>))]
public enum TriggerItemKind
{
    /// <summary>The map's own top category (World Editor's map header).</summary>
    Root,

    /// <summary>A category.</summary>
    Category,

    /// <summary>A trigger made of functions.</summary>
    Trigger,

    /// <summary>A trigger written as text.</summary>
    Custom,

    /// <summary>A script.</summary>
    Script,

    /// <summary>A comment.</summary>
    Comment,

    /// <summary>A variable.</summary>
    Variable,
}

/// <summary>What a trigger function is: where it goes in a trigger, or a call that fills a parameter.</summary>
[JsonConverter(typeof(CamelCaseEnum<FunctionKind>))]
public enum FunctionKind
{
    /// <summary>An event.</summary>
    Event,

    /// <summary>A condition.</summary>
    Condition,

    /// <summary>An action.</summary>
    Action,

    /// <summary>A call that gives a parameter its value.</summary>
    Call,
}

/// <summary>What a parameter holds.</summary>
[JsonConverter(typeof(CamelCaseEnum<ParameterKind>))]
public enum ParameterKind
{
    /// <summary>One of the game's presets.</summary>
    Preset,

    /// <summary>A variable.</summary>
    Variable,

    /// <summary>A call to a function.</summary>
    Function,

    /// <summary>A value typed in.</summary>
    Value,

    /// <summary>Nothing yet.</summary>
    None,
}

/// <summary>What a block of a function (an If's Then, a loop's Actions) holds.</summary>
[JsonConverter(typeof(CamelCaseEnum<BlockKind>))]
public enum BlockKind
{
    /// <summary>Conditions.</summary>
    Condition,

    /// <summary>Actions.</summary>
    Action,
}

/// <summary>What a map's scripts are written in.</summary>
[JsonConverter(typeof(CamelCaseEnum<MapLanguage>))]
public enum MapLanguage
{
    /// <summary>JASS.</summary>
    Jass,

    /// <summary>Lua.</summary>
    Lua,
}
