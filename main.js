const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function createWindow() {
  const iconFile = process.platform === 'win32' ? 'ts-icon.ico'
    : process.platform === 'darwin' ? 'ts-icon-512.png'
    : 'ts-icon-512.png';

  const win = new BrowserWindow({
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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
