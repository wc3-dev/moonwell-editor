using System.Text.RegularExpressions;
using MoonwellEditor.Files;
using War3Net.Build;
using War3Net.Build.Environment;
using War3Net.Build.Extensions;
using War3Net.Build.Info;
using War3Net.Build.Widget;
using War3Net.CodeAnalysis;
using War3Net.CodeAnalysis.Jass.Extensions;
using War3Net.Common.Extensions;

namespace MoonwellEditor.Triggers;

/// <summary>
/// A map's script with its placed units and items as they are now. World Editor makes them in the script, from
/// <c>war3mapUnits.doo</c>: the Unit Item Tables, Items and Unit Creation parts, and main's calls of them. Only those
/// are written again, as World Editor writes them; the rest of the script stays as it is. A placed thing named in the
/// globals is set where it is made.
/// </summary>
public sealed partial class PlacedScript : MapScriptBuilder
{
    private const string Line = "//===========================================================================";
    private const string Banner = "//***************************************************************************";

    // World Editor's banners from the custom script code to the triggers, in its order.
    private static readonly string[] Order =
    [
        "Custom Script Code", "Random Groups", "Map Item Tables", "Unit Item Tables", "Destructable Item Tables",
        "Sound Assets", "Sounds", "Destructable Objects", "Items", "Unit Creation", "Regions", "Cameras", "Triggers",
    ];

    private static readonly string[] Written = ["Unit Item Tables", "Items", "Unit Creation"];

    [GeneratedRegex(@"^\s*(?:unit|item)\s+(gg_(?:unit|item)_.{4}_\d{4})\s*=\s*null\s*$")]
    private static partial Regex JassName();

    [GeneratedRegex(@"^(gg_(?:unit|item)_.{4}_\d{4}) = nil$")]
    private static partial Regex LuaName();

    // World Editor's functions for the map's things, in a Lua map's script.
    [GeneratedRegex(@"^function (InitRandomGroups|ItemTable\d+_DropItems|Unit\d+_DropItems|Destructable\d+_DropItems|InitSounds|CreateAllDestructables|CreateAllItems|CreateRegions|CreateCameras|CreateBuildingsForPlayer\d+|CreateUnitsForPlayer\d+|CreateNeutralHostileBuildings|CreateNeutralHostile|CreateNeutralPassiveBuildings|CreateNeutralPassive|CreatePlayerBuildings|CreatePlayerUnits|CreateNeutralUnits|CreateAllUnits)\(\)$")]
    private static partial Regex LuaFunction();

    private readonly Map _map;
    private readonly Func<string, string, string?> _field;
    private readonly Func<string, bool> _custom;

    // True while the parts are written for a Lua map.
    private bool _lua;

    private PlacedScript(Sources map, MapUnits units)
    {
        _map = new Map { Info = map.Info, Units = units, Regions = map.Regions };
        _field = map.Field;
        _custom = map.Custom;
        SetDefaultOptionsForMap(_map);
    }

    /// <summary>What the parts are written with beside the placed units and items.</summary>
    /// <param name="Info">The map's <c>war3map.w3i</c>.</param>
    /// <param name="Regions">The map's <c>war3map.w3r</c>, where waygates lead; null for none.</param>
    /// <param name="Field">
    /// An object's value of a field, with the map's changes, by the object's id and the field's: a unit's building flag
    /// and team colour, an ability's orders and an item's team colour. Null for none.
    /// </param>
    /// <param name="Custom">Whether an id is one of the map's custom objects.</param>
    public sealed record Sources(MapInfo Info, MapRegions? Regions, Func<string, string, string?> Field, Func<string, bool> Custom);

    /// <summary>
    /// The script <paramref name="script"/> with the units and items of <paramref name="units"/>; null, with the reason
    /// in <paramref name="problem"/>, when it cannot be written: the script's parts for them are not what World Editor
    /// writes for <paramref name="before"/>, the placed units and items the script was made from (an older World
    /// Editor's, or code changed by hand). <paramref name="named"/> adds names to set beside those the globals declare.
    /// Line ends are the script's.
    /// </summary>
    public static string? Write(string script, Sources map, MapUnits before, MapUnits units, IEnumerable<string> named, out string? problem)
    {
        var lua = map.Info.ScriptLanguage == ScriptLanguage.Lua;
        var lineEnd = script.Contains("\r\n", StringComparison.Ordinal) ? "\r\n" : "\n";
        var lines = script.Replace("\r\n", "\n").Split('\n').ToList();
        var names = Names(lines, lua);
        try
        {
            var old = new PlacedScript(map, before).Parts(names, lua);
            if (!Same(Cut(lines, lua), old))
            {
                problem = Texts.Get("app.triggers.unitsCut");
                return null;
            }

            names.UnionWith(named);
            var parts = new PlacedScript(map, units).Parts(names, lua);
            problem = lua ? SpliceLua(lines, parts) : Splice(lines, parts);
        }
        catch (Exception exception) when (exception is not OutOfMemoryException)
        {
            problem = Texts.Get("app.triggers.unitsFailed", ("reason", exception.Message));
        }

        return problem == null ? string.Join(lineEnd, lines) : null;
    }

