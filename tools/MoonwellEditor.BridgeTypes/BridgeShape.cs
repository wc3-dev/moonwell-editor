namespace MoonwellEditor.BridgeTypes;

/// <summary>One command the page can send, as the generator sees it.</summary>
/// <param name="Name">The command's name, as the page sends it.</param>
/// <param name="Args">The record its arguments are read into.</param>
/// <param name="Answer">The type of its answer; null when it answers <c>null</c>.</param>
/// <param name="AnswerNullable">True when the answer can be <c>null</c> as well.</param>
/// <param name="Told">True for a command the page tells without waiting for an answer.</param>
public sealed record CommandShape(string Name, Type Args, Type? Answer, bool AnswerNullable, bool Told);

/// <summary>One event the app sends the page.</summary>
/// <param name="Name">The event's name.</param>
/// <param name="Payload">The type of what it carries.</param>
public sealed record EventShape(string Name, Type Payload);

/// <summary>Everything that crosses the bridge, for the generator to write.</summary>
/// <param name="Commands">The commands.</param>
/// <param name="Events">The events.</param>
/// <param name="ErrorCode">The enum of the error codes a failed command answers with.</param>
/// <param name="Others">Other types the page reads, written as answers.</param>
public sealed record BridgeShape(
    IReadOnlyList<CommandShape> Commands,
    IReadOnlyList<EventShape> Events,
    Type ErrorCode,
    IReadOnlyList<Type> Others);

/// <summary>A type the generator cannot write, or two types it cannot tell apart on the page.</summary>
/// <param name="message">What is wrong, with the path to the type.</param>
public sealed class BridgeTypesException(string message) : Exception(message);
