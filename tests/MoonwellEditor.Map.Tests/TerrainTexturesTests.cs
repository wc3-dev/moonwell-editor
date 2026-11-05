using System.Text;
using MoonwellEditor.Map;

namespace MoonwellEditor.Map.Tests;

public sealed class TerrainTexturesTests
{
    [Theory]
    [InlineData("BLP1", 512, 256, true)]
    [InlineData("BLP1", 256, 256, false)]
    [InlineData("BLP2", 512, 256, true)]
    [InlineData("BLP2", 256, 256, false)]
    public void A_blp_twice_as_wide_as_high_is_extended(string magic, int width, int height, bool extended)
    {
        // BLP1: content and alpha bits, then the size. BLP2: its type, four bytes of encoding and flags, then the size.
        var header = new byte[148];
        Encoding.ASCII.GetBytes(magic).CopyTo(header, 0);
        header[4] = 1;
        if (magic == "BLP2")
        {
            header[8] = 2;
            header[9] = 8;
            header[10] = 8;
            header[11] = 1;
        }

        BitConverter.GetBytes(width).CopyTo(header, 12);
        BitConverter.GetBytes(height).CopyTo(header, 16);

        Assert.Equal(extended, TerrainTextures.IsExtended(header));
    }
}