    /// <summary>For tests: where the script's parts first differ from what is written for <paramref name="units"/>; null when they do not.</summary>
    internal static string? FirstDifference(string script, Sources map, MapUnits units)
    {
        var lua = map.Info.ScriptLanguage == ScriptLanguage.Lua;
        var lines = script.Replace("\r\n", "\n").Split('\n').ToList();
        var have = Cut(lines, lua);
        var written = new PlacedScript(map, units).Parts(Names(lines, lua), lua);
        foreach (var title in Written)
        {
            var left = have.GetValueOrDefault(title) ?? [];
            var right = written.GetValueOrDefault(title) ?? [];
            for (var i = 0; i < Math.Max(left.Count, right.Count); i++)
            {
                var a = i < left.Count ? left[i] : "<none>";
                var b = i < right.Count ? right[i] : "<none>";
                if (a.Trim() != b.Trim())
                {
                    return $"{title} line {i}: [{a}] [{b}]";
                }
            }
        }

        return null;
    }

    // The placed things the globals name.
    private static HashSet<string> Names(List<string> lines, bool lua)
    {
        var end = lua ? lines.IndexOf("function InitGlobals()") : lines.IndexOf("endglobals");
        return lines.Take(Math.Max(end, 0))
            .Select(line => (lua ? LuaName() : JassName()).Match(line))
            .Where(match => match.Success)
            .Select(match => match.Groups[1].Value)
            .ToHashSet(StringComparer.Ordinal);
    }

    // The parts written, by title, each as its lines; a part with nothing to make is left out.
    private Dictionary<string, List<string>> Parts(HashSet<string> names, bool lua)
    {
        _lua = lua;
        foreach (var name in names)
        {
            TriggerVariableReferences[name] = true;
        }

        var parts = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        if (ShouldGenerateUnitItemTables(_map))
        {
            parts["Unit Item Tables"] = Text(writer => GenerateUnitItemTables(_map, writer));
        }

        if (ShouldGenerateCreateAllItems(_map))
        {
            parts["Items"] = Text(writer =>
            {
                GenerateCreateAllItems(_map, writer);
                writer.WriteLine();
            });
        }

        if (ShouldGenerateCreateAllUnits(_map))
        {
            parts["Unit Creation"] = Text(writer =>
            {
                void Function(Action write)
                {
                    writer.WriteLine(Line);
                    write();
                    writer.WriteLine();
                }

                for (var i = 0; i < MaxPlayerSlots; i++)
                {
                    if (ShouldGenerateCreateBuildingsForPlayer(_map, i))
                    {
                        Function(() => GenerateCreateBuildingsForPlayer(_map, i, writer));
                    }

                    if (ShouldGenerateCreateUnitsForPlayer(_map, i))
                    {
                        Function(() => GenerateCreateUnitsForPlayer(_map, i, writer));
                    }
                }

                if (ShouldGenerateCreateNeutralHostile(_map))
                {
                    Function(() => GenerateCreateNeutralHostile(_map, writer));
                }

                if (ShouldGenerateCreateNeutralPassiveBuildings(_map))
                {
                    Function(() => GenerateCreateNeutralPassiveBuildings(_map, writer));
                }

                if (ShouldGenerateCreateNeutralPassive(_map))
                {
                    Function(() => GenerateCreateNeutralPassive(_map, writer));
                }

                if (ShouldGenerateCreatePlayerBuildings(_map))
                {
                    Function(() => GenerateCreatePlayerBuildings(_map, writer));
                }

                if (ShouldGenerateCreatePlayerUnits(_map))
                {
                    Function(() => GenerateCreatePlayerUnits(_map, writer));
                }

                if (ShouldGenerateCreateNeutralUnits(_map))
                {
                    Function(() => GenerateCreateNeutralUnits(_map, writer));
                }

                Function(() => GenerateCreateAllUnits(_map, writer));
            });
        }

        if (lua)
        {
            foreach (var title in parts.Keys.ToList())
            {
                parts[title] = LuaBlanks(new TriggerLua(ScriptTypes.Read()).Lines(parts[title]));
            }
        }

        return parts;
    }

