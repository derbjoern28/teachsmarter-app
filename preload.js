const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tsElectron', {
  // Beim Start: vorhandenes Auto-Backup laden
  loadBackup: () => ipcRenderer.invoke('ts-load-backup'),
  // Nach Datensicherung: JSON ans Main-Process schicken (löst dann app.exit aus)
  confirmBackup: (json) => ipcRenderer.invoke('ts-confirm-backup', json),
  // Main-Process meldet: "App schließt gleich, bitte Backup liefern"
  onRequestBackup: (cb) => ipcRenderer.on('ts-request-backup', () => cb()),
  // Bei vollständigem Reset: Backup-Datei vom Dateisystem löschen
  clearBackup: () => ipcRenderer.invoke('ts-clear-backup'),
});
