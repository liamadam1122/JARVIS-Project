using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class JarvisLauncher
{
    [STAThread]
    private static void Main()
    {
        try
        {
            var here = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
            var appDir = Path.Combine(here, "app");
            if (!Directory.Exists(appDir)) appDir = here;

            var nodeExe = Path.Combine(appDir, "runtime", "node.exe");
            var serverJs = Path.Combine(appDir, "server.mjs");
            if (!File.Exists(nodeExe) || !File.Exists(serverJs))
            {
                MessageBox.Show(
                    "JARVIS files are incomplete. Re-download the zip from the latest GitHub release.",
                    "JARVIS",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = "http://127.0.0.1:4173",
                UseShellExecute = true
            });

            var proc = new Process();
            proc.StartInfo.FileName = nodeExe;
            proc.StartInfo.Arguments = "\"" + serverJs + "\"";
            proc.StartInfo.WorkingDirectory = appDir;
            proc.StartInfo.UseShellExecute = false;
            proc.StartInfo.CreateNoWindow = true;
            proc.Start();
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "JARVIS", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
