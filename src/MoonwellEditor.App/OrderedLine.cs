using System.Threading.Channels;

namespace MoonwellEditor.App;

/// <summary>
/// Runs what it is given one at a time, strictly in the order it came. What is typed in a terminal has to stay in order
/// however fast it comes, and a <see cref="SemaphoreSlim"/> lets a newcomer in ahead of those waiting.
/// </summary>
public sealed class OrderedLine
{
    private readonly Channel<string> _waiting = Channel.CreateUnbounded<string>(new UnboundedChannelOptions { SingleReader = true });

    /// <summary>Makes a line that runs everything through <paramref name="run"/>.</summary>
    /// <param name="run">Runs one item; it should not throw.</param>
    public OrderedLine(Func<string, Task> run)
    {
        _ = Task.Run(async () =>
        {
            await foreach (var each in _waiting.Reader.ReadAllAsync())
            {
                await run(each);
            }
        });
    }

    /// <summary>Puts an item at the end of the line.</summary>
    /// <param name="item">The item.</param>
    public void Add(string item) => _waiting.Writer.TryWrite(item);
}
