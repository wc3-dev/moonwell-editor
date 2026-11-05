using System.Collections;
using System.Collections.Concurrent;
using System.Reflection;
using System.Text.Json;

namespace MoonwellEditor.App;

/// <summary>The arguments of a command that takes none.</summary>
public sealed record NoArgs;

/// <summary>
/// One command the page can send: its name, the record its arguments are read into, the type of its answer and what it
/// does. The bridge runs commands from <see cref="Commands.Table"/>, and the page's types are generated from it.
/// </summary>
public sealed class CommandEntry
{
    private static readonly JsonElement NoArguments = JsonDocument.Parse("{}").RootElement.Clone();

    // Each record's lists whose items may not be null: the serializer checks a property's null, not an item's.
    private static readonly ConcurrentDictionary<Type, PropertyInfo[]> ListsOf = new();

    private readonly Func<Commands, object, object?> _run;

    private CommandEntry(
        string name, Type args, Type? answer, bool answerNullable, bool told, bool runsAlongside, Func<Commands, object, object?> run)
    {
        Name = name;
        Args = args;
        Answer = answer;
        AnswerNullable = answerNullable;
        Told = told;
        RunsAlongside = runsAlongside;
        _run = run;
    }

    /// <summary>The command's name, as the page sends it.</summary>
    public string Name { get; }

    /// <summary>The record its arguments are read into; <see cref="NoArgs"/> for none.</summary>
    public Type Args { get; }

    /// <summary>The type of its answer; null when it answers <c>null</c>.</summary>
    public Type? Answer { get; }

    /// <summary>True when the answer can be <c>null</c> as well (a nullable answer type is not seen at run time).</summary>
    public bool AnswerNullable { get; }

    /// <summary>True for a command the page tells without waiting for an answer.</summary>
    public bool Told { get; }

    /// <summary>True for a command that runs beside the one-at-a-time queue (the terminal's, and closeAsking).</summary>
    public bool RunsAlongside { get; }

    /// <summary>
    /// A command with arguments and an answer that is never null; a handler that can return null does not compile here
    /// (use <see cref="OfNullable{TArgs, TAnswer}"/>).
    /// </summary>
    /// <typeparam name="TArgs">Its arguments' record.</typeparam>
    /// <typeparam name="TAnswer">Its answer.</typeparam>
    /// <param name="name">Its name.</param>
    /// <param name="run">What it does.</param>
    /// <returns>The entry.</returns>
    public static CommandEntry Of<TArgs, TAnswer>(string name, Func<Commands, TArgs, TAnswer> run)
        where TArgs : notnull
        where TAnswer : notnull =>
        new(name, typeof(TArgs), typeof(TAnswer), false, false, false, (commands, args) => run(commands, (TArgs)args));

    /// <summary>A command with no arguments and an answer that is never null.</summary>
    /// <typeparam name="TAnswer">Its answer.</typeparam>
    /// <param name="name">Its name.</param>
    /// <param name="run">What it does.</param>
    /// <returns>The entry.</returns>
    public static CommandEntry Of<TAnswer>(string name, Func<Commands, TAnswer> run)
        where TAnswer : notnull =>
        new(name, typeof(NoArgs), typeof(TAnswer), false, false, false, (commands, _) => run(commands));

    /// <summary>A command with arguments whose answer can be <c>null</c>.</summary>
    /// <typeparam name="TArgs">Its arguments' record.</typeparam>
    /// <typeparam name="TAnswer">Its answer when it has one.</typeparam>
    /// <param name="name">Its name.</param>
    /// <param name="run">What it does.</param>
    /// <returns>The entry.</returns>
    public static CommandEntry OfNullable<TArgs, TAnswer>(string name, Func<Commands, TArgs, TAnswer?> run)
        where TArgs : notnull
        where TAnswer : class =>
        new(name, typeof(TArgs), typeof(TAnswer), true, false, false, (commands, args) => run(commands, (TArgs)args));

    /// <summary>A command with no arguments whose answer can be <c>null</c>.</summary>
    /// <typeparam name="TAnswer">Its answer when it has one.</typeparam>
    /// <param name="name">Its name.</param>
    /// <param name="run">What it does.</param>
    /// <returns>The entry.</returns>
    public static CommandEntry OfNullable<TAnswer>(string name, Func<Commands, TAnswer?> run)
        where TAnswer : class =>
        new(name, typeof(NoArgs), typeof(TAnswer), true, false, false, (commands, _) => run(commands));

    /// <summary>A command with arguments that answers <c>null</c>.</summary>
    /// <typeparam name="TArgs">Its arguments' record.</typeparam>
    /// <param name="name">Its name.</param>
    /// <param name="run">What it does.</param>
    /// <returns>The entry.</returns>
    public static CommandEntry Do<TArgs>(string name, Action<Commands, TArgs> run)
        where TArgs : notnull =>
        new(name, typeof(TArgs), null, false, false, false, (commands, args) =>
        {
            run(commands, (TArgs)args);
            return null;
        });

    /// <summary>A command with no arguments that answers <c>null</c>.</summary>
    /// <param name="name">Its name.</param>
    /// <param name="run">What it does.</param>
    /// <returns>The entry.</returns>
    public static CommandEntry Do(string name, Action<Commands> run) =>
        new(name, typeof(NoArgs), null, false, false, false, (commands, _) =>
        {
            run(commands);
            return null;
        });

    /// <summary>A command the page tells without waiting, which runs beside the queue.</summary>
    /// <typeparam name="TArgs">Its arguments' record.</typeparam>
    /// <param name="name">Its name.</param>
    /// <param name="run">What it does.</param>
    /// <returns>The entry.</returns>
    public static CommandEntry Tell<TArgs>(string name, Action<Commands, TArgs> run)
        where TArgs : notnull =>
        new(name, typeof(TArgs), null, false, true, true, (commands, args) =>
        {
            run(commands, (TArgs)args);
            return null;
        });

    /// <summary>The same command, run beside the one-at-a-time queue.</summary>
    /// <returns>The entry.</returns>
    public CommandEntry Alongside() => new(Name, Args, Answer, AnswerNullable, Told, true, _run);

    /// <summary>Reads the arguments into their record and runs the command.</summary>
    /// <exception cref="JsonException">The arguments are not what the record takes.</exception>
    internal object? Invoke(Commands commands, JsonElement args)
    {
        if (Args == typeof(NoArgs))
        {
            return _run(commands, new NoArgs());
        }

        var json = args.ValueKind == JsonValueKind.Undefined ? NoArguments : args;
        var value = json.Deserialize(Args, BridgeJson.Arguments)
            ?? throw new JsonException($"The arguments of {Name} must be an object.");
        RefuseNullItems(value);
        return _run(commands, value);
    }

    private static void RefuseNullItems(object args)
    {
        foreach (var list in ListsOf.GetOrAdd(args.GetType(), ListsWithoutNulls))
        {
            if (list.GetValue(args) is IEnumerable items && items.Cast<object?>().Any(item => item == null))
            {
                throw new JsonException($"The argument {JsonNamingPolicy.CamelCase.ConvertName(list.Name)} holds a null.");
            }
        }
    }

    private static PropertyInfo[] ListsWithoutNulls(Type type)
    {
        var nullability = new NullabilityInfoContext();
        return
        [
            .. type.GetProperties().Where(property =>
                property.PropertyType.IsGenericType
                && property.PropertyType.GetGenericTypeDefinition() == typeof(IReadOnlyList<>)
                && nullability.Create(property).GenericTypeArguments[0].ReadState == NullabilityState.NotNull),
        ];
    }
}
