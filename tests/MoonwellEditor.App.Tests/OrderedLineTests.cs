using MoonwellEditor.App;

namespace MoonwellEditor.App.Tests;

public sealed class OrderedLineTests
{
    [Fact]
    public async Task What_is_added_runs_in_the_order_it_came()
    {
        var ran = new List<int>();
        var done = new TaskCompletionSource();
        var line = new OrderedLine(async text =>
        {
            // Each one gives way, as a request does while the app answers it.
            await Task.Yield();
            ran.Add(int.Parse(text));
            if (ran.Count == 2000)
            {
                done.SetResult();
            }
        });

        var adding = Enumerable.Range(0, 2000).Select(each => each.ToString());
        foreach (var each in adding)
        {
            line.Add(each);
        }

        await done.Task.WaitAsync(TimeSpan.FromSeconds(20));
        Assert.Equal(Enumerable.Range(0, 2000), ran);
    }

    [Fact]
    public async Task One_runs_at_a_time()
    {
        var running = 0;
        var most = 0;
        var count = 0;
        var done = new TaskCompletionSource();
        var line = new OrderedLine(async _ =>
        {
            most = Math.Max(most, Interlocked.Increment(ref running));
            await Task.Delay(1);
            Interlocked.Decrement(ref running);
            if (Interlocked.Increment(ref count) == 20)
            {
                done.SetResult();
            }
        });

        for (var each = 0; each < 20; each++)
        {
            line.Add("x");
        }

        await done.Task.WaitAsync(TimeSpan.FromSeconds(20));
        Assert.Equal(1, most);
    }
}
