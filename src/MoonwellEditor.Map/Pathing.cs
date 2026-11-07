using MoonwellEditor.Assets;
using War3Net.Build.Common;
using War3Net.Build.Environment;
using War3Net.Build.Info;

namespace MoonwellEditor.Map;

/// <summary>
/// A pathing picture placed on the map: a doodad's, or a walkable destructable's (a bridge), from its type's
/// <c>dptx</c> or <c>bptx</c>.
/// </summary>
/// <param name="X">Where the thing stands.</param>
/// <param name="Y">Where the thing stands.</param>
/// <param name="Facing">Its facing in radians, as the doodad file holds it.</param>
/// <param name="Picture">The picture: red not walkable, green not flyable, blue not buildable.</param>
/// <param name="Bridge">True for a walkable destructable, whose whole picture is walkable water.</param>
public sealed record PathingStamp(float X, float Y, float Facing, Rgba Picture, bool Bridge);

/// <summary>
/// How World Editor's <c>war3map.wpm</c> follows the map, read from five of Blizzard's maps (2026-11-06; 99.6 to
/// 99.98% of cells on three, 97.7 and 99% on two, <c>.notes/editor-wpm-rules.md</c> in wc3-cs). A cell is 32 by 32,
/// four a tile each way, row 0 at the bottom. The first rule that holds gives its byte: the boundary <c>CE</c>, a
/// bridge's footprint <c>00</c>, a doodad's picture, deep water <c>0A</c>, a cliff <c>CA</c>, else the ground with its
/// tile's buildability and shallow water. Destructables other than bridges and units are not baked in: the game adds
/// them at run time.
/// </summary>
public sealed class Pathing
{
    private const byte NotWalkable = 0x02;
    private const byte NotBuildable = 0x08;
    private const byte Dry = 0x40;
    private const byte Solid = 0x80;
    private const byte Boundary = 0xCE;

    // The bits the rules do not set (blight, and two unused), kept from the cell as it was.
    private const byte Kept = 0x31;

    // Deep enough to swim in, and the depth below which water is still dry, unbuildable ground.
    private const float DeepWater = 40f;
    private const float Shore = 16f;

    private readonly MapEnvironment _terrain;
    private readonly RectangleMargins? _margins;
    private readonly CliffTiles _cliffs;
    private readonly float _waterLevel;
    private readonly IReadOnlyList<bool> _unbuildable;
    private readonly IReadOnlyList<PathingStamp> _stamps;

    /// <param name="terrain">The terrain, as it is when a rebuild runs.</param>
    /// <param name="info">The map's info, for its playable area; null for all of it.</param>
    /// <param name="cliffs">The tiles cliff and ramp models cover.</param>
    /// <param name="waterLevel">The tileset's water level (<c>Water.slk</c> <c>height</c> × 128).</param>
    /// <param name="unbuildable">For each tile in the map's list, whether <c>Terrain.slk</c> says it is unbuildable.</param>
    /// <param name="stamps">The doodads' and bridges' pathing pictures.</param>
    public Pathing(
        MapEnvironment terrain,
        MapInfo? info,
        CliffTiles cliffs,
        float waterLevel,
        IReadOnlyList<bool> unbuildable,
        IReadOnlyList<PathingStamp> stamps)
    {
        _terrain = terrain;
        _margins = info?.CameraBoundsComplements;
        _cliffs = cliffs;
        _waterLevel = waterLevel;
        _unbuildable = unbuildable;
        _stamps = stamps;
    }

    /// <summary>Cells a row: four a tile.</summary>
    public int Width => (int)_terrain.Width * 4;

    /// <summary>Rows of cells.</summary>
    public int Height => (int)_terrain.Height * 4;

    /// <summary>
    /// Works the cells of tiles <paramref name="left"/> to <paramref name="right"/> and <paramref name="bottom"/> to
    /// <paramref name="top"/> (inclusive, clamped to the map) out again, in <paramref name="cells"/>, a byte a cell.
    /// </summary>
    public void Rebuild(byte[] cells, int left, int bottom, int right, int top)
    {
        left = Math.Max(left, 0);
        bottom = Math.Max(bottom, 0);
        right = Math.Min(right, (int)_terrain.Width - 1);
        top = Math.Min(top, (int)_terrain.Height - 1);
        if (left > right || bottom > top)
        {
            return;
        }

        var grid = TerrainGrid.From(_terrain, _waterLevel);
        var (x0, y0, x1, y1) = (left * 4, bottom * 4, (right * 4) + 3, (top * 4) + 3);
        var stamps = Stamps(x0, y0, x1, y1);
        for (var y = y0; y <= y1; y++)
        {
            for (var x = x0; x <= x1; x++)
            {
                var index = (y * Width) + x;
                cells[index] = (byte)(Cell(grid, x, y, stamps.GetValueOrDefault(index)) | (cells[index] & Kept));
            }
        }
    }

