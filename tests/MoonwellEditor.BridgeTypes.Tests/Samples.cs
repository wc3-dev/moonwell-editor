using System.Text.Json;
using System.Text.Json.Serialization;

namespace MoonwellEditor.BridgeTypes.Tests;

/// <summary>An answer.</summary>
/// <param name="Name">Its name.</param>
/// <param name="Title">Its title; null for none.</param>
public sealed record Answer(string Name, string? Title);

/// <summary>Some arguments.</summary>
public sealed record Args(int Level, string? Parent, string Mode = "de", string? Path = null);

public sealed record Holder(
    IReadOnlyList<string> Names,
    IReadOnlyDictionary<string, int> ByName,
    IReadOnlyDictionary<CamelKind, int> ByKind);

[JsonConverter(typeof(JsonStringEnumConverter<PascalKind>))]
public enum PascalKind
{
    Unit,
    StartLocation,
}

[JsonConverter(typeof(CamelKindConverter))]
public enum CamelKind
{
    Unit,
    StartLocation,
}

public sealed class CamelKindConverter() : JsonStringEnumConverter<CamelKind>(JsonNamingPolicy.CamelCase);

public enum PlainKind
{
    A,
    B,
}

public sealed record Kinds(PascalKind Pascal, CamelKind Camel, PlainKind Plain);

/// <summary>The <c>x</c> of <see cref="Answer"/>.</summary>
public sealed record Documented(string Value);

public sealed record Empty;

public sealed record Loose(object Payload);

public sealed record Recursive(string Path, Recursive? Child);

public sealed record Both(string Name = "");

public sealed record Clash(First.Thing A, Second.Thing B);

[JsonConverter(typeof(SampleCodeConverter))]
public enum SampleCode
{
    NoMap,
    BadRequest,
}

public sealed class SampleCodeConverter() : JsonStringEnumConverter<SampleCode>(JsonNamingPolicy.CamelCase);
