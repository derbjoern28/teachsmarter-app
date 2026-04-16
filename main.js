const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let win;
let quitting = false;

function backupPath() {
  return path.join(app.getPath('userData'), 'ts-auto-backup.json');
}

function createWindow() {
  const iconFile = process.platform === 'win32' ? 'ts-icon.ico'
    : 'ts-icon-app.png';

  win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 768,
    minHeight: 600,
    icon: path.join(__dirname, iconFile),
    title: 'TeachSmarter',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile('TeachSmarter_Dashboard.html');

  // Externe Links (http/https) im System-Browser öffnen, interne Popups (blob/file) erlauben
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://') && !url.startsWith('blob:')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

// ── Auto-Backup IPC ──────────────────────────────────────────────────────────

// Renderer fragt: "Gibt es ein gespeichertes Backup?"
ipcMain.handle('ts-load-backup', () => {
  const p = backupPath();
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
});

// Renderer liefert Backup-JSON nach Aufforderung → speichern, dann quit
ipcMain.handle('ts-confirm-backup', (event, json) => {
  try {
    fs.writeFileSync(backupPath(), json, 'utf8');
  } catch (e) {
    console.error('Auto-Backup schreiben fehlgeschlagen:', e);
  }
  if (quitting) app.exit(0);
});

// ── Quit-Flow: erst Backup anfordern, dann beenden ──────────────────────────

app.on('before-quit', (e) => {
  if (quitting) return; // zweiter Aufruf nach app.exit → durchlassen
  e.preventDefault();
  quitting = true;
  if (win) {
    win.webContents.send('ts-request-backup');
    // Sicherheits-Timeout: nach 4s erzwingen falls Renderer nicht antwortet
    setTimeout(() => app.exit(0), 4000);
  } else {
    app.exit(0);
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