    // World Editor's Lua keeps one blank line in a function, after its locals, and one after each function.
    private static List<string> LuaBlanks(List<string> lines)
    {
        var kept = new List<string>();
        var depth = 0;
        var blank = false;
        foreach (var line in lines)
        {
            var text = line.Trim();
            if (text.Length == 0)
            {
                if (depth > 0 && !blank)
                {
                    kept.Add("");
                    blank = true;
                }

                continue;
            }

            kept.Add(line);
            if (text.StartsWith("function ", StringComparison.Ordinal))
            {
                (depth, blank) = (1, false);
            }
            else if ((text.StartsWith("if ", StringComparison.Ordinal) && text.EndsWith(" then", StringComparison.Ordinal))
                || text.EndsWith(" do", StringComparison.Ordinal))
            {
                depth++;
            }
            else if (text == "end" && --depth == 0)
            {
                kept.Add("");
            }
        }

        return kept;
    }

    private static List<string> Text(Action<IndentedTextWriter> write)
    {
        using var text = new StringWriter();
        text.NewLine = "\n";
        using var writer = new IndentedTextWriter(text);
        write(writer);
        writer.Flush();
        var lines = text.ToString().Split('\n').ToList();
        if (lines[^1].Length == 0)
        {
            lines.RemoveAt(lines.Count - 1);
        }

        return lines;
    }

    // The script's parts that are written, by title, as the script has them now.
    private static Dictionary<string, List<string>> Cut(List<string> lines, bool lua)
    {
        var parts = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var (title, from, to) in lua ? LuaParts(lines) : JassParts(lines))
        {
            // A JASS part starts with its banner and a blank line.
            var start = lua ? from : from + 6;
            parts[title] = lines.GetRange(start, to - start);
        }

