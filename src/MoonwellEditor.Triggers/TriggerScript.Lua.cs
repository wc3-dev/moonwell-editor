using System.Globalization;
using System.Text.RegularExpressions;
using MoonwellEditor.Files;
using War3Net.Build.Script;
using War3Net.Common.Extensions;

namespace MoonwellEditor.Triggers;

// A Lua map's script: World Editor's war3map.lua has no banners and no indent, so the parts triggers decide are found
// by the functions World Editor writes around them.
public sealed partial class TriggerScript
{
    // True for a Lua map.
    private bool _lua;

    // The functions World Editor writes before the custom script code, and after the triggers.
    [GeneratedRegex(@"^function (InitRandomGroups|ItemTable\d+_DropItems|CreateAllItems|Unit\d+_DropItems|Destructable\d+_DropItems|InitSounds|CreateAllDestructables|CreateBuildingsForPlayer\d+|CreateUnitsForPlayer\d+|CreateNeutralHostileBuildings|CreateNeutralHostile|CreateNeutralPassiveBuildings|CreateNeutralPassive|CreatePlayerBuildings|CreatePlayerUnits|CreateNeutralUnits|CreateAllUnits|CreateRegions|CreateCameras)\(\)$")]
    private static partial Regex BeforeCustom();

    [GeneratedRegex(@"^function (InitUpgrades(_Player\d+)?|InitTechTree(_Player\d+)?|InitCustomPlayerSlots|InitCustomTeams|InitAllyPriorities|main)\(\)$")]
    private static partial Regex AfterTriggers();

    [GeneratedRegex(@"FourCC\(""(?<id>.{4})""\), (?<x>-?\d+(?:\.\d+)?), (?<y>-?\d+(?:\.\d+)?)")]
    private static partial Regex LuaCreatedAt();

    private string? SpliceLua(List<string> lines)
    {
        var problem = Texts.Get("app.triggers.scriptCut");
        var initGlobals = lines.IndexOf("function InitGlobals()");
        var main = lines.IndexOf("function main()");
        if (initGlobals < 0 || main < initGlobals || !ReplaceLuaMainCalls(lines, main))
        {
            return problem;
        }

        // The custom script items come right after InitGlobals, up to the functions World Editor writes for the map's
        // things; the map's custom script code comes after those, then the triggers, which end with the last function
        // that starts them, or, with none, where the functions after them start.
        // shortcut: a line of the map's own Lua that starts a function named as one of World Editor's, at the line's
        // start, is taken for World Editor's; find the old code by the map's saved triggers if a map ever does that.
        var initGlobalsEnd = EndOf(lines, initGlobals);
        var first = -1;
        var last = -1;
        var end = -1;
        var after = -1;
        for (var i = initGlobalsEnd + 1; i > 0 && i < main + 1; i++)
        {
            if (BeforeCustom().IsMatch(lines[i]))
            {
                first = first < 0 ? i : first;
                last = EndOf(lines, i);
                i = last < 0 ? main : last;
            }
            else if (first >= 0 && lines[i] is "function InitCustomTriggers()" or "function RunInitializationTriggers()")
            {
                end = EndOf(lines, i) + 1;
            }
            else if (first >= 0 && after < 0 && AfterTriggers().IsMatch(lines[i]))
            {
                after = i;
            }
        }

        end = end > 0 ? end : after;
        if (initGlobalsEnd < 0 || first < 0 || last < 0 || end <= last)
        {
            return problem;
        }

        // The map's own Lua goes as it is, the triggers straight after it, from the blank line they start with. The blank
        // line after the triggers is the next function's.
        var types = Types();
        var header = _document.HeaderCode.Replace("\r\n", "\n").Trim('\0').TrimEnd('\n');
        var triggers = new TriggerLua(types).Lines(TriggerSection()).SkipLast(1).ToList();
        lines.RemoveRange(last + 1, end - last - 1);
        lines.InsertRange(last + 1, header.Length > 0 ? ["", .. header.Split('\n'), .. triggers.Skip(1)] : triggers);
        lines.RemoveRange(initGlobalsEnd + 1, first - initGlobalsEnd - 1);
        lines.InsertRange(initGlobalsEnd + 1, ["", .. ScriptItems()]);
        lines.RemoveRange(initGlobals, initGlobalsEnd - initGlobals + 1);
        lines.InsertRange(initGlobals, new TriggerLua(types).Lines(Text(WriteInitGlobals)));
        ReplaceLuaGlobals(lines);
        return AddLuaPlaced(lines);
    }

    // The line that ends the function that starts at a line, as World Editor writes one: no indent, so its blocks are
    // counted. -1 when it does not end.
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

