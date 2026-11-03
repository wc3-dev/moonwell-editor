using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace MoonwellEditor.BridgeTypes;

/// <summary>The XML doc comments of some assemblies, as one line of text each, for the page's types.</summary>
public sealed partial class DocComments
{
    private readonly Dictionary<string, XElement> _members;

    private DocComments(Dictionary<string, XElement> members)
    {
        _members = members;
    }

    /// <summary>No docs at all.</summary>
    public static DocComments None { get; } = new([]);

    /// <summary>Reads the documentation file next to each assembly; an assembly without one adds nothing.</summary>
    /// <param name="assemblies">The assemblies.</param>
    /// <returns>Their docs.</returns>
    public static DocComments Load(IEnumerable<Assembly> assemblies)
    {
        var members = new Dictionary<string, XElement>(StringComparer.Ordinal);
        foreach (var assembly in assemblies)
        {
            var path = Path.ChangeExtension(assembly.Location, ".xml");
            if (!File.Exists(path))
            {
                continue;
            }

            foreach (var member in XDocument.Load(path).Descendants("member"))
            {
                if (member.Attribute("name")?.Value is { } name)
                {
                    members[name] = member;
                }
            }
        }

        return new DocComments(members);
    }

    /// <summary>A type's summary; null when it has none.</summary>
    /// <param name="type">The type.</param>
    /// <returns>The text.</returns>
    public string? OfType(Type type) =>
        _members.TryGetValue("T:" + Id(type), out var member) ? Text(member.Element("summary")) : null;

    /// <summary>
    /// A property's own summary, else the <c>param</c> of the record it comes from; null when it has neither.
    /// </summary>
    /// <param name="owner">The type the property is on.</param>
    /// <param name="name">The property's C# name.</param>
    /// <returns>The text.</returns>
    public string? OfProperty(Type owner, string name)
    {
        if (_members.TryGetValue($"P:{Id(owner)}.{name}", out var property)
            && Text(property.Element("summary")) is { } summary)
        {
            return summary;
        }

        return _members.TryGetValue("T:" + Id(owner), out var type)
            ? Text(type.Elements("param").FirstOrDefault(param => param.Attribute("name")?.Value == name))
            : null;
    }

    private static string Id(Type type) => type.FullName!.Replace('+', '.');

    private static string? Text(XElement? element)
    {
        if (element == null)
        {
            return null;
        }

        var text = new StringBuilder();
        Append(text, element);
        var line = Spaces().Replace(text.ToString(), " ").Trim().Replace("*/", "*\\/", StringComparison.Ordinal);
        return line.Length == 0 ? null : line;
    }

    private static void Append(StringBuilder text, XElement element)
    {
        foreach (var node in element.Nodes())
        {
            switch (node)
            {
                case XText plain:
                    text.Append(plain.Value);
                    break;
                case XElement { Name.LocalName: "c" } code:
                    text.Append('`').Append(code.Value).Append('`');
                    break;
                case XElement { Name.LocalName: "see" or "seealso" } see:
                    text.Append(see.Attribute("cref") is { } cref
                        ? CrefName(cref.Value)
                        : see.Attribute("langword")?.Value ?? see.Value);
                    break;
                case XElement { Name.LocalName: "paramref" or "typeparamref" } reference:
                    text.Append(reference.Attribute("name")?.Value);
                    break;
                case XElement other:
                    Append(text, other);
                    text.Append(' ');
                    break;
            }
        }
    }

    // T:A.B.Type is Type; P:A.B.Type.Member (and M:, F:, E:) is Type.Member.
    private static string CrefName(string cref)
    {
        var kind = cref.Length > 2 && cref[1] == ':' ? cref[0] : 'T';
        var name = cref.Length > 2 && cref[1] == ':' ? cref[2..] : cref;
        var parameters = name.IndexOf('(', StringComparison.Ordinal);
        if (parameters >= 0)
        {
            name = name[..parameters];
        }

        var parts = name.Split('.').Select(part => part.Split('`')[0]).ToArray();
        return kind == 'T' || parts.Length < 2 ? parts[^1] : $"{parts[^2]}.{parts[^1]}";
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex Spaces();
}
