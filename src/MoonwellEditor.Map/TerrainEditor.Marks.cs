using System.Globalization;
using System.Numerics;
using MoonwellEditor.Files;
using War3Net.Build.Common;
using War3Net.Build.Environment;
using Color = System.Drawing.Color;

namespace MoonwellEditor.Map;

/// <summary>The map's regions and cameras, as the view draws them.</summary>
/// <param name="Regions">The regions, numbered from 1 in the file's order.</param>
/// <param name="Cameras">The cameras, numbered from 1 in the file's order.</param>
public sealed record MapMarks(IReadOnlyList<RegionMark> Regions, IReadOnlyList<CameraMark> Cameras);

/// <summary>
/// The map's regions (<c>war3map.w3r</c>) and cameras (<c>war3map.w3c</c>): drawn, moved, resized, renamed, aimed and
/// removed, each change one undo step. A region's edges keep to the 32 grid; a new region or camera takes World Editor's
/// values (read from Blizzard's maps): <c>Region 000</c> and <c>Camera 001</c> on, the next creation number, a field of
/// view of 70 and a far clipping plane of 5000. Renaming one does not rename it in the triggers or the map's code.
/// </summary>
public sealed partial class TerrainEditor
{
    private const string RegionsFile = "war3map.w3r";
    private const string CamerasFile = "war3map.w3c";
    private const float Grid = 32f;

    // A new region's colour: one of a few, in turn, as World Editor gives each its own.
    private static readonly Color[] RegionColors =
    [
        Color.FromArgb(255, 255, 128, 128), Color.FromArgb(255, 128, 255, 128), Color.FromArgb(255, 128, 128, 255),
        Color.FromArgb(255, 255, 255, 128), Color.FromArgb(255, 255, 128, 255), Color.FromArgb(255, 128, 255, 255),
    ];

    /// <summary>The regions as edited; null when the map has no regions file.</summary>
    public MapRegions? Regions => _regions;

    /// <summary>The cameras as edited; null when the map has no cameras file.</summary>
    public MapCameras? Cameras => _cameras;

    /// <summary>The regions and cameras as the view draws them.</summary>
    public MapMarks Marks() => new(Placed.Regions(_regions), Placed.Cameras(_cameras));

    /// <summary>
    /// Makes region <paramref name="number"/>, or a new one when it is 0, span <paramref name="left"/> to
    /// <paramref name="right"/> and <paramref name="bottom"/> to <paramref name="top"/> (to the 32 grid), named
    /// <paramref name="name"/> (a new one's own when null). Gives its number.
    /// </summary>
    /// <exception cref="ArgumentException">There is no such region or regions file, it is too small, or the name is taken.</exception>
    public int SetRegion(int number, float left, float bottom, float right, float top, string? name)
    {
        EndStroke();
        var regions = (_regions ?? throw new ArgumentException(Texts.Get("app.terrain.noFile", ("name", RegionsFile)))).Regions;
        var (l, r) = (Snap(Math.Min(left, right)), Snap(Math.Max(left, right)));
        var (b, t) = (Snap(Math.Min(bottom, top)), Snap(Math.Max(bottom, top)));
        if (r - l < Grid || t - b < Grid)
        {
            throw new ArgumentException(Texts.Get("app.terrain.regionTooSmall"));
        }

        if (number == 0)
        {
            var region = new Region
            {
                Name = name ?? FreeName(regions.Select(each => each.Name), "Region {0:000}", 0),
                Left = l,
                Bottom = b,
                Right = r,
                Top = t,
                CreationNumber = regions.Count == 0 ? 0 : regions.Max(each => each.CreationNumber) + 1,
                WeatherType = WeatherType.None,
                AmbientSound = string.Empty,
                Color = RegionColors[regions.Count % RegionColors.Length],
                AlphaTileMinimapColor = Color.FromArgb(0, 0, 0, 0),
            };
            Taken(regions.Select(each => each.Name), region.Name, null);
            var at = regions.Count;
            Mark(() => regions.Insert(at, region), () => regions.RemoveAt(at));
            return at + 1;
        }

        var found = Pick(regions, number);
        Taken(regions.Select(each => each.Name), name ?? found.Name, found.Name);
        var before = (found.Left, found.Bottom, found.Right, found.Top, found.Name);
        var after = (l, b, r, t, name ?? found.Name);
        Mark(() => Put(found, after), () => Put(found, before));
        return number;

        static void Put(Region region, (float L, float B, float R, float T, string Name) to) =>
            (region.Left, region.Bottom, region.Right, region.Top, region.Name) = to;
    }

