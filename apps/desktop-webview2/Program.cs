using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net.Sockets;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace JNRon.SampleManager.Desktop
{
    internal static class Program
    {
        private static Mutex singleInstanceMutex;

        [STAThread]
        private static void Main()
        {
            bool createdNew;
            singleInstanceMutex = new Mutex(true, "JNRon.SampleManager.Desktop.SingleInstance", out createdNew);
            if (!createdNew)
            {
                MessageBox.Show(
                    "JNRon Sample Manager is already running.",
                    "JNRon Sample Manager",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            try
            {
                Application.Run(new MainForm());
            }
            finally
            {
                if (singleInstanceMutex != null)
                {
                    singleInstanceMutex.ReleaseMutex();
                    singleInstanceMutex.Dispose();
                    singleInstanceMutex = null;
                }
            }
        }
    }

    internal sealed class MainForm : Form
    {
        private const string ProductNameText = "JNRon Sample Manager";
        private const string ServerHost = "127.0.0.1";
        private const int ServerPort = 3000;
        private const string UpdateManifestFileName = "update-manifest.json";
        private static readonly TimeSpan ServerStartupTimeout = TimeSpan.FromSeconds(30);
        private static readonly TimeSpan ServerPollInterval = TimeSpan.FromMilliseconds(500);

        private readonly Label statusLabel;
        private readonly WebView2 webView;
        private Process serverProcess;
        private bool ownsServerProcess;
        private bool updateInProgress;
        private string serverOutput = string.Empty;
        private string logPath;

        public MainForm()
        {
            Text = ProductNameText;
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(1100, 720);
            Size = new Size(1440, 920);

            statusLabel = new Label
            {
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleCenter,
                Font = new Font("Microsoft YaHei UI", 14f, FontStyle.Regular),
                Text = "Starting JNRon..."
            };

            webView = new WebView2
            {
                Dock = DockStyle.Fill,
                Visible = false
            };

            Controls.Add(webView);
            Controls.Add(statusLabel);

            string runtimeRoot = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "runtime");
            Directory.CreateDirectory(runtimeRoot);
            logPath = Path.Combine(runtimeRoot, "desktop.log");
            Log("form initialized");
        }

        protected override async void OnShown(EventArgs e)
        {
            base.OnShown(e);

            try
            {
                await StartDesktopAsync();
            }
            catch (Exception ex)
            {
                ShowStartupError(ex);
                Close();
            }
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            StopServer();
            base.OnFormClosed(e);
        }

        private async Task StartDesktopAsync()
        {
            string packageRoot = AppDomain.CurrentDomain.BaseDirectory;
            Log("start desktop packageRoot=" + packageRoot);
            RuntimeState runtimeState = EnsureRuntimeData(packageRoot);
            Log("runtime ready");

            if (await IsServerReachableAsync())
            {
                Log("existing local service detected, reusing port " + ServerPort);
            }
            else
            {
                StartServer(runtimeState);
                Log("server process started");
            }

            await WaitForServerAsync();
            Log("server port ready");
            await InitializeWebViewAsync(runtimeState.UserDataRoot);
            Log("webview initialized");

            statusLabel.Visible = false;
            webView.Visible = true;
            webView.Source = new Uri(string.Format("http://{0}:{1}", ServerHost, ServerPort));
        }

        private RuntimeState EnsureRuntimeData(string packageRoot)
        {
            string runtimeRoot = Path.Combine(packageRoot, "runtime");
            string userDataRoot = Path.Combine(runtimeRoot, "webview2");
            string uploadsRoot = Path.Combine(runtimeRoot, "uploads");
            string databasePath = Path.Combine(runtimeRoot, "dev.db");
            string seedDatabasePath = Path.Combine(packageRoot, "apps", "server", "prisma", "dev.db");
            string adminDistPath = Path.Combine(packageRoot, "apps", "admin", "dist");
            string serverEntryPath = Path.Combine(packageRoot, "apps", "server", "dist", "apps", "server", "src", "main.js");
            string nodeExePath = Path.Combine(packageRoot, "node.exe");

            Directory.CreateDirectory(runtimeRoot);
            Directory.CreateDirectory(userDataRoot);
            Directory.CreateDirectory(uploadsRoot);
            Log("ensure runtime data");

            if (!File.Exists(nodeExePath))
            {
                throw new FileNotFoundException("Bundled node.exe not found.", nodeExePath);
            }

            if (!File.Exists(serverEntryPath))
            {
                throw new FileNotFoundException("Bundled server entry not found.", serverEntryPath);
            }

            if (!File.Exists(databasePath) && File.Exists(seedDatabasePath))
            {
                File.Copy(seedDatabasePath, databasePath, true);
            }

            return new RuntimeState(
                packageRoot,
                userDataRoot,
                uploadsRoot,
                databasePath,
                adminDistPath,
                serverEntryPath,
                nodeExePath);
        }

        private void StartServer(RuntimeState runtimeState)
        {
            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = runtimeState.NodeExePath;
            startInfo.Arguments = QuoteArgument(runtimeState.ServerEntryPath);
            startInfo.WorkingDirectory = runtimeState.PackageRoot;
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            startInfo.RedirectStandardOutput = true;
            startInfo.RedirectStandardError = true;
            startInfo.EnvironmentVariables["PORT"] = ServerPort.ToString();
            startInfo.EnvironmentVariables["HOST"] = ServerHost;
            startInfo.EnvironmentVariables["JWT_SECRET"] = "desktop-sample-management";
            startInfo.EnvironmentVariables["DATABASE_URL"] = "file:" + runtimeState.DatabasePath.Replace("\\", "/");
            startInfo.EnvironmentVariables["UPLOAD_DIR"] = runtimeState.UploadsRoot;
            startInfo.EnvironmentVariables["ADMIN_DIST_DIR"] = runtimeState.AdminDistPath;
            startInfo.EnvironmentVariables["NODE_PATH"] = Path.Combine(runtimeState.PackageRoot, "desktop-runtime", "node_modules");

            Process process = new Process();
            ownsServerProcess = true;
            process.StartInfo = startInfo;
            process.EnableRaisingEvents = true;
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args)
            {
                if (!string.IsNullOrWhiteSpace(args.Data))
                {
                    AppendServerOutput(args.Data);
                }
            };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs args)
            {
                if (!string.IsNullOrWhiteSpace(args.Data))
                {
                    AppendServerOutput(args.Data);
                }
            };
            process.Exited += delegate
            {
                Log("server process exited code=" + GetProcessExitCode(process));
                if (webView.Visible && ownsServerProcess && object.ReferenceEquals(serverProcess, process) && !updateInProgress)
                {
                    BeginInvoke(new Action(delegate
                    {
                        statusLabel.Text = "Local service has stopped.";
                        statusLabel.Visible = true;
                        webView.Visible = false;
                    }));
                }
            };

            if (!process.Start())
            {
                throw new InvalidOperationException("Failed to start the local server process.");
            }

            serverProcess = process;
            Log("server pid=" + process.Id);
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
        }

        private async Task WaitForServerAsync()
        {
            DateTime startedAt = DateTime.UtcNow;

            while (DateTime.UtcNow - startedAt < ServerStartupTimeout)
            {
                if (serverProcess != null && ownsServerProcess && serverProcess.HasExited)
                {
                    Log("server exited before port ready");
                    throw new InvalidOperationException("Local server exited before startup finished.");
                }

                if (await IsServerReachableAsync())
                {
                    Log("tcp connect ok");
                    return;
                }

                statusLabel.Text = "Starting local service...";
                await Task.Delay(ServerPollInterval);
            }

            throw new TimeoutException("Timed out waiting for the local server to start.");
        }

        private async Task InitializeWebViewAsync(string userDataRoot)
        {
            statusLabel.Text = "Opening admin page...";
            CoreWebView2EnvironmentOptions options = new CoreWebView2EnvironmentOptions();
            options.AdditionalBrowserArguments = "--disable-gpu --disable-gpu-compositing";
            CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(null, userDataRoot, options);
            await webView.EnsureCoreWebView2Async(environment);
            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
            webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
            webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            webView.CoreWebView2.WebMessageReceived += HandleWebMessageReceived;
            Log("webview args=" + options.AdditionalBrowserArguments);
        }

        private void HandleWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs args)
        {
            string message = args.WebMessageAsJson;
            if (string.IsNullOrWhiteSpace(message))
            {
                return;
            }

            if (message.Contains("\"select-report-folder\""))
            {
                string requestId = ExtractJsonString(message, "requestId");
                string initialPath = ExtractJsonString(message, "initialPath");
                if (string.IsNullOrWhiteSpace(requestId))
                {
                    return;
                }

                BeginInvoke(new Action(delegate
                {
                    SelectReportFolder(requestId, initialPath);
                }));
                return;
            }

            if (message.Contains("\"install-update-package\""))
            {
                BeginInvoke(new Action(delegate
                {
                    InstallUpdatePackageInteractive();
                }));
            }
        }

        private void SelectReportFolder(string requestId, string initialPath)
        {
            using (FolderBrowserDialog dialog = new FolderBrowserDialog())
            {
                dialog.Description = "Select report storage folder";
                dialog.ShowNewFolderButton = true;

                if (!string.IsNullOrWhiteSpace(initialPath) && Directory.Exists(initialPath))
                {
                    dialog.SelectedPath = initialPath;
                }

                DialogResult result = dialog.ShowDialog(this);
                if (result == DialogResult.OK && !string.IsNullOrWhiteSpace(dialog.SelectedPath))
                {
                    PostFolderMessage("select-report-folder-result", requestId, dialog.SelectedPath);
                    return;
                }

                PostFolderMessage("select-report-folder-cancelled", requestId, null);
            }
        }

        private async void InstallUpdatePackageInteractive()
        {
            if (updateInProgress)
            {
                PostUpdateResultMessage(false, "已有更新安装任务正在执行。", false);
                return;
            }

            if (!ownsServerProcess)
            {
                PostUpdateResultMessage(false, "当前实例未托管本地服务，无法安装更新。请关闭其他实例后重试。", false);
                return;
            }

            using (OpenFileDialog dialog = new OpenFileDialog())
            {
                dialog.Filter = "Update package (*.zip)|*.zip";
                dialog.Multiselect = false;
                dialog.Title = "Select update package";

                if (dialog.ShowDialog(this) != DialogResult.OK || string.IsNullOrWhiteSpace(dialog.FileName))
                {
                    PostUpdateResultMessage(false, "已取消更新安装。", true);
                    return;
                }

                string packageRoot = AppDomain.CurrentDomain.BaseDirectory;
                RuntimeState runtimeState = EnsureRuntimeData(packageRoot);
                updateInProgress = true;
                Log("update selected " + dialog.FileName);

                try
                {
                    string resultMessage = await InstallUpdatePackageAsync(dialog.FileName, packageRoot, runtimeState);
                    PostUpdateResultMessage(true, resultMessage, false);
                }
                catch (Exception ex)
                {
                    Log("update failed " + ex);
                    PostUpdateResultMessage(false, ex.Message, false);
                }
                finally
                {
                    updateInProgress = false;
                }
            }
        }

        private async Task<string> InstallUpdatePackageAsync(string zipPath, string packageRoot, RuntimeState runtimeState)
        {
            string runtimeRoot = Path.Combine(packageRoot, "runtime");
            string updateRoot = Path.Combine(runtimeRoot, "updates");
            string stamp = DateTime.Now.ToString("yyyyMMddHHmmss");
            string stagingRoot = Path.Combine(updateRoot, "staging-" + stamp);
            string backupRoot = Path.Combine(updateRoot, "backup-" + stamp);
            Directory.CreateDirectory(updateRoot);

            ZipFile.ExtractToDirectory(zipPath, stagingRoot);
            string extractedRoot = ResolveUpdatePackageRoot(stagingRoot);
            UpdateManifest manifest = LoadUpdateManifest(Path.Combine(extractedRoot, UpdateManifestFileName));
            ValidateUpdateManifest(manifest, extractedRoot);

            StopServer();
            Exception updateError = null;

            try
            {
                BackupTargets(packageRoot, manifest, backupRoot);
                ApplyTargets(packageRoot, extractedRoot, manifest);
                StartServer(runtimeState);
                await WaitForServerAsync();
                TryDeleteDirectory(backupRoot);
                TryDeleteDirectory(stagingRoot);
                Log("update completed");
                return "更新安装完成，已加载新版本。";
            }
            catch (Exception ex)
            {
                updateError = ex;
                Log("update apply failed " + updateError);
            }

            try
            {
                RestoreTargets(packageRoot, manifest, backupRoot);
                StartServer(runtimeState);
                await WaitForServerAsync();
            }
            catch (Exception rollbackError)
            {
                throw new InvalidOperationException(
                    "鏇存柊澶辫触锛屼笖鍥炴粴涔熷け璐ヤ簡銆傝鏌ョ湅 runtime\\desktop.log銆傚師濮嬮敊璇細" + updateError.Message + "锛涘洖婊氶敊璇細" + rollbackError.Message);
            }
            finally
            {
                TryDeleteDirectory(stagingRoot);
            }

            throw new InvalidOperationException("鏇存柊澶辫触锛屽凡鑷姩鍥炴粴鍒版棫鐗堟湰銆傚師鍥狅細" + updateError.Message);
        }

        private static string ResolveUpdatePackageRoot(string stagingRoot)
        {
            string[] manifestFiles = Directory.GetFiles(stagingRoot, UpdateManifestFileName, SearchOption.AllDirectories);
            if (manifestFiles.Length != 1)
            {
                throw new InvalidOperationException("Update package is missing a valid update-manifest.json.");
            }

            return Path.GetDirectoryName(manifestFiles[0]);
        }

        private static UpdateManifest LoadUpdateManifest(string manifestPath)
        {
            if (!File.Exists(manifestPath))
            {
                throw new InvalidOperationException("Update manifest file not found.");
            }

            JavaScriptSerializer serializer = new JavaScriptSerializer();
            UpdateManifest manifest = serializer.Deserialize<UpdateManifest>(File.ReadAllText(manifestPath));
            if (manifest == null || manifest.Targets == null || manifest.Targets.Length == 0)
            {
                throw new InvalidOperationException("Update manifest does not contain any targets.");
            }

            return manifest;
        }

        private static void ValidateUpdateManifest(UpdateManifest manifest, string extractedRoot)
        {
            for (int index = 0; index < manifest.Targets.Length; index += 1)
            {
                UpdateTarget target = manifest.Targets[index];
                if (target == null)
                {
                    throw new InvalidOperationException("Update manifest contains an empty target entry.");
                }

                if (string.IsNullOrWhiteSpace(target.Source) || string.IsNullOrWhiteSpace(target.Destination))
                {
                    throw new InvalidOperationException("Update target source or destination is empty.");
                }

                if (!IsDirectoryTarget(target) && !IsFileTarget(target))
                {
                    throw new InvalidOperationException("Update target type must be directory or file.");
                }

                string sourcePath = ResolveRelativePath(extractedRoot, target.Source);
                if (IsDirectoryTarget(target) && !Directory.Exists(sourcePath))
                {
                    throw new InvalidOperationException("Update package target directory not found: " + target.Source);
                }

                if (IsFileTarget(target) && !File.Exists(sourcePath))
                {
                    throw new InvalidOperationException("Update package target file not found: " + target.Source);
                }
            }
        }

        private static void BackupTargets(string packageRoot, UpdateManifest manifest, string backupRoot)
        {
            for (int index = 0; index < manifest.Targets.Length; index += 1)
            {
                UpdateTarget target = manifest.Targets[index];
                string destinationPath = ResolveRelativePath(packageRoot, target.Destination);
                string backupPath = ResolveRelativePath(backupRoot, target.Destination);
                string missingMarkerPath = backupPath + ".missing";

                if (IsDirectoryTarget(target))
                {
                    if (Directory.Exists(destinationPath))
                    {
                        CopyDirectory(destinationPath, backupPath);
                    }
                    else
                    {
                        EnsureParentDirectory(missingMarkerPath);
                        File.WriteAllText(missingMarkerPath, string.Empty);
                    }
                }
                else
                {
                    if (File.Exists(destinationPath))
                    {
                        EnsureParentDirectory(backupPath);
                        File.Copy(destinationPath, backupPath, true);
                    }
                    else
                    {
                        EnsureParentDirectory(missingMarkerPath);
                        File.WriteAllText(missingMarkerPath, string.Empty);
                    }
                }
            }
        }

        private static void ApplyTargets(string packageRoot, string extractedRoot, UpdateManifest manifest)
        {
            for (int index = 0; index < manifest.Targets.Length; index += 1)
            {
                UpdateTarget target = manifest.Targets[index];
                string sourcePath = ResolveRelativePath(extractedRoot, target.Source);
                string destinationPath = ResolveRelativePath(packageRoot, target.Destination);

                DeleteTargetPath(destinationPath);

                if (IsDirectoryTarget(target))
                {
                    CopyDirectory(sourcePath, destinationPath);
                }
                else
                {
                    EnsureParentDirectory(destinationPath);
                    File.Copy(sourcePath, destinationPath, true);
                }
            }
        }

        private static void RestoreTargets(string packageRoot, UpdateManifest manifest, string backupRoot)
        {
            for (int index = 0; index < manifest.Targets.Length; index += 1)
            {
                UpdateTarget target = manifest.Targets[index];
                string destinationPath = ResolveRelativePath(packageRoot, target.Destination);
                string backupPath = ResolveRelativePath(backupRoot, target.Destination);
                string missingMarkerPath = backupPath + ".missing";

                DeleteTargetPath(destinationPath);

                if (File.Exists(missingMarkerPath))
                {
                    continue;
                }

                if (IsDirectoryTarget(target))
                {
                    if (Directory.Exists(backupPath))
                    {
                        CopyDirectory(backupPath, destinationPath);
                    }
                }
                else
                {
                    if (File.Exists(backupPath))
                    {
                        EnsureParentDirectory(destinationPath);
                        File.Copy(backupPath, destinationPath, true);
                    }
                }
            }
        }

        private static bool IsDirectoryTarget(UpdateTarget target)
        {
            return string.Equals(target.Type, "directory", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsFileTarget(UpdateTarget target)
        {
            return string.Equals(target.Type, "file", StringComparison.OrdinalIgnoreCase);
        }

        private static string ResolveRelativePath(string root, string relativePath)
        {
            string rootFullPath = Path.GetFullPath(root);
            string combinedPath = Path.GetFullPath(Path.Combine(rootFullPath, relativePath ?? string.Empty));
            string rootWithSeparator = rootFullPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                + Path.DirectorySeparatorChar;

            if (!combinedPath.StartsWith(rootWithSeparator, StringComparison.OrdinalIgnoreCase)
                && !string.Equals(combinedPath, rootFullPath, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Unsafe update path detected: " + relativePath);
            }

            return combinedPath;
        }

        private static void CopyDirectory(string sourceDirectory, string destinationDirectory)
        {
            DirectoryInfo sourceInfo = new DirectoryInfo(sourceDirectory);
            if (!sourceInfo.Exists)
            {
                throw new DirectoryNotFoundException("Source directory not found: " + sourceDirectory);
            }

            if (!Directory.Exists(destinationDirectory))
            {
                Directory.CreateDirectory(destinationDirectory);
            }

            FileInfo[] files = sourceInfo.GetFiles();
            for (int index = 0; index < files.Length; index += 1)
            {
                FileInfo file = files[index];
                string targetPath = Path.Combine(destinationDirectory, file.Name);
                file.CopyTo(targetPath, true);
            }

            DirectoryInfo[] directories = sourceInfo.GetDirectories();
            for (int index = 0; index < directories.Length; index += 1)
            {
                DirectoryInfo directory = directories[index];
                CopyDirectory(directory.FullName, Path.Combine(destinationDirectory, directory.Name));
            }
        }

        private static void DeleteTargetPath(string path)
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }

            if (Directory.Exists(path))
            {
                Directory.Delete(path, true);
            }
        }

        private static void EnsureParentDirectory(string path)
        {
            string directoryPath = Path.GetDirectoryName(path);
            if (!string.IsNullOrWhiteSpace(directoryPath) && !Directory.Exists(directoryPath))
            {
                Directory.CreateDirectory(directoryPath);
            }
        }

        private static void TryDeleteDirectory(string path)
        {
            try
            {
                if (Directory.Exists(path))
                {
                    Directory.Delete(path, true);
                }
            }
            catch
            {
            }
        }

        private void PostFolderMessage(string type, string requestId, string path)
        {
            if (webView.CoreWebView2 == null)
            {
                return;
            }

            string payload =
                "{\"type\":\"" + EscapeJson(type) + "\","
                + "\"requestId\":\"" + EscapeJson(requestId) + "\""
                + (path == null ? string.Empty : ",\"path\":\"" + EscapeJson(path) + "\"")
                + "}";
            webView.CoreWebView2.PostWebMessageAsJson(payload);
        }

        private void PostUpdateResultMessage(bool success, string message, bool cancelled)
        {
            if (webView.CoreWebView2 == null)
            {
                return;
            }

            string payload =
                "{\"type\":\"install-update-package-result\","
                + "\"success\":" + (success ? "true" : "false") + ","
                + "\"cancelled\":" + (cancelled ? "true" : "false") + ","
                + "\"message\":\"" + EscapeJson(message) + "\""
                + "}";
            webView.CoreWebView2.PostWebMessageAsJson(payload);
        }

        private void StopServer()
        {
            Process processToStop = serverProcess;
            bool shouldKillOwnedProcess = ownsServerProcess;
            serverProcess = null;
            ownsServerProcess = false;

            if (processToStop == null)
            {
                return;
            }

            try
            {
                if (shouldKillOwnedProcess && !processToStop.HasExited)
                {
                    processToStop.Kill();
                    if (!processToStop.WaitForExit(5000))
                    {
                        TryKillProcessTree(processToStop.Id);
                        processToStop.WaitForExit(5000);
                    }
                }
            }
            catch
            {
            }
            finally
            {
                processToStop.Dispose();
            }
        }

        private async Task<bool> IsServerReachableAsync()
        {
            using (TcpClient client = new TcpClient())
            {
                try
                {
                    Task connectTask = client.ConnectAsync(ServerHost, ServerPort);
                    Task completed = await Task.WhenAny(connectTask, Task.Delay(ServerPollInterval));
                    return completed == connectTask && client.Connected;
                }
                catch
                {
                    return false;
                }
            }
        }

        private void ShowStartupError(Exception ex)
        {
            string message =
                "Desktop startup failed.\r\n\r\n"
                + ex.Message
                + "\r\n\r\nRecent server output:\r\n"
                + (string.IsNullOrWhiteSpace(serverOutput) ? "(no output)" : serverOutput);

            MessageBox.Show(this, message, ProductNameText, MessageBoxButtons.OK, MessageBoxIcon.Error);
            Log("startup error " + ex);
        }

        private void AppendServerOutput(string line)
        {
            string combined = string.Concat(serverOutput, line, Environment.NewLine);
            serverOutput = combined.Length > 8000
                ? combined.Substring(combined.Length - 8000)
                : combined;
            Log("server: " + line);
        }

        private void Log(string message)
        {
            try
            {
                File.AppendAllText(
                    logPath,
                    string.Format("[{0}] {1}{2}", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"), message, Environment.NewLine));
            }
            catch
            {
            }
        }

        private static int GetProcessExitCode(Process process)
        {
            try
            {
                return process.ExitCode;
            }
            catch
            {
                return -1;
            }
        }

        private static void TryKillProcessTree(int processId)
        {
            try
            {
                using (Process taskKillProcess = Process.Start(
                    new ProcessStartInfo
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

        private static string QuoteArgument(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }

        private static string ExtractJsonString(string json, string key)
        {
            Match match = Regex.Match(json, "\"" + Regex.Escape(key) + "\"\\s*:\\s*\"((?:\\\\.|[^\"])*)\"");
            return match.Success ? UnescapeJson(match.Groups[1].Value) : string.Empty;
        }

        private static string EscapeJson(string value)
        {
            return (value ?? string.Empty)
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\r", "\\r")
                .Replace("\n", "\\n");
        }

        private static string UnescapeJson(string value)
        {
            return Regex.Replace(value ?? string.Empty, "\\\\([\\\\\"/bfnrt])", delegate(Match match)
            {
                string token = match.Groups[1].Value;
                switch (token)
                {
                    case "\\":
                        return "\\";
                    case "\"":
                        return "\"";
                    case "/":
                        return "/";
                    case "b":
                        return "\b";
                    case "f":
                        return "\f";
                    case "n":
                        return "\n";
                    case "r":
                        return "\r";
                    case "t":
                        return "\t";
                    default:
                        return token;
                }
            });
        }

        private sealed class RuntimeState
        {
            public RuntimeState(
                string packageRoot,
                string userDataRoot,
                string uploadsRoot,
                string databasePath,
                string adminDistPath,
                string serverEntryPath,
                string nodeExePath)
            {
                PackageRoot = packageRoot;
                UserDataRoot = userDataRoot;
                UploadsRoot = uploadsRoot;
                DatabasePath = databasePath;
                AdminDistPath = adminDistPath;
                ServerEntryPath = serverEntryPath;
                NodeExePath = nodeExePath;
            }

            public string PackageRoot { get; private set; }
            public string UserDataRoot { get; private set; }
            public string UploadsRoot { get; private set; }
            public string DatabasePath { get; private set; }
            public string AdminDistPath { get; private set; }
            public string ServerEntryPath { get; private set; }
            public string NodeExePath { get; private set; }
        }

        private sealed class UpdateManifest
        {
            public string Version { get; set; }
            public UpdateTarget[] Targets { get; set; }
        }

        private sealed class UpdateTarget
        {
            public string Source { get; set; }
            public string Destination { get; set; }
            public string Type { get; set; }
        }
    }
}
