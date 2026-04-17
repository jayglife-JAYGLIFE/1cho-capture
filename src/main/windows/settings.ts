import { BrowserWindow } from 'electron'
import path from 'node:path'
import { IPC } from '../../shared/constants'
import { getSettings } from '../store'

let settingsWindow: BrowserWindow | null = null

export function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 560,
    height: 620,
    resizable: false,
    title: '1초캡처 설정',
    backgroundColor: '#111827',
    webPreferences: {
      preload: path.join(__dirname, '../preload/settings.js'),
      contextIsolation: true,
      sandbox: false
    }
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    settingsWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/settings/index.html`)
  } else {
    settingsWindow.loadFile(path.join(__dirname, '../renderer/settings/index.html'))
  }

  settingsWindow.webContents.once('did-finish-load', () => {
    settingsWindow?.webContents.send(IPC.SETTINGS_INIT, getSettings())
  })
}