    /// <summary>All the cells of the map, worked out from nothing (a test's comparison with World Editor's).</summary>
    public byte[] All()
    {
        var cells = new byte[Width * Height];
        Rebuild(cells, 0, 0, (int)_terrain.Width - 1, (int)_terrain.Height - 1);
        return cells;
    }

    private byte Cell(TerrainGrid grid, int x, int y, int stamp)
    {
        var (column, row) = (x / 4, y / 4);
        var corners = _terrain.TerrainTiles;
        var columns = grid.Columns;
        TerrainTile Corner(int i, int j) => corners[(j * columns) + i];
        if (Outside(column, row) || Corner(column, row).IsBoundary || Corner(column + 1, row).IsBoundary
            || Corner(column, row + 1).IsBoundary || Corner(column + 1, row + 1).IsBoundary)
        {
            return Boundary;
        }

        if ((stamp & BridgeMark) != 0)
        {
            return 0;
        }

        if ((stamp & DoodadMark) != 0)
        {
            var bits = (byte)(stamp & 0x0E);
            return (byte)(Dry | bits | ((bits & NotWalkable) != 0 ? Solid : 0));
        }

        // The nearest corner, and the depth at the cell's middle: water and ground each blended over the tile.
        var near = Corner((x + 2) / 4, (y + 2) / 4);
        var (u, v) = (((x % 4) + 0.5f) / 4f, ((y % 4) + 0.5f) / 4f);
        float Blend(Func<int, int, float> at) =>
            ((1 - v) * (((1 - u) * at(column, row)) + (u * at(column + 1, row))))
            + (v * (((1 - u) * at(column, row + 1)) + (u * at(column + 1, row + 1))));
        var depth = Blend((i, j) => (Corner(i, j).WaterHeight * 128f) + _waterLevel) - Blend(grid.Ground);
        var wet = near.IsWater && depth > 0;
        if (wet && depth > DeepWater)
        {
            return NotWalkable | NotBuildable;
        }

        if (_cliffs.Covered(column, row))
        {
            return Solid | Dry | NotBuildable | NotWalkable;
        }

        var cell = near.Texture < _unbuildable.Count && _unbuildable[near.Texture] ? (byte)(Dry | NotBuildable) : Dry;
        return wet ? (byte)((depth > Shore ? cell & ~Dry : cell) | NotBuildable) : cell;
    }

    private bool Outside(int column, int row) => _margins != null
        && (column < _margins.Left || column >= _terrain.Width - _margins.Right
            || row < _margins.Bottom || row >= _terrain.Height - _margins.Top);

    private const int DoodadMark = 0x100;
    private const int BridgeMark = 0x200;

    // The pictures' bits on the cells x0..x1, y0..y1, by cell index: a doodad's colours with DoodadMark, a bridge's
    // footprint with BridgeMark. A picture's top row is its north edge; it turns counter-clockwise by its facing's
    // quarter turns plus one (World Editor's, from the maps), whole cells, centred on where the thing stands.
    private Dictionary<int, int> Stamps(int x0, int y0, int x1, int y1)
    {
        var marks = new Dictionary<int, int>();
        foreach (var stamp in _stamps)
        {
            var picture = stamp.Picture;
            var turns = ((((int)MathF.Round(stamp.Facing / (MathF.PI / 2)) + 1) % 4) + 4) % 4;
            var (w, h) = (picture.Width, picture.Height);
            var (across, down) = turns % 2 == 0 ? (w, h) : (h, w);
            var left = (int)MathF.Round(((stamp.X - _terrain.Left) / 32f) - (across / 2f));
            var bottom = (int)MathF.Round(((stamp.Y - _terrain.Bottom) / 32f) - (down / 2f));
            if (left > x1 || bottom > y1 || left + across <= x0 || bottom + down <= y0)
            {
                continue;
            }

            for (var py = 0; py < h; py++)
            {
                for (var px = 0; px < w; px++)
                {
                    var at = ((py * w) + px) * 4;
                    var bits = (picture.Pixels[at] > 127 ? 2 : 0) | (picture.Pixels[at + 1] > 127 ? 4 : 0)
                        | (picture.Pixels[at + 2] > 127 ? 8 : 0);
                    if (bits == 0 && !stamp.Bridge)
                    {
                        continue;
                    }

                    var (lx, ly) = (px, h - 1 - py);
                    var (rx, ry) = turns switch
                    {
                        0 => (lx, ly),
                        1 => (h - 1 - ly, lx),
                        2 => (w - 1 - lx, h - 1 - ly),
                        _ => (ly, w - 1 - lx),
                    };
                    var (x, y) = (left + rx, bottom + ry);
                    if (x >= x0 && x <= x1 && y >= y0 && y <= y1)
                    {
                        var index = (y * Width) + x;
                        marks[index] = marks.GetValueOrDefault(index) | bits | (stamp.Bridge ? BridgeMark : DoodadMark);
                    }
                }
            }
        }

        return marks;
    }
}
