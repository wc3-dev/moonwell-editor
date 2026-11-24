using System.Text;
using System.Text.RegularExpressions;

namespace MoonwellEditor.Triggers.Tests;

public sealed class TriggerCatalogTests(ITestOutputHelper output)
{
    [Fact]
    public void The_games_file_is_read_with_its_repeated_line()
    {
        var catalog = InstallMaps.Catalog;
        if (catalog == null)
        {
            output.WriteLine(InstallMaps.NoInstall);
            return;
        }

        Assert.NotEmpty(catalog.Functions);
        Assert.Single(catalog.Presets, preset => preset.Key == "UnitOrderChallengingCall");
    }

    [Fact]
    public void A_sentence_is_its_text_and_arguments_in_order()
    {
        var catalog = InstallMaps.Catalog;
        if (catalog == null)
        {
            output.WriteLine(InstallMaps.NoInstall);
            return;
        }

        var periodic = catalog.Event("TriggerRegisterTimerEventPeriodic")!;

        Assert.Equal("Periodic Event", periodic.Title);
        Assert.Equal(["real"], periodic.Arguments);
        Assert.Equal(
            [new SentencePart("Every "), new SentencePart("Time", 0), new SentencePart(" seconds of game time")],
            periodic.Sentence);
        Assert.Equal("TC_TIME", periodic.Category);
    }

    [Fact]
    public void A_sentence_that_starts_with_its_title_drops_it()
    {
        var catalog = InstallMaps.Catalog;
        if (catalog == null)
        {
            output.WriteLine(InstallMaps.NoInstall);
            return;
        }

        var set = catalog.Action("SetVariable")!;

        Assert.Equal("Set ", set.Sentence[0].Text);
        Assert.Equal(0, set.Sentence[1].Argument);
    }

    [Fact]
    public void A_sentence_that_starts_with_its_title_before_an_argument_drops_it()
    {
        if (InstallMaps.ReadGame(@"UI\TriggerData.txt") is not { } data)
        {
            output.WriteLine(InstallMaps.NoInstall);
            return;
        }

        var text = Encoding.UTF8.GetString(data);
        var key = "_TriggerRegisterTimerEventPeriodic_Parameters=";
        var changed = Regex.Replace(text, "(?m)^" + key + @"[^\r\n]*", key + "\"Periodic Event\",~Time");
        Assert.NotEqual(text, changed);

        var catalog = TriggerCatalog.Read(path =>
            path == @"UI\TriggerData.txt" ? Encoding.UTF8.GetBytes(changed) : InstallMaps.ReadGame(path));

        Assert.Equal([new SentencePart("Time", 0)], catalog.Event("TriggerRegisterTimerEventPeriodic")!.Sentence);
    }

    [Fact]
    public void Each_argument_shows_once_in_its_sentence()
    {
        var catalog = InstallMaps.Catalog;
        if (catalog == null)
        {
            output.WriteLine(InstallMaps.NoInstall);
            return;
        }

        var wrong = catalog.Functions
            .Where(function => function.Sentence.Count(part => part.Argument >= 0) != function.Arguments.Count)
            .Select(function => $"{function.Kind} {function.Name}: {function.Arguments.Count}")
            .ToList();
        output.WriteLine(string.Join("\n", wrong));

        Assert.Empty(wrong);
    }

    // TriggerJass.Condition writes a condition of three arguments as "( a op b )" and any other by its own name.
    [Fact]
    public void Every_condition_of_three_arguments_is_a_comparison_and_none_has_a_script_name()
    {
        var catalog = InstallMaps.Catalog;
        if (catalog == null)
        {
            output.WriteLine(InstallMaps.NoInstall);
            return;
        }

        var conditions = catalog.Functions.Where(function => function.Kind == FunctionKind.Condition).ToList();
        var wrong = conditions
            .Where(function => function.Arguments.Count == 3
                ? !function.Name.StartsWith("OperatorCompare", StringComparison.Ordinal)
                    || !function.Arguments[1].EndsWith("Operator", StringComparison.Ordinal)
                : function.Name is not ("GetBooleanAnd" or "GetBooleanOr" or "AndMultiple" or "OrMultiple"))
            .Select(function => $"{function.Name}: {string.Join(", ", function.Arguments)}")
            .Concat(conditions.Where(function => catalog.CallScriptNames.ContainsKey(function.Name)).Select(each => each.Name))
            .ToList();
        output.WriteLine(string.Join("\n", wrong));

        Assert.NotEmpty(conditions);
        Assert.Empty(wrong);
    }

    [Fact]
    public void A_presets_text_is_the_editors()
    {
        var catalog = InstallMaps.Catalog;
        if (catalog == null)
        {
            output.WriteLine(InstallMaps.NoInstall);
            return;
        }

        var red = catalog.Preset("Player00")!;

        Assert.Equal("player", red.Type);
        Assert.Equal("Player 1 (Red)", red.Text);
    }

    [Fact]
    public void Types_keep_the_order_of_the_variables_dialog()
    {
        var catalog = InstallMaps.Catalog;
        if (catalog == null)
        {
            output.WriteLine(InstallMaps.NoInstall);
            return;
        }

        var names = catalog.Types.Select(type => type.Key).ToList();

        Assert.True(names.IndexOf("abilcode") < names.IndexOf("ability"));
        Assert.True(names.IndexOf("ability") < names.IndexOf("attacktype"));
        Assert.Equal("integer", catalog.Type("unitcode")!.Base);
    }

    [Fact]
    public void A_category_gives_its_title_and_icon()
    {
        var catalog = InstallMaps.Catalog;
        if (catalog == null)
        {
            output.WriteLine(InstallMaps.NoInstall);
            return;
        }

        var unit = catalog.Categories.Single(category => category.Key == "TC_UNIT");

        Assert.Equal("Unit", unit.Title);
        Assert.EndsWith("Actions-Unit.blp", unit.Icon);
        Assert.NotNull(InstallMaps.ReadGame(unit.Icon));
        Assert.True(unit.Shown);
    }

    [Fact]
    public void A_hint_comes_from_the_trigger_strings()
    {
        var catalog = InstallMaps.Catalog;
        if (catalog == null)
        {
            output.WriteLine(InstallMaps.NoInstall);
            return;
        }

        Assert.StartsWith("The facing angle is expected in degrees", catalog.Action("CreateNUnitsAtLoc")!.Hint);
    }
}