    /// <summary>Removes region <paramref name="number"/>.</summary>
    /// <exception cref="ArgumentException">There is no such region.</exception>
    public void RemoveRegion(int number)
    {
        EndStroke();
        var regions = _regions?.Regions ?? [];
        var region = Pick(regions, number);
        Mark(() => regions.RemoveAt(number - 1), () => regions.Insert(number - 1, region));
    }

    /// <summary>
    /// Makes camera <paramref name="number"/>, or a new one when it is 0, look at <paramref name="x"/>,
    /// <paramref name="y"/> from <paramref name="distance"/>, turned to <paramref name="rotation"/> and tilted to
    /// <paramref name="angleOfAttack"/> (the game's degrees), named <paramref name="name"/> (a new one's own when null).
    /// Gives its number.
    /// </summary>
    /// <exception cref="ArgumentException">There is no such camera or cameras file, or the name is taken.</exception>
    public int SetCamera(int number, float x, float y, float rotation, float angleOfAttack, float distance, string? name)
    {
        EndStroke();
        var cameras = (_cameras ?? throw new ArgumentException(Texts.Get("app.terrain.noFile", ("name", CamerasFile)))).Cameras;
        var aim = (new Vector2(x, y), Degrees(rotation), Degrees(angleOfAttack), Math.Max(distance, 100f));
        if (number == 0)
        {
            var camera = new Camera
            {
                Name = name ?? FreeName(cameras.Select(each => each.Name), "Camera {0:000}", 1),
                FieldOfView = 70,
                FarClippingPlane = 5000,
                NearClippingPlane = 16,
                DofScale = 0.01f,
            };
            Taken(cameras.Select(each => each.Name), camera.Name, null);
            (camera.TargetPosition, camera.Rotation, camera.AngleOfAttack, camera.TargetDistance) = aim;
            var at = cameras.Count;
            Mark(() => cameras.Insert(at, camera), () => cameras.RemoveAt(at));
            return at + 1;
        }

        var found = Pick(cameras, number);
        Taken(cameras.Select(each => each.Name), name ?? found.Name, found.Name);
        var before = (found.TargetPosition, found.Rotation, found.AngleOfAttack, found.TargetDistance, found.Name);
        var after = (aim.Item1, aim.Item2, aim.Item3, aim.Item4, name ?? found.Name);
        Mark(() => Put(found, after), () => Put(found, before));
        return number;

        static void Put(Camera camera, (Vector2 Target, float Rotation, float Attack, float Distance, string Name) to) =>
            (camera.TargetPosition, camera.Rotation, camera.AngleOfAttack, camera.TargetDistance, camera.Name) = to;
    }

    /// <summary>Removes camera <paramref name="number"/>.</summary>
    /// <exception cref="ArgumentException">There is no such camera.</exception>
    public void RemoveCamera(int number)
    {
        EndStroke();
        var cameras = _cameras?.Cameras ?? [];
        var camera = Pick(cameras, number);
        Mark(() => cameras.RemoveAt(number - 1), () => cameras.Insert(number - 1, camera));
    }

    // A change to the regions or cameras as one undo step: neither touches the pathing.
    private void Mark(Action apply, Action revert)
    {
        apply();
        Version++;
        _session.Record(
            () =>
            {
                revert();
                Version++;
            },
            () =>
            {
                apply();
                Version++;
            });
    }

    private static T Pick<T>(List<T> list, int number) => number >= 1 && number <= list.Count
        ? list[number - 1]
        : throw new ArgumentException(Texts.Get("app.terrain.noMark", ("number", number.ToString(CultureInfo.InvariantCulture))));

    // Refuses an empty name, or one another region or camera has (their trigger names would clash).
    private static void Taken(IEnumerable<string> names, string name, string? own)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException(Texts.Get("app.terrain.noName"));
        }

        var trigger = TriggerNames.Region(name);
        if (name != own && names.Any(each => each != own && TriggerNames.Region(each) == trigger))
        {
            throw new ArgumentException(Texts.Get("app.terrain.nameTaken", ("name", name)));
        }
    }

    // The first of `format` with a number from `first` that none of `names` has.
    private static string FreeName(IEnumerable<string> names, string format, int first)
    {
        var taken = names.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var number = first;
        while (taken.Contains(string.Format(CultureInfo.InvariantCulture, format, number)))
        {
            number++;
        }

        return string.Format(CultureInfo.InvariantCulture, format, number);
    }

    private static float Snap(float value) => MathF.Round(value / Grid) * Grid;

    private static float Degrees(float value) => ((value % 360f) + 360f) % 360f;
}
