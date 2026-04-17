import { ipcMain, dialog, clipboard, nativeImage, shell, BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { IPC } from '../shared/constants'
import type { AppSettings, RegionSelection } from '../shared/types'
import { getSettings, setSettings } from './store'
import { captureFullScreen, listWindowSources, captureWindowBySourceId } from './capture'
import { handleOverlaySelection, closeAllOverlays, openRegionOverlay } from './windows/overlay'
import { openEditorWithImage, closeEditor } from './windows/editor'
import {
  startScrollCapture,
  addScrollFrame,
  finishScrollCapture,
  cancelScrollCapture
} from './capture/scroll'

export function registerIpcHandlers(): void {
  // ---------- Overlay ----------
  ipcMain.handle(IPC.OVERLAY_SELECT, async (_, sel: RegionSelection) => {
    await handleOverlaySelection(sel)
  })
  ipcMain.handle(IPC.OVERLAY_CANCEL, () => {
    closeAllOverlays()
  })

  // ---------- Editor ----------
  ipcMain.handle(
    IPC.EDITOR_SAVE,
    async (_, payload: { dataUrl: string; format?: 'png' | 'jpg' }) => {
      const settings = getSettings()
      const format = payload.format ?? settings.fileFormat
      const filename = buildFilename(settings, format)
      await fs.mkdir(settings.saveFolder, { recursive: true })
      const full = path.join(settings.saveFolder, filename)
      const buf = dataUrlToBuffer(payload.dataUrl)
      await fs.writeFile(full, buf)
      return full
    }
  )

  ipcMain.handle(IPC.EDITOR_COPY, async (_, dataUrl: string) => {
    const img = nativeImage.createFromDataURL(dataUrl)
    clipboard.writeImage(img)
  })

  ipcMain.handle(IPC.EDITOR_CLOSE, () => {
    closeEditor()
  })

  // ---------- Settings ----------
  ipcMain.handle(IPC.SETTINGS_GET, () => getSettings())

  ipcMain.handle(IPC.SETTINGS_SET, (_, patch: Partial<AppSettings>) => {
    const next = setSettings(patch)
    // Re-register hotkeys if they changed
    if (patch.hotkeys) {
      import('./hotkey').then((m) => m.registerHotkeys(next.hotkeys))
    }
    return next
  })

  ipcMain.handle(IPC.SETTINGS_PICK_FOLDER, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const res = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  // ---------- Capture entry points (from tray) ----------
  ipcMain.handle(IPC.CAPTURE_REGION, () => openRegionOverlay())
  ipcMain.handle(IPC.CAPTURE_FULLSCREEN, async () => {
    const r = await captureFullScreen()
    await openEditorWithImage(r)
  })
  ipcMain.handle(IPC.CAPTURE_LIST_WINDOWS, async () => listWindowSources())
  ipcMain.handle(IPC.CAPTURE_WINDOW, async (_, sourceId: string) => {
    const r = await captureWindowBySourceId(sourceId)
    if (r) await openEditorWithImage(r)
  })

  // ---------- Scroll capture ----------
  ipcMain.handle(IPC.CAPTURE_SCROLL, () => startScrollCapture())
  ipcMain.handle(IPC.SCROLL_ADD_FRAME, () => addScrollFrame())
  ipcMain.handle(IPC.SCROLL_DONE, () => finishScrollCapture())
  ipcMain.handle(IPC.SCROLL_CANCEL, () => cancelScrollCapture())
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl)
  if (!m) throw new Error('Invalid data URL')
  return Buffer.from(m[2], 'base64')
}

function buildFilename(settings: AppSettings, format: 'png' | 'jpg'): string {
  const d = new Date()
  const pad = (n: number, w = 2): string => n.toString().padStart(w, '0')
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    MM: pad(d.getMonth() + 1),
    DD: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds())
  }
  const base = settings.filenamePattern.replace(/{(YYYY|MM|DD|HH|mm|ss)}/g, (_, k) => map[k])
  return `${base}.${format}`
}

export function openSaveFolder(): void {
  const settings = getSettings()
  shell.openPath(settings.saveFolder).catch(() => undefined)
}
