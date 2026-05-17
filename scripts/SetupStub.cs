using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

namespace JNRon.SampleManager.Setup
{
    internal static class Program
    {
        private const string ProductNameText = "JNRon Sample Manager Setup";
        private const string AppFolderName = "JNRon Sample Manager";
        private const string AppExeName = "JNRon Sample Manager.exe";

        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            try
            {
                Install();
                MessageBox.Show("Installation completed.", ProductNameText, MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, ProductNameText, MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void Install()
        {
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            string installDir = Path.Combine(localAppData, "Programs", AppFolderName);
            string startMenuDir = Path.Combine(appData, "Microsoft", "Windows", "Start Menu", "Programs", AppFolderName);
            string tempZip = Path.Combine(Path.GetTempPath(), "jnron-sample-manager-app-" + Guid.NewGuid().ToString("N") + ".zip");
            string appExePath = Path.Combine(installDir, AppExeName);
            string uninstallCmdPath = Path.Combine(installDir, "uninstall.cmd");

            StopInstalledProcesses(installDir);
            DeleteDirectoryWithRetries(installDir);

            if (Directory.Exists(startMenuDir))
            {
                Directory.Delete(startMenuDir, true);
            }

            Directory.CreateDirectory(installDir);
            Directory.CreateDirectory(startMenuDir);

            try
            {
                ExtractEmbeddedZip(tempZip);
                ExpandArchive(tempZip, installDir);
            }
            finally
            {
                TryDeleteFile(tempZip);
            }

            File.WriteAllText(uninstallCmdPath, BuildUninstallScript(), System.Text.Encoding.ASCII);

            CreateShortcut(Path.Combine(desktop, AppFolderName + ".lnk"), appExePath, installDir);
            CreateShortcut(Path.Combine(startMenuDir, AppFolderName + ".lnk"), appExePath, installDir);
            CreateShortcut(Path.Combine(startMenuDir, "Uninstall " + AppFolderName + ".lnk"), uninstallCmdPath, installDir);

            Process.Start(new ProcessStartInfo
            {
                FileName = appExePath,
                WorkingDirectory = installDir,
                UseShellExecute = true,
            });
        }

        private static void ExtractEmbeddedZip(string outputPath)
        {
            Assembly assembly = Assembly.GetExecutingAssembly();
            using (Stream input = assembly.GetManifestResourceStream("app.zip"))
            {
                if (input == null)
                {
                    throw new InvalidOperationException("Embedded app package was not found.");
                }

                using (FileStream output = new FileStream(outputPath, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    input.CopyTo(output);
                }
            }
        }

        private static void ExpandArchive(string zipPath, string destinationPath)
        {
            string script =
                "Expand-Archive -LiteralPath '" + EscapePowerShell(zipPath) +
                "' -DestinationPath '" + EscapePowerShell(destinationPath) + "' -Force";

            Process process = Process.Start(new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -ExecutionPolicy Bypass -Command \"" + script + "\"",
                UseShellExecute = false,
                CreateNoWindow = true,
            });

            if (process == null)
            {
                throw new InvalidOperationException("Failed to start PowerShell for archive extraction.");
            }

            process.WaitForExit();
            if (process.ExitCode != 0)
            {
                throw new InvalidOperationException("Archive extraction failed.");
            }
        }

        private static string BuildUninstallScript()
        {
            return string.Join(
                "\r\n",
                "@echo off",
                "setlocal",
                "set \"INSTALL_DIR=%~dp0\"",
                "set \"START_MENU_DIR=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\JNRon Sample Manager\"",
                "set \"DESKTOP_LINK=%USERPROFILE%\\Desktop\\JNRon Sample Manager.lnk\"",
                "taskkill /IM \"JNRon Sample Manager.exe\" /F >nul 2>&1",
                "powershell -NoProfile -ExecutionPolicy Bypass -Command \"Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like ($env:LOCALAPPDATA + '\\Programs\\JNRon Sample Manager\\*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }\" >nul 2>&1",
                "del /F /Q \"%DESKTOP_LINK%\" >nul 2>&1",
                "rmdir /S /Q \"%START_MENU_DIR%\" >nul 2>&1",
                "start \"\" cmd /c \"ping 127.0.0.1 -n 3 >nul && rmdir /S /Q \"\"%INSTALL_DIR%\"\"\"",
                "exit /b 0",
                "");
        }

        private static void CreateShortcut(string shortcutPath, string targetPath, string workingDirectory)
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            object shell = Activator.CreateInstance(shellType);
            object shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
            Type shortcutType = shortcut.GetType();
            shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
            shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workingDirectory });
            shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
        }

