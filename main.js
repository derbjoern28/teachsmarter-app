const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let win;
let quitting = false;

function backupPath() {
  return path.join(app.getPath('userData'), 'ts-auto-backup.json');
}

function requestBackupAndClose() {
  if (!win || win.isDestroyed()) { app.exit(0); return; }
  win.webContents.send('ts-request-backup');
  // Sicherheits-Timeout: nach 4s erzwingen falls Renderer nicht antwortet
  setTimeout(() => { if (!win.isDestroyed()) win.destroy(); }, 4000);
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

  // ── Backup beim Schließen: close-Event abfangen BEVOR Fenster destroyed wird
  win.on('close', (e) => {
    if (quitting) return; // Backup schon erledigt, Fenster darf schließen
    e.preventDefault();
    quitting = true;
    requestBackupAndClose();
  });

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

ipcMain.handle('ts-load-backup', () => {
  const p = backupPath();
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
});

ipcMain.handle('ts-confirm-backup', (event, json) => {
  try {
    if (json) fs.writeFileSync(backupPath(), json, 'utf8');
  } catch (e) {
    console.error('Auto-Backup schreiben fehlgeschlagen:', e);
  }
  // Backup erledigt → Fenster wirklich zerstören (löst window-all-closed aus)
  if (win && !win.isDestroyed()) win.destroy();
});

ipcMain.handle('ts-clear-backup', () => {
  const p = backupPath();
  try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {
    console.error('Auto-Backup löschen fehlgeschlagen:', e);
  }
});

// ── App-Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