        return parts;
    }

    // World Editor's versions space parentheses differently, which does not change the code.
    private static bool Same(Dictionary<string, List<string>> script, Dictionary<string, List<string>> written)
    {
        // Some community maps' Lua has its functions indented; the parts written come out as World Editor's do now.
        static string Normal(List<string> lines) =>
            Regex.Replace(Regex.Replace(string.Join("\n", lines.Select(line => line.Trim())), @"\([ ]+", "("), @"[ ]+\)", ")").Trim();

        return script.Count == written.Count
            && script.All(part => written.TryGetValue(part.Key, out var other) && Normal(part.Value) == Normal(other));
    }

    // Each written part of a JASS script: its title and the lines from its banner to the next banner's.
    private static IEnumerable<(string Title, int From, int To)> JassParts(List<string> lines)
    {
        var banners = Banners(lines);
        for (var i = 0; i < banners.Count; i++)
        {
            if (Written.Contains(banners[i].Title))
            {
                yield return (banners[i].Title, banners[i].At, i + 1 < banners.Count ? banners[i + 1].At : lines.Count);
            }
        }
    }

    // World Editor's banners from the custom script code to the triggers: the title and the line of the banner's first.
    private static List<(string Title, int At)> Banners(List<string> lines)
    {
        var banners = new List<(string Title, int At)>();
        for (var i = 2; i + 2 < lines.Count; i++)
        {
            if (lines[i].StartsWith("//*  ", StringComparison.Ordinal)
                && lines[i - 2] == Banner && lines[i - 1] == "//*" && lines[i + 1] == "//*" && lines[i + 2] == Banner
                && Order.Contains(lines[i]["//*  ".Length..]))
            {
                banners.Add((lines[i]["//*  ".Length..], i - 2));
            }
        }

        // Older World Editors wrote the custom script banner twice, the code under the second, with the parts between.
        var custom = banners.FindIndex(banner => banner.Title == "Custom Script Code");
        return custom < 0 ? [] : banners[custom..];
    }

    private static string? Splice(List<string> lines, Dictionary<string, List<string>> parts)
    {
        var banners = Banners(lines);
        if (banners.Count == 0 || banners[^1].Title != "Triggers" || !SetMainCalls(lines, parts, lua: false))
        {
            return Texts.Get("app.triggers.unitsCut");
        }

        foreach (var (_, from, to) in JassParts(lines).Reverse().ToList())
        {
            lines.RemoveRange(from, to - from);
        }

        foreach (var title in Written)
        {
            if (!parts.TryGetValue(title, out var part))
            {
                continue;
            }

            var after = Order[(Array.IndexOf(Order, title) + 1)..];
            var at = Banners(lines).First(banner => after.Contains(banner.Title)).At;
            lines.InsertRange(at, [Banner, "//*", "//*  " + title, "//*", Banner, "", .. part]);
        }

        return null;
    }

    // main's calls of CreateAllItems and CreateAllUnits, there only when their part is, before InitBlizzard.
    private static bool SetMainCalls(List<string> lines, Dictionary<string, List<string>> parts, bool lua)
    {
        var main = lines.IndexOf(lua ? "function main()" : "function main takes nothing returns nothing");
        var close = main < 0 ? -1 : lines.FindIndex(main, line => line == (lua ? "end" : "endfunction"));
        // World Editor's versions space a call's parentheses differently.
        static string Spaceless(string line) => string.Concat(line.Where(each => !char.IsWhiteSpace(each)));
        int At(string name) => close < 0 ? -1 : lines.FindIndex(main, close - main, line =>
            Spaceless(line) == (lua ? name + "()" : $"call{name}()"));
        var blizzard = At("InitBlizzard");
        if (blizzard < 0)
        {
            return false;
        }

        string Call(string name) => lines[blizzard].Replace("InitBlizzard", name, StringComparison.Ordinal);
        foreach (var name in new[] { "CreateAllUnits", "CreateAllItems" })
        {
            var wanted = parts.ContainsKey(name == "CreateAllItems" ? "Items" : "Unit Creation");
            var at = At(name);
            if (at >= 0 && !wanted)
            {
                lines.RemoveAt(at);
                close--;
            }
            else if (at < 0 && wanted)
            {
                var units = At("CreateAllUnits");
                lines.Insert(units >= 0 ? units : At("InitBlizzard"), Call(name));
                close++;
            }
        }

        return true;
    }

    // World Editor's functions for the map's things in a Lua map's script, each with its part's title, from its first
    // line to the line after its end and the blank line after that.
    // shortcut: a function of the map's own Lua named as one of World Editor's, at a line's start, is taken for World
    // Editor's; tell them apart by the map's custom script code if a map ever does that.
    private static List<(string Title, int From, int To)> LuaFunctions(List<string> lines)
    {
        var functions = new List<(string Title, int From, int To)>();
        var main = lines.IndexOf("function main()");
        for (var i = 0; i < main; i++)
        {
            var match = LuaFunction().Match(lines[i]);
            if (!match.Success)
            {
                continue;
            }

            var name = match.Groups[1].Value;
            var title = name switch
            {
                "InitRandomGroups" => "Random Groups",
                "InitSounds" => "Sounds",
                "CreateAllDestructables" => "Destructable Objects",
                "CreateAllItems" => "Items",
                "CreateRegions" => "Regions",
                "CreateCameras" => "Cameras",
                _ when name.StartsWith("ItemTable", StringComparison.Ordinal) => "Map Item Tables",
                _ when name.StartsWith("Unit", StringComparison.Ordinal) => "Unit Item Tables",
                _ when name.StartsWith("Destructable", StringComparison.Ordinal) => "Destructable Item Tables",
                _ => "Unit Creation",
            };
            var to = EndOf(lines, i) + 1;
            to += to < lines.Count && lines[to].Length == 0 ? 1 : 0;
            functions.Add((title, i, to));
            i = to - 1;
        }

        return functions;
    }

    // Each written part of a Lua script: its title and the lines of its functions.
    private static IEnumerable<(string Title, int From, int To)> LuaParts(List<string> lines) =>
        LuaFunctions(lines)
            .Where(function => Written.Contains(function.Title))
            .GroupBy(function => function.Title)
            .Select(group => (group.Key, group.Min(function => function.From), group.Max(function => function.To)));

    // The line that ends the Lua function that starts at a line: World Editor's has no indent, so its blocks are counted.
    private static int EndOf(List<string> lines, int function)
    {
        var depth = 0;
        for (var i = function; i < lines.Count; i++)
        {
            var line = lines[i].Trim();
            if (line.StartsWith("function ", StringComparison.Ordinal)
                || (line.StartsWith("if ", StringComparison.Ordinal) && line.EndsWith(" then", StringComparison.Ordinal))
                || line.EndsWith(" do", StringComparison.Ordinal))
            {
                depth++;
            }
            else if (line == "end" && --depth == 0)
            {
                return i;
            }
        }

        throw new InvalidOperationException("A function of the script does not end.");
    }

    private static string? SpliceLua(List<string> lines, Dictionary<string, List<string>> parts)
    {
        if (!SetMainCalls(lines, parts, lua: true))
        {
            return Texts.Get("app.triggers.unitsCut");
        }

        // Each part where it is; a new one before the first function of a part after it, else after the last of a part
        // before it.
        foreach (var title in Written)
        {
            var part = parts.GetValueOrDefault(title) ?? [];
            if (LuaParts(lines).Where(each => each.Title == title).ToList() is [var (_, from, to)])
            {
                lines.RemoveRange(from, to - from);
                lines.InsertRange(from, part);
                continue;
            }

            if (part.Count == 0)
            {
                continue;
            }

            var functions = LuaFunctions(lines);
            var place = Array.IndexOf(Order, title);
            var next = functions.FindIndex(function => Array.IndexOf(Order, function.Title) > place);
            var previous = functions.FindLastIndex(function => Array.IndexOf(Order, function.Title) < place);
            if (next < 0 && previous < 0)
            {
                return Texts.Get("app.triggers.unitsCut");
            }

            lines.InsertRange(next >= 0 ? functions[next].From : functions[previous].To, part);
        }

        return null;
    }
}
