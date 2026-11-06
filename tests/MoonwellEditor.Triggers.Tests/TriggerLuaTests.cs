using System.Text.RegularExpressions;
using War3Net.Build.Script;
using War3Net.CodeAnalysis;

namespace MoonwellEditor.Triggers.Tests;

public sealed class TriggerLuaTests(ITestOutputHelper output)
{
    private static List<string> Lua(params string[] jass) =>
        new TriggerLua(ScriptTypes.Read(
            """
            globals
                string bj_lastPlayedMusic = ""
                integer bj_forLoopAIndex = 0
            endglobals
            native I2S takes integer i returns string
            native SetSkyModel takes string skyModelFile returns nothing
            native GetUnitLoc takes unit whichUnit returns location
            native DisplayTextToForce takes force toForce, string message returns nothing
            """)).Lines(jass);

    [Fact]
    public void Text_joined_with_a_plus_is_joined_with_two_dots_and_whole_numbers_divide_whole()
    {
        Assert.Equal(
            [
                "function Trig_T_Actions()",
                "local n = 7",
                "bj_lastPlayedMusic = (\"Wave \" .. I2S((n // 2)))",
                "bj_lastPlayedMusic = (bj_lastPlayedMusic .. \"!\")",
                "bj_forLoopAIndex = (bj_forLoopAIndex + 1)",
                "end",
            ],
            Lua(
                "function Trig_T_Actions takes nothing returns nothing",
                "    local integer n = 7",
                "    set bj_lastPlayedMusic = ( \"Wave \" + I2S(( n / 2 )) )",
                "    set bj_lastPlayedMusic = ( bj_lastPlayedMusic + \"!\" )",
                "    set bj_forLoopAIndex = ( bj_forLoopAIndex + 1 )",
                "endfunction"));
    }

    [Fact]
    public void Null_given_for_text_is_empty_text_and_for_anything_else_nil()
    {
        Assert.Equal(["SetSkyModel(\"\")", "DisplayTextToForce(nil, \"\")"], Lua("call SetSkyModel( null )", "call DisplayTextToForce( null, null )"));
    }

    [Fact]
    public void A_loop_an_exit_and_a_comparison_are_written_as_World_Editor_writes_them_in_Lua()
    {
        Assert.Equal(
            [
                "while (true) do",
                "if (bj_forLoopAIndex > 3) then break end",
                "if (not (GetUnitLoc(nil) ~= nil)) then",
                "return ",
                "end",
                "end",
            ],
            Lua(
                "loop",
                "    exitwhen bj_forLoopAIndex > 3",
                "    if ( not ( GetUnitLoc(null) != null ) ) then",
                "        return",
                "    endif",
                "endloop"));
    }

    [Fact]
    public void A_custom_script_line_is_the_maps_own_lua_with_the_jass_lines_indent()
    {
        Assert.Equal(["Foo()", "    local t = {}  ", "-- a comment"], Lua(
            "    call Foo(  )",
            "    " + TriggerLua.UserCode + "local t = {}  ",
            TriggerLua.UserCode + "-- a comment",
            "    // a GUI comment"));
    }

    [Fact]
    public void Every_function_with_its_defaults_writes_lua_with_no_jass_left()
    {
        var catalog = InstallMaps.Catalog;
        var store = InstallMaps.Open(InstallMaps.LostTemple);
        if (catalog == null || store == null)
        {
            output.WriteLine(InstallMaps.NoInstall);
            return;
        }

        var document = TriggerDocument.Read(store.Read(TriggerDocument.TriggersFile), store.Read(TriggerDocument.CustomTextFile), catalog);
        var id = document.Add(TriggerItemKind.Trigger, document.Tree().First(item => item.Kind == TriggerItemKind.Category).Id);
        var failed = new List<string>();
        var written = 0;
        var jassLeft = new Regex(@"^(call|set|local \w+ \w+|endif|endloop|endfunction|exitwhen)\b|\btakes\b|!=|\bnull\b|'[^']{4}'|\(\s+\)");
        foreach (var function in catalog.Functions.Where(each => each.Kind != FunctionKind.Call))
        {
            var before = document.Snapshot();
            document.AddFunction(id, null, 0, 0, function.Kind, function.Name);
            var definition = document.Triggers.TriggerItems.OfType<TriggerDefinition>().Single(each => each.Id == id);
            using var text = new StringWriter();
            text.NewLine = "\n";
            using var writer = new IndentedTextWriter(text);
            try
            {
                new TriggerJass(writer, document, lua: true).Write(definition);
            }
            catch (InvalidDataException)
            {
                document.Restore(before); // the game gives it no default for a parameter
                continue;
            }

            document.Restore(before);
            writer.Flush();
            written++;
            try
            {
                var lua = new TriggerLua(catalog.ScriptTypes.Copy()).Lines(text.ToString().Split('\n'));
                var strings = lua.Select(line => Regex.Replace(line, "\"(?:[^\"\\\\]|\\\\.)*\"", "\"\""));
                if (strings.FirstOrDefault(jassLeft.IsMatch) is { } left)
                {
                    failed.Add($"{function.Name}: {left}");
                }
            }
            catch (Exception exception) when (exception is not OutOfMemoryException)
            {
                failed.Add($"{function.Name}: {exception.Message}");
            }
        }

        output.WriteLine($"{written} written");
        output.WriteLine(string.Join("\n", failed.Take(40)));
        Assert.True(written > 400);
        Assert.Empty(failed);
    }
}
