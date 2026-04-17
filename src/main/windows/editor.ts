import { BrowserWindow, clipboard, nativeImage } from 'electron'
import path from 'node:path'
import { IPC } from '../../shared/constants'
import type { CaptureResult } from '../../shared/types'

let lastCapture: CaptureResult | null = null
let editorWindow: BrowserWindow | null = null

export function getLastCapture(): CaptureResult | null {
  return lastCapture
}

export async function openEditorWithImage(result: CaptureResult): Promise<void> {
  lastCapture = result

  // Auto-copy original to clipboard immediately
  try {
    const img = nativeImage.createFromDataURL(result.dataUrl)
    clipboard.writeImage(img)
  } catch {
    // ignore
  }

  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.focus()
    editorWindow.webContents.send(IPC.EDITOR_INIT, result)
    return
  }

  editorWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 700,
    minHeight: 500,
    title: '1초캡처 - 편집',
    backgroundColor: '#1f2937',
    webPreferences: {
      preload: path.join(__dirname, '../preload/editor.js'),
      contextIsolation: true,
      sandbox: false
    }
  })

  editorWindow.on('closed', () => {
    editorWindow = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    editorWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/editor/index.html`)
  } else {
    editorWindow.loadFile(path.join(__dirname, '../renderer/editor/index.html'))
  }

  editorWindow.webContents.once('did-finish-load', () => {
    editorWindow?.webContents.send(IPC.EDITOR_INIT, result)
  })
}

export function closeEditor(): void {
  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.close()
  }
  editorWindow = null
}
