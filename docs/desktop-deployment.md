# Electron desktop package

This project can be packaged as a Windows desktop app with an installer.

## What the desktop app does

- Starts the NestJS server in the background
- Uses the bundled Vue admin site as the desktop UI
- Stores the SQLite database in the current user's app data directory
- Stores uploaded files in the current user's app data directory
- Installs like a normal Windows application through an NSIS installer

## Build steps

1. Build the desktop assets:

```powershell
node scripts/build-desktop-assets.mjs
```

2. Build the runnable unpacked desktop app:

```powershell
npm.cmd run build:desktop-unpacked
```

This creates:

- `dist-electron/win-unpacked/Xingye Sample Manager.exe`

3. Build the distributable Windows installer:

```powershell
npm.cmd run dist:desktop
```

This creates:

- `dist-electron/Xingye Sample Manager-Setup-1.0.0.exe`

## Runtime data location

After installation, the desktop app stores mutable data under:

- `%APPDATA%\\Sample Management Desktop\\runtime\\dev.db`
- `%APPDATA%\\Sample Management Desktop\\runtime\\uploads\\`

The app copies the bundled `dev.db` into that location on first launch.

## Notes

- The desktop app always binds the local server to `127.0.0.1:3000`.
- Only one instance is allowed at a time.
- If you update the bundled seed database later, existing installed users keep their own local database.
- Building the installer requires Electron and electron-builder to be installed in the workspace.
