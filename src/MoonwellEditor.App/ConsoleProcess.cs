using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace MoonwellEditor.App;

/// <summary>
/// A program running in a Windows pseudo console (ConPTY): to the program it is a real console, and what it prints and
/// reads go through two pipes, as a terminal's text with its colour codes. This is what VS Code's terminal runs on.
/// </summary>
internal sealed class ConsoleProcess : IDisposable
{
    private const uint ExtendedStartupInfoPresent = 0x00080000; // EXTENDED_STARTUPINFO_PRESENT
    private const int UseStdHandles = 0x00000100; // STARTF_USESTDHANDLES
    private const uint Infinite = 0xFFFFFFFF;
    private const uint EndWait = 2000; // milliseconds
    private const uint InsufficientBuffer = 122; // ERROR_INSUFFICIENT_BUFFER
    private static readonly nint PseudoConsoleAttribute = 0x00020016; // PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE

    private readonly SafeWaitHandle _process;
    private nint _console;

    private ConsoleProcess(nint console, SafeWaitHandle process, Stream input, Stream output)
    {
        _console = console;
        _process = process;
        Input = input;
        Output = output;
    }

    /// <summary>What the program reads.</summary>
    public Stream Input { get; }

    /// <summary>What the program prints. It ends once the console is closed.</summary>
    public Stream Output { get; }

    /// <summary>Starts a program in a new pseudo console.</summary>
    /// <param name="commandLine">The program and its arguments.</param>
    /// <param name="folder">The folder it starts in.</param>
    /// <param name="columns">The console's width in characters.</param>
    /// <param name="rows">The console's height in lines.</param>
    /// <returns>The running program.</returns>
    public static ConsoleProcess Start(string commandLine, string folder, int columns, int rows)
    {
        Check(CreatePipe(out var theirInput, out var ourInput, 0, 0));
        Check(CreatePipe(out var ourOutput, out var theirOutput, 0, 0));
        var result = CreatePseudoConsole(new Size(columns, rows), theirInput, theirOutput, 0, out var console);
        if (result != 0)
        {
            throw new Win32Exception(result);
        }

        var list = NewAttributeList(console);
        try
        {
            var startup = new StartupInfoEx { AttributeList = list };
            startup.Startup.Size = Marshal.SizeOf<StartupInfoEx>();

            // With no handles of its own, a child of a process whose output is redirected would take those, not the console.
            startup.Startup.Flags = UseStdHandles;
            var command = new StringBuilder(commandLine);
            Check(CreateProcess(null, command, 0, 0, false, ExtendedStartupInfoPresent, 0, folder, ref startup, out var info));
            CloseHandle(info.Thread);

            // The console keeps its own copies of these two.
            theirInput.Dispose();
            theirOutput.Dispose();
            return new ConsoleProcess(
                console,
                new SafeWaitHandle(info.Process, true),
                new FileStream(ourInput, FileAccess.Write, 1),
                new FileStream(ourOutput, FileAccess.Read, 1));
        }
        catch
        {
            ClosePseudoConsole(console);
            throw;
        }
        finally
        {
            DeleteProcThreadAttributeList(list);
            Marshal.FreeHGlobal(list);
        }
    }

    /// <summary>Tells the console its new size.</summary>
    /// <param name="columns">Its width in characters.</param>
    /// <param name="rows">Its height in lines.</param>
    public void Resize(int columns, int rows)
    {
        if (_console != 0)
        {
            ResizePseudoConsole(_console, new Size(columns, rows));
        }
    }

    /// <summary>Waits for the program to end.</summary>
    /// <returns>Its exit code.</returns>
    public int WaitForExit()
    {
        WaitForSingleObject(_process, Infinite);
        GetExitCodeProcess(_process, out var code);
        return (int)code;
    }

    /// <summary>Closes the console, which ends what still runs in it and ends <see cref="Output"/>.</summary>
    public void CloseConsole()
    {
        var console = Interlocked.Exchange(ref _console, 0);
        if (console != 0)
        {
            ClosePseudoConsole(console);
        }
    }

    /// <summary>
    /// Ends the program. Closing the console ends what is attached to it, but a program that has only just started has
    /// not attached yet, never hears of it and would run on with no console, so it is ended by force after a moment.
    /// </summary>
    public void End()
    {
        CloseConsole();
        try
        {
            if (WaitForSingleObject(_process, EndWait) != 0)
            {
                TerminateProcess(_process, 1);
            }
        }
        catch (ObjectDisposedException)
        {
            // It ended, and it has been cleared up.
        }
    }

    /// <inheritdoc />
    public void Dispose()
    {
        CloseConsole();
        Input.Dispose();
        Output.Dispose();
        _process.Dispose();
    }

    private static nint NewAttributeList(nint console)
    {
        nint size = 0;
        InitializeProcThreadAttributeList(0, 1, 0, ref size);
        if (Marshal.GetLastWin32Error() != InsufficientBuffer)
        {
            throw new Win32Exception();
        }

        var list = Marshal.AllocHGlobal(size);
        Check(InitializeProcThreadAttributeList(list, 1, 0, ref size));
        Check(UpdateProcThreadAttribute(list, 0, PseudoConsoleAttribute, console, nint.Size, 0, 0));
        return list;
    }

    private static void Check(bool succeeded)
    {
        if (!succeeded)
        {
            throw new Win32Exception();
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private readonly struct Size(int columns, int rows)
    {
        private readonly short _columns = (short)columns;
        private readonly short _rows = (short)rows;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo
    {
        public int Size;
        public string? Reserved;
        public string? Desktop;
        public string? Title;
        public int X;
        public int Y;
        public int Width;
        public int Height;
        public int CountX;
        public int CountY;
        public int FillAttribute;
        public int Flags;
        public short ShowWindow;
        public short Reserved2;
        public nint Reserved3;
        public nint StandardInput;
        public nint StandardOutput;
        public nint StandardError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct StartupInfoEx
    {
        public StartupInfo Startup;
        public nint AttributeList;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInformation
    {
        public nint Process;
        public nint Thread;
        public int ProcessId;
        public int ThreadId;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CreatePipe(out SafeFileHandle read, out SafeFileHandle write, nint attributes, int size);

    [DllImport("kernel32.dll")]
    private static extern int CreatePseudoConsole(Size size, SafeFileHandle input, SafeFileHandle output, uint flags, out nint console);

    [DllImport("kernel32.dll")]
    private static extern int ResizePseudoConsole(nint console, Size size);

    [DllImport("kernel32.dll")]
    private static extern void ClosePseudoConsole(nint console);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool InitializeProcThreadAttributeList(nint list, int count, int flags, ref nint size);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool UpdateProcThreadAttribute(nint list, uint flags, nint attribute, nint value, nint size, nint previous, nint returned);

    [DllImport("kernel32.dll")]
    private static extern void DeleteProcThreadAttributeList(nint list);

    [DllImport("kernel32.dll", EntryPoint = "CreateProcessW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CreateProcess(
        string? application,
        StringBuilder commandLine,
        nint processAttributes,
        nint threadAttributes,
        bool inheritHandles,
        uint flags,
        nint environment,
        string folder,
        ref StartupInfoEx startup,
        out ProcessInformation information);

    [DllImport("kernel32.dll")]
    private static extern uint WaitForSingleObject(SafeWaitHandle handle, uint milliseconds);

    [DllImport("kernel32.dll")]
    private static extern bool GetExitCodeProcess(SafeWaitHandle process, out uint code);

    [DllImport("kernel32.dll")]
    private static extern bool TerminateProcess(SafeWaitHandle process, uint code);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(nint handle);
}
