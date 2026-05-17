# Portable deployment

This project can now be packaged as a browser-based portable app for Windows.

## What it does

- Builds the NestJS server
- Builds the Vue admin site
- Lets the server host the admin site at `http://localhost:3000`
- Creates a `dist-portable` folder with:
  - `node.exe`
  - compiled server files
  - admin static files
  - SQLite database
  - uploaded files
  - `start.bat`

## Build the portable package

From the workspace root:

```powershell
node scripts/build-portable.mjs
```

Or:

```powershell
npm.cmd run build:portable
```

## Deploy on another Windows computer

1. Copy the whole `dist-portable` folder to the target computer.
2. Double-click `start.bat`.
3. Open `http://localhost:3000`.

## Data location

Business data stays in these files inside the portable folder:

- `apps/server/prisma/dev.db`
- `apps/server/uploads/`

Back up those two paths regularly.

## Notes

- If port `3000` is occupied, edit `apps/server/.env` and change `PORT`.
- The admin page is served by the backend, so the target machine only needs a browser.
- This is a portable Windows package, not a single-file native `.exe`. If you want, the next step can be an Electron installer or a true bundled `.exe`.