        private static void KillProcessByName(string processName)
        {
            foreach (Process process in Process.GetProcessesByName(processName))
            {
                try
                {
                    process.Kill();
                    process.WaitForExit(5000);
                }
                catch
                {
                }
            }
        }

        private static void StopInstalledProcesses(string installDir)
        {
            KillProcessByName(Path.GetFileNameWithoutExtension(AppExeName));
            KillProcessesByInstallDirectory(installDir);
            WaitForInstallDirectoryRelease(installDir);
        }

        private static void KillProcessesByInstallDirectory(string installDir)
        {
            if (string.IsNullOrEmpty(installDir))
            {
                return;
            }

            string normalizedInstallDir = NormalizeDirectoryPath(installDir);
            int currentProcessId = Process.GetCurrentProcess().Id;

            foreach (Process process in Process.GetProcesses())
            {
                try
                {
                    if (process.Id == currentProcessId)
                    {
                        continue;
                    }

                    string processPath = TryGetProcessPath(process);
                    if (string.IsNullOrEmpty(processPath))
                    {
                        continue;
                    }

                    if (processPath.StartsWith(normalizedInstallDir, StringComparison.OrdinalIgnoreCase))
                    {
                        TryKillProcessTree(process.Id);
                        process.WaitForExit(5000);
                    }
                }
                catch
                {
                }
                finally
                {
                    process.Dispose();
                }
            }
        }

        private static string TryGetProcessPath(Process process)
        {
            try
            {
                if (process.MainModule == null)
                {
                    return null;
                }

                return process.MainModule.FileName;
            }
            catch
            {
                return null;
            }
        }

        private static void WaitForInstallDirectoryRelease(string installDir)
        {
            if (!Directory.Exists(installDir))
            {
                return;
            }

            for (int attempt = 0; attempt < 20; attempt++)
            {
                if (!HasLockedFiles(installDir))
                {
                    return;
                }

                Thread.Sleep(300);
            }
        }

        private static bool HasLockedFiles(string directoryPath)
        {
            try
            {
                foreach (string filePath in Directory.GetFiles(directoryPath, "*", SearchOption.AllDirectories))
                {
                    try
                    {
                        using (FileStream stream = new FileStream(filePath, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
                        {
                        }
                    }
                    catch (IOException)
                    {
                        return true;
                    }
                    catch (UnauthorizedAccessException)
                    {
                        return true;
                    }
                }
            }
            catch
            {
                return true;
            }

            return false;
        }

        private static void DeleteDirectoryWithRetries(string directoryPath)
        {
            if (!Directory.Exists(directoryPath))
            {
                return;
            }

            Exception lastError = null;
            for (int attempt = 0; attempt < 20; attempt++)
            {
                try
                {
                    Directory.Delete(directoryPath, true);
                    return;
                }
                catch (IOException ex)
                {
                    lastError = ex;
                }
                catch (UnauthorizedAccessException ex)
                {
                    lastError = ex;
                }

                KillProcessesByInstallDirectory(directoryPath);
                Thread.Sleep(500);
            }

            if (lastError != null)
            {
                throw lastError;
            }
        }

        private static void TryDeleteFile(string filePath)
        {
            try
            {
                if (File.Exists(filePath))
                {
                    File.Delete(filePath);
                }
            }
            catch
            {
            }
        }

        private static void TryKillProcessTree(int processId)
        {
            try
            {
                using (Process taskKillProcess = Process.Start(new ProcessStartInfo
                {
                    FileName = Path.Combine(Environment.SystemDirectory, "taskkill.exe"),
                    Arguments = "/PID " + processId.ToString() + " /T /F",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                }))
                {
                    if (taskKillProcess != null)
                    {
                        taskKillProcess.WaitForExit(5000);
                    }
                }
            }
            catch
            {
            }
        }

        private static string NormalizeDirectoryPath(string directoryPath)
        {
            return Path.GetFullPath(directoryPath).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        }

        private static string EscapePowerShell(string value)
        {
            return value.Replace("'", "''");
        }
    }
}
