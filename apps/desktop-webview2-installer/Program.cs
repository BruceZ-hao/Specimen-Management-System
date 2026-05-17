using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

namespace JNRon.SampleManager.Installer
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            try
            {
                Install();
                MessageBox.Show(
                    "JNRon Sample Manager 安装完成。",
                    "JNRon Sample Manager Setup",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "安装失败。\r\n\r\n" + ex.Message,
                    "JNRon Sample Manager Setup",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }

        private static void Install()
        {
            string installDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs",
                "JNRon Sample Manager");
            string startMenuDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Microsoft",
                "Windows",
                "Start Menu",
                "Programs",
                "JNRon Sample Manager");
            string tempZipPath = Path.Combine(Path.GetTempPath(), "jnron-sample-manager-app.zip");
            string exePath = Path.Combine(installDir, "JNRon Sample Manager.exe");

            if (Directory.Exists(installDir))
            {
                TryDeleteDirectory(installDir);
            }

            Directory.CreateDirectory(installDir);

            using (Stream payloadStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
            {
                if (payloadStream == null)
                {
                    throw new InvalidOperationException("Installer payload not found.");
                }

                using (FileStream output = File.Create(tempZipPath))
                {
                    payloadStream.CopyTo(output);
                }
            }

            ZipFile.ExtractToDirectory(tempZipPath, installDir);
            File.Delete(tempZipPath);

            Directory.CreateDirectory(startMenuDir);
            CreateShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "JNRon Sample Manager.lnk"), exePath);
            CreateShortcut(Path.Combine(startMenuDir, "JNRon Sample Manager.lnk"), exePath);

            Process.Start(exePath);
        }

        private static void TryDeleteDirectory(string path)
        {
            foreach (string file in Directory.GetFiles(path, "*", SearchOption.AllDirectories))
            {
                File.SetAttributes(file, FileAttributes.Normal);
            }

            Directory.Delete(path, true);
        }

        private static void CreateShortcut(string shortcutPath, string targetPath)
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            object shell = Activator.CreateInstance(shellType);
            object shortcut = shellType.InvokeMember(
                "CreateShortcut",
                BindingFlags.InvokeMethod,
                null,
                shell,
                new object[] { shortcutPath });

            Type shortcutType = shortcut.GetType();
            shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
            shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { Path.GetDirectoryName(targetPath) });
            shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
        }
    }
}
