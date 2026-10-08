using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;

namespace IJanek.Update {
    // Loaded by the protected SYSTEM agent, never from a user-provided path.
    // The interactive token and environment are acquired before the app exits.
    public sealed class UserSessionRestart : IDisposable {
        private IntPtr token;
        private IntPtr environment;
        private readonly string executable;
        private readonly string userSid;
        public int SessionId { get; private set; }
        public int OriginalProcessId { get; private set; }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct StartupInfo {
            public int cb;
            public string reserved, desktop, title;
            public int x, y, xSize, ySize, xCountChars, yCountChars, fillAttribute, flags;
            public short showWindow, reserved2Size;
            public IntPtr reserved2, stdin, stdout, stderr;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct ProcessInfo { public IntPtr process, thread; public int processId, threadId; }

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr OpenProcess(uint access, bool inherit, int processId);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder name, ref int size);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr handle);
        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr result);
        [DllImport("wtsapi32.dll", SetLastError = true)]
        private static extern bool WTSQueryUserToken(uint sessionId, out IntPtr result);
        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool DuplicateTokenEx(IntPtr source, uint access, IntPtr attributes, int impersonationLevel, int type, out IntPtr result);
        [DllImport("userenv.dll", SetLastError = true)]
        private static extern bool CreateEnvironmentBlock(out IntPtr result, IntPtr token, bool inherit);
        [DllImport("userenv.dll", SetLastError = true)]
        private static extern bool DestroyEnvironmentBlock(IntPtr environment);
        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool CreateProcessAsUser(IntPtr token, string application, StringBuilder commandLine,
            IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint flags,
            IntPtr environment, string directory, ref StartupInfo startup, out ProcessInfo process);

        private static void Check(bool success, string operation) {
            if (!success) throw new Win32Exception(Marshal.GetLastWin32Error(), operation);
        }
        private static string Sid(IntPtr value) {
            using (var identity = new WindowsIdentity(value)) { return identity.User.Value; }
        }

        public UserSessionRestart(int processId, string expectedExecutable) {
            IntPtr source = IntPtr.Zero, sourceToken = IntPtr.Zero, sessionToken = IntPtr.Zero;
            executable = Path.GetFullPath(expectedExecutable);
            try {
                source = OpenProcess(0x1000, false, processId); // QUERY_LIMITED_INFORMATION
                Check(source != IntPtr.Zero, "OpenProcess");
                var image = new StringBuilder(32768);
                int size = image.Capacity;
                Check(QueryFullProcessImageName(source, 0, image, ref size), "QueryFullProcessImageName");
                if (!String.Equals(Path.GetFullPath(image.ToString()), executable, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("The update requester is not the installed application.");
                using (var process = Process.GetProcessById(processId)) { SessionId = process.SessionId; }
                if (SessionId <= 0) throw new InvalidOperationException("The application has no interactive user session.");
                Check(OpenProcessToken(source, 0x0008, out sourceToken), "OpenProcessToken");
                Check(WTSQueryUserToken((uint)SessionId, out sessionToken), "WTSQueryUserToken");
                userSid = Sid(sessionToken);
                if (Sid(sourceToken) != userSid) throw new InvalidOperationException("The requester does not belong to the session user.");
                // A normal interactive token avoids relaunching the app as SYSTEM
                // or with the elevated token of an administrator-run application.
                Check(DuplicateTokenEx(sessionToken, 0x02000000, IntPtr.Zero, 2, 1, out token), "DuplicateTokenEx");
                Check(CreateEnvironmentBlock(out environment, token, false), "CreateEnvironmentBlock");
                OriginalProcessId = processId;
            } catch { Dispose(); throw; }
            finally {
                if (sourceToken != IntPtr.Zero) CloseHandle(sourceToken);
                if (sessionToken != IntPtr.Zero) CloseHandle(sessionToken);
                if (source != IntPtr.Zero) CloseHandle(source);
            }
        }

        public int Launch(bool startHidden, string requestId) {
            if (token == IntPtr.Zero) throw new ObjectDisposedException("UserSessionRestart");
            if (!System.Text.RegularExpressions.Regex.IsMatch(requestId, @"^\d+-\d+$"))
                throw new ArgumentException("Invalid update request ID.");
            IntPtr current = IntPtr.Zero;
            try {
                Check(WTSQueryUserToken((uint)SessionId, out current), "WTSQueryUserToken before launch");
                if (Sid(current) != userSid) throw new InvalidOperationException("The original user has logged out.");
            } finally { if (current != IntPtr.Zero) CloseHandle(current); }
            var startup = new StartupInfo();
            startup.cb = Marshal.SizeOf(typeof(StartupInfo));
            startup.desktop = @"winsta0\default";
            startup.flags = 1; // STARTF_USESHOWWINDOW
            startup.showWindow = (short)(startHidden ? 0 : 10);
            var command = new StringBuilder("\"" + executable + "\" --updated --update-request=" + requestId + (startHidden ? " --tray" : ""));
            ProcessInfo created;
            Check(CreateProcessAsUser(token, executable, command, IntPtr.Zero, IntPtr.Zero, false,
                0x00000400, environment, Path.GetDirectoryName(executable), ref startup, out created), "CreateProcessAsUser");
            try { return created.processId; }
            finally { CloseHandle(created.thread); CloseHandle(created.process); }
        }

        public void Dispose() {
            if (environment != IntPtr.Zero) { DestroyEnvironmentBlock(environment); environment = IntPtr.Zero; }
            if (token != IntPtr.Zero) { CloseHandle(token); token = IntPtr.Zero; }
        }
    }
}
