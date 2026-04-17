import { app, BrowserWindow } from 'electron'
import { createTray } from './tray'
import { registerHotkeys, unregisterAllHotkeys } from './hotkey'
import { registerIpcHandlers } from './ipc'
import { getSettings } from './store'
import { promises as fs } from 'node:fs'

// Single instance
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

// Hide dock icon on Mac; tray-only app
if (process.platform === 'darwin') {
  app.dock?.hide()
}

app.whenReady().then(async () => {
  // Ensure save folder exists
  try {
    await fs.mkdir(getSettings().saveFolder, { recursive: true })
  } catch {
    // ignore
  }

  registerIpcHandlers()
  createTray()
  registerHotkeys(getSettings().hotkeys)

  app.on('activate', () => {
    // macOS: re-creating a window on activate isn't needed (tray app)
    if (BrowserWindow.getAllWindows().length === 0) {
      // no-op
    }
  })
})

app.on('window-all-closed', () => {
  // Keep app running in background (tray-only)
})

app.on('will-quit', () => {
  unregisterAllHotkeys()
})
