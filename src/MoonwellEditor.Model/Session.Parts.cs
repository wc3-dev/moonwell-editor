namespace MoonwellEditor.Model;

/// <summary>
/// A part of the map that a library outside the model edits, such as the terrain. The session keeps the part's edits
/// in its undo history with the object editor's, counts them in <see cref="Session.Dirty"/>, and saves the part's files
/// with the object files.
/// </summary>
public interface IMapPart
{
    /// <summary>The map's files the part writes, each with its bytes as they are now.</summary>
    IEnumerable<(string Name, byte[] Bytes)> Files();
}

public sealed partial class Session
{
    // The parts edited in this session; dropped by a reload, whose undo history goes with them.
    private readonly List<IMapPart> _parts = [];

    /// <summary>
    /// A map file's bytes as they are on disk now, kept as what a save compares the file with; null when the map has
    /// none. A part reads its files with this before it is attached.
    /// </summary>
    public byte[]? Track(string name)
    {
        var bytes = _store.Read(name);
        _baseline[name] = bytes;
        return bytes;
    }

    /// <summary>Keeps <paramref name="part"/>, whose files were read with <see cref="Track"/>, until the next reload.</summary>
    public void Attach(IMapPart part) => _parts.Add(part);

    /// <summary>Whether <paramref name="part"/> is still attached: false after a reload, or when it never was.</summary>
    public bool Holds(IMapPart part) => _parts.Contains(part);

    /// <summary>
    /// Keeps a change a part has just made as one undo step: <paramref name="undo"/> takes it back and
    /// <paramref name="redo"/> makes it again.
    /// </summary>
    public void Record(Action undo, Action redo)
    {
        var edit = new Edit();
        edit.Done(new Step(redo, undo));
        Commit(edit);
    }

    /// <summary>Whether <paramref name="part"/>'s files differ from the map's as opened or last saved.</summary>
    public bool Changed(IMapPart part) =>
        part.Files().Any(file => !SameBytes(file.Bytes, _baseline.GetValueOrDefault(file.Name)));

    private bool PartsChanged() => _parts.Any(Changed);

    private void AddPartChanges(List<(string Name, byte[] Bytes)> changes)
    {
        foreach (var part in _parts)
        {
            foreach (var (name, bytes) in part.Files())
            {
                AddChange(changes, name, bytes);
            }
        }
    }
}
