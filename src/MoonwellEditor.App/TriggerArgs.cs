using MoonwellEditor.Triggers;

namespace MoonwellEditor.App;

/// <summary>An item of the trigger tree, by its id.</summary>
/// <param name="Id">The item's id.</param>
public sealed record IdArgs(int Id);

/// <summary>A new item of the trigger tree.</summary>
/// <param name="Kind">What it is: a category, a trigger, a script or a comment.</param>
/// <param name="Parent">The category it goes in.</param>
public sealed record TriggerAddArgs(TriggerItemKind Kind, int Parent);

/// <summary>A new name for an item.</summary>
/// <param name="Id">The item's id.</param>
/// <param name="Name">Its new name.</param>
public sealed record RenameArgs(int Id, string Name);

/// <summary>A trigger's options; each left out or null stays as it is.</summary>
/// <param name="Id">The trigger's id.</param>
/// <param name="Enabled">Whether it is enabled.</param>
/// <param name="InitiallyOn">Whether it is on when the map starts.</param>
/// <param name="RunOnInit">Whether it runs when the map starts.</param>
/// <param name="Description">Its comment.</param>
public sealed record TriggerOptionsArgs(
    int Id, bool? Enabled = null, bool? InitiallyOn = null, bool? RunOnInit = null, string? Description = null);

/// <summary>A script's or a custom trigger's text.</summary>
/// <param name="Id">The item's id.</param>
/// <param name="Code">Its text.</param>
public sealed record TriggerCodeArgs(int Id, string Code);

/// <summary>The map header's comment and script.</summary>
/// <param name="Comment">The comment.</param>
/// <param name="Code">The script.</param>
public sealed record TriggerHeaderArgs(string Comment, string Code);

/// <summary>Where an item moves to.</summary>
/// <param name="Id">The item's id.</param>
/// <param name="Parent">The category it goes in.</param>
/// <param name="Index">Its place among the category's items, counted with it taken out.</param>
public sealed record TriggerMoveArgs(int Id, int Parent, int Index);

/// <summary>A new variable.</summary>
/// <param name="Name">Its name.</param>
/// <param name="Type">Its type's key.</param>
/// <param name="IsArray">True for an array.</param>
/// <param name="Size">An array's size.</param>
/// <param name="Parent">The category it goes in.</param>
/// <param name="Initial">Its first value; empty for none.</param>
public sealed record VariableAddArgs(string Name, string Type, bool IsArray, int Size, int Parent, string Initial = "");

/// <summary>A variable's new fields.</summary>
/// <param name="Id">The variable's id.</param>
/// <param name="Name">Its name.</param>
/// <param name="Type">Its type's key.</param>
/// <param name="IsArray">True for an array.</param>
/// <param name="Size">An array's size.</param>
/// <param name="Initial">Its first value; empty for none.</param>
public sealed record VariableSetArgs(int Id, string Name, string Type, bool IsArray, int Size, string Initial = "");

/// <summary>A new function, and where it goes.</summary>
/// <param name="Id">The trigger's id.</param>
/// <param name="Parent">The path of the function whose block it goes in; null for the trigger's own list.</param>
/// <param name="Branch">The block's branch.</param>
/// <param name="Index">Its place in the list.</param>
/// <param name="Kind">What it is.</param>
/// <param name="Name">The function's name.</param>
public sealed record FunctionAddArgs(int Id, string? Parent, int Branch, int Index, FunctionKind Kind, string Name);

/// <summary>A function of a trigger.</summary>
/// <param name="Id">The trigger's id.</param>
/// <param name="Path">The function's path.</param>
public sealed record FunctionPathArgs(int Id, string Path);

/// <summary>Where the copied function goes.</summary>
/// <param name="Id">The trigger's id.</param>
/// <param name="Parent">The path of the function whose block it goes in; null for the trigger's own list.</param>
/// <param name="Branch">The block's branch.</param>
/// <param name="Index">Its place in the list.</param>
public sealed record FunctionPasteArgs(int Id, string? Parent, int Branch, int Index);

/// <summary>Another function in a function's place.</summary>
/// <param name="Id">The trigger's id.</param>
/// <param name="Path">The function's path.</param>
/// <param name="Name">The new function's name.</param>
public sealed record FunctionChangeArgs(int Id, string Path, string Name);

/// <summary>A function enabled or disabled.</summary>
/// <param name="Id">The trigger's id.</param>
/// <param name="Path">The function's path.</param>
/// <param name="Enabled">True to enable it.</param>
public sealed record FunctionEnableArgs(int Id, string Path, bool Enabled);

/// <summary>A category's grid.</summary>
/// <param name="Parent">The category's id.</param>
public sealed record CardsArgs(int Parent);

/// <summary>Where cards were put.</summary>
/// <param name="Places">The cards.</param>
public sealed record PlacesArgs(IReadOnlyList<CardMove> Places);

/// <summary>A card folded or unfolded, with where the grid's cards are.</summary>
/// <param name="Id">The card's id.</param>
/// <param name="Folded">True to fold it.</param>
/// <param name="Places">The grid's cards.</param>
public sealed record FoldedArgs(int Id, bool Folded, IReadOnlyList<CardMove> Places);

/// <summary>A function moved to a place of the same or another trigger.</summary>
/// <param name="From">The trigger it is in.</param>
/// <param name="Path">Its path there.</param>
/// <param name="Id">The trigger it goes to.</param>
/// <param name="Parent">The path of the function whose block it goes in; null for the trigger's own list.</param>
/// <param name="Branch">The block's branch.</param>
/// <param name="Index">Its place in the list, counted with it taken out.</param>
public sealed record FunctionMoveArgs(int From, string Path, int Id, string? Parent, int Branch, int Index);

/// <summary>A parameter's new value.</summary>
/// <param name="Id">The trigger's id.</param>
/// <param name="Path">The parameter's path.</param>
/// <param name="Kind">What it holds now.</param>
/// <param name="Value">The value, as the map's file holds it.</param>
public sealed record ParameterArgs(int Id, string Path, ParameterKind Kind, string Value);
