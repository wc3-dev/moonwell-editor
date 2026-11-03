using System.Reflection;

namespace MoonwellEditor.App;

/// <summary>An event the app sends the page on its own, by name.</summary>
/// <param name="name">The event's name, as the page listens for it.</param>
public abstract class BridgeEvent(string name)
{
    /// <summary>The event's name.</summary>
    public string Name { get; } = name;

    /// <summary>The type of what it carries.</summary>
    public abstract Type Payload { get; }
}

/// <summary>An event that carries a <typeparamref name="T"/>, so a payload of another type does not compile.</summary>
/// <typeparam name="T">What it carries.</typeparam>
/// <param name="name">The event's name.</param>
public sealed class BridgeEvent<T>(string name) : BridgeEvent(name)
{
    /// <inheritdoc/>
    public override Type Payload => typeof(T);
}

/// <summary>Every event the app sends the page.</summary>
public static class BridgeEvents
{
    /// <summary>A game data load ended, well or badly.</summary>
    public static readonly BridgeEvent<GameDataState> GameData = new("gameData");

    /// <summary>A map was opened or reloaded, or an edit, undo, redo or save changed where it stands.</summary>
    public static readonly BridgeEvent<SessionState> SessionChanged = new("sessionChanged");

    /// <summary>A file in the .moonwell folder was saved or deleted.</summary>
    public static readonly BridgeEvent<HomeChange> HomeChanged = new("homeChanged");

    /// <summary>The user closed the window while the page is loaded; the page answers with <c>closeAsking</c>.</summary>
    public static readonly BridgeEvent<CloseRequest> CloseRequested = new("closeRequested");

    /// <summary>The window was maximized or restored.</summary>
    public static readonly BridgeEvent<WindowState> WindowState = new("windowState");

    /// <summary>A shell printed something.</summary>
    public static readonly BridgeEvent<TerminalOutput> TerminalOutput = new("terminalOutput");

    /// <summary>A shell ended.</summary>
    public static readonly BridgeEvent<TerminalExit> TerminalExit = new("terminalExit");

    /// <summary>Every event above, by name, with what it carries.</summary>
    public static IReadOnlyList<(string Name, Type Payload)> All =>
    [
        .. typeof(BridgeEvents)
            .GetFields(BindingFlags.Public | BindingFlags.Static)
            .Select(member => (BridgeEvent)member.GetValue(null)!)
            .Select(@event => (@event.Name, @event.Payload)),
    ];
}