        return -1;
    }

    // The custom script items that are on, one after the other, each as its text has it.
    private IEnumerable<string> ScriptItems() => _document.Triggers.TriggerItems
        .OfType<TriggerDefinition>()
        .Where(definition => definition.Type == TriggerItemType.Script && definition.IsEnabled)
        .SelectMany(definition => (_document.CodeOf(definition.Id) ?? "").Replace("\r\n", "\n").Trim('\0').Split('\n'));

    // The script types of the game and of the map's variables.
    private ScriptTypes Types()
    {
        var types = _document.Catalog.ScriptTypes.Copy();
        foreach (var variable in _document.Triggers.Variables)
        {
            types.AddGlobal("udg_" + variable.Name, _document.Catalog.Type(variable.Type)?.Base ?? variable.Type);
        }

        return types;
    }

    private void ReplaceLuaGlobals(List<string> lines)
    {
        var end = lines.IndexOf("function InitGlobals()");
        var user = Enumerable.Range(0, end).Where(i => lines[i].StartsWith("udg_", StringComparison.Ordinal)).ToList();
        var userPlace = user.Count > 0 ? user[0] : 0;
        foreach (var line in Enumerable.Reverse(user))
        {
            lines.RemoveAt(line);
        }

        end = lines.IndexOf("function InitGlobals()");
        var triggerLines = Enumerable.Range(0, end).Where(i => lines[i].StartsWith("gg_trg_", StringComparison.Ordinal)).ToList();
        var place = triggerLines.Count > 0
            ? triggerLines[0]
            : Find(lines, line => IsAfterTriggers(" " + line) || line == "function InitGlobals()");
        foreach (var line in Enumerable.Reverse(triggerLines))
        {
            lines.RemoveAt(line);
        }

        lines.InsertRange(place, Definitions().Select(definition => $"gg_trg_{TriggerJass.Identifier(definition.Name)} = nil"));
        if (ShouldGenerateUserDefinedVariables(_map))
        {
            lines.InsertRange(userPlace, _document.Triggers.Variables.Select(variable =>
            {
                var type = _document.Catalog.Type(variable.Type)?.Base ?? variable.Type;
                return $"udg_{variable.Name} = " + (variable.IsArray ? TriggerLua.NewArray(type) : type switch
                {
                    "integer" => "0",
                    "real" => "0.0",
                    "boolean" => "false",
                    "string" => "\"\"",
                    _ => "nil",
                });
            }));
        }
    }

    // The calls of main that depend on the triggers. False when main is not as World Editor writes it.
    private bool ReplaceLuaMainCalls(List<string> lines, int main)
    {
        var close = EndOf(lines, main);
        if (close < 0)
        {
            return false;
        }

        // Some maps' Lua has its functions' lines indented: main keeps its own indent.
        int Call(string call) => lines.FindIndex(main, close - main, line => line.Trim() == call);
        foreach (var call in new[] { "InitCustomTriggers()", "RunInitializationTriggers()" })
        {
            if (Call(call) is var at and >= 0)
            {
                lines.RemoveAt(at);
                close--;
            }
        }

        var blizzard = Call("InitBlizzard()");
        var initGlobals = Call("InitGlobals()");
        if (blizzard < 0 && initGlobals < 0)
        {
            return false;
        }

        var anchor = lines[blizzard >= 0 ? blizzard : initGlobals];
        var indent = anchor[..(anchor.Length - anchor.TrimStart().Length)];
        if (initGlobals < 0)
        {
            initGlobals = blizzard + 1;
            lines.Insert(initGlobals, indent + "InitGlobals()");
        }

        var enabled = Definitions().Where(each => each.IsEnabled).ToList();
        if (enabled.Any(RunsAtStart))
        {
            lines.Insert(initGlobals + 1, indent + "RunInitializationTriggers()");
        }

        if (enabled.Count > 0)
        {
            lines.Insert(initGlobals + 1, indent + "InitCustomTriggers()");
        }

        return true;
    }

    // As AddPlaced, in Lua.
    private string? AddLuaPlaced(List<string> lines)
    {
        foreach (var name in _document.PlacedNames().Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal))
        {
            var end = lines.IndexOf("function InitGlobals()");
            if (lines.Take(end).Any(line => line.StartsWith(name + " = ", StringComparison.Ordinal)))
            {
                continue;
            }

            if (name.StartsWith("gg_dest_", StringComparison.Ordinal))
            {
                return Texts.Get("app.triggers.scriptDestructable", ("name", name));
            }

            if (!SetWhereMadeLua(lines, name, name.StartsWith("gg_item_", StringComparison.Ordinal)))
            {
                return Texts.Get("app.triggers.scriptPlaced", ("name", name));
            }

            lines.Insert(lines.IndexOf("function InitGlobals()"), name + " = nil");
        }

        return null;
    }

    private bool SetWhereMadeLua(List<string> lines, string name, bool isItem)
    {
        var type = name.Substring("gg_unit_".Length, 4);
        var number = int.Parse(name["gg_unit_0000_".Length..], CultureInfo.InvariantCulture);
        var placed = _units?.Units.FirstOrDefault(each => each.CreationNumber == number && each.TypeId.ToRawcode() == type);
        if (placed == null)
        {
            return false;
        }

        for (var i = 0; i < lines.Count; i++)
        {
            var match = LuaCreatedAt().Match(lines[i]);
            if (!match.Success
                || match.Groups["id"].Value != type
                || !Near(match.Groups["x"].Value, placed.Position.X)
                || !Near(match.Groups["y"].Value, placed.Position.Y))
            {
                continue;
            }

            if (isItem && !lines[i].Contains(" = ", StringComparison.Ordinal))
            {
                lines[i] = $"{name} = {lines[i]}";
                return true;
            }

            if (!isItem && lines[i].StartsWith("u = ", StringComparison.Ordinal))
            {
                lines.Insert(i + 1, name + " = u");
                return true;
            }
        }

        return false;
    }
}
