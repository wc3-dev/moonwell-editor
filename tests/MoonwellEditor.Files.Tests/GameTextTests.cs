using System.Text;

namespace MoonwellEditor.Files.Tests;

/// <summary>The game's INI-like text files: World Editor's data and its strings.</summary>
public sealed class GameTextTests
{
    private const string WorldEditData = """
        [Other]
        L=other
        [TileSets]
        // L=put out
          L = Lordaeron Summer,TerrainArt\Blight\Lords_Blight
        LL=longer key
        L=second
        """;

    [Fact]
    public void An_entry_is_the_first_value_of_its_key_in_its_section()
    {
        Assert.Equal(@"Lordaeron Summer,TerrainArt\Blight\Lords_Blight", GameText.Entry(WorldEditData, "TileSets", "L"));
        Assert.Equal("longer key", GameText.Entry(WorldEditData, "TileSets", "LL"));
        Assert.Equal("other", GameText.Entry(WorldEditData, "Other", "L"));
    }

    [Fact]
    public void A_file_that_starts_with_a_byte_order_mark_reads_its_first_line()
    {
        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes("[TileSets]\r\nL=Lordaeron\r\n")).ToArray();

        Assert.Equal("Lordaeron", GameText.Entry(Encoding.UTF8.GetString(bytes), "TileSets", "L"));
        Assert.Equal("Lordaeron", GameText.Strings(bytes)["L"]);
    }

    [Fact]
    public void An_entry_not_in_its_section_is_null()
    {
        Assert.Null(GameText.Entry(WorldEditData, "TileSets", "X"));
        Assert.Null(GameText.Entry(WorldEditData, "Missing", "L"));
    }

    [Fact]
    public void Strings_are_read_as_keys_and_texts_without_quotes()
    {
        var strings = GameText.Strings(Encoding.UTF8.GetBytes(
            "[WorldEditStrings]\r\nWESTRING_UBERSPLAT_HTOW=Town Hall\r\n// a note\r\nWESTRING_QUOTED=\"Quoted\"\r\n"
            + "[Other]\r\nWESTRING_UBERSPLAT_HTOW=Second\r\n"));

        Assert.Equal("Town Hall", strings["WESTRING_UBERSPLAT_HTOW"]);
        Assert.Equal("Quoted", strings["westring_quoted"]);
        Assert.Equal(2, strings.Count);
    }

    [Fact]
    public void A_closing_quote_the_file_left_out_is_not_needed()
    {
        var strings = GameText.Strings(Encoding.UTF8.GetBytes("OPEN=\"Text\nINNER=\"a \"b\" c\"\n"));

        Assert.Equal("Text", strings["OPEN"]);
        Assert.Equal("a \"b\" c", strings["INNER"]);
    }

    [Fact]
    public void No_file_has_no_strings()
    {
        Assert.Empty(GameText.Strings(null));
    }
}
