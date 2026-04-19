import { BrowserWindow, clipboard, nativeImage, ipcMain } from 'electron'
import path from 'node:path'
import { IPC } from '../../shared/constants'
import type { CaptureResult } from '../../shared/types'

/**
 * v0.6.0 최적화:
 * - filePath 방식으로 이미지 전달 → base64 직렬화 제거
 * - clipboard.createFromPath 사용 (data URL보다 빠름)
 * - 이미지 로드 완료 후 show (빈 창 깜빡임 제거)
 */

let editorWindow: BrowserWindow | null = null
let editorReady = false
let lastCapture: CaptureResult | null = null
let pendingInit: CaptureResult | null = null

const EDITOR_READY_SIGNAL = 'editor:ready-to-show'

// 한 번만 등록
let readyHandlerRegistered = false
function registerReadyHandler(): void {
  if (readyHandlerRegistered) return
  readyHandlerRegistered = true
  ipcMain.on(EDITOR_READY_SIGNAL, () => {
    if (editorWindow && !editorWindow.isDestroyed() && !editorWindow.isVisible()) {
      editorWindow.show()
      editorWindow.focus()
    }
  })
}

export function getLastCapture(): CaptureResult | null {
  return lastCapture
}

export function prewarmEditorWindow(): void {
  if (editorWindow && !editorWindow.isDestroyed()) return
  editorReady = false
  registerReadyHandler()

  editorWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 700,
    minHeight: 500,
    show: false,
    title: '1초캡처 - 편집',
    backgroundColor: '#1f2937',
    webPreferences: {
      preload: path.join(__dirname, '../preload/editor.js'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false
    }
  })

  editorWindow.on('close', (e) => {
    if (editorWindow && !editorWindow.isDestroyed()) {
      e.preventDefault()
      editorWindow.hide()
    }
  })

  editorWindow.webContents.once('did-finish-load', () => {
    editorReady = true
    if (pendingInit && editorWindow && !editorWindow.isDestroyed()) {
      editorWindow.webContents.send(IPC.EDITOR_INIT, pendingInit)
      pendingInit = null
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    editorWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/editor/index.html`)
  } else {
    editorWindow.loadFile(path.join(__dirname, '../renderer/editor/index.html'))
  }
}

export async function openEditorWithImage(result: CaptureResult): Promise<void> {
  lastCapture = result

  // 클립보드 자동 복사 — filePath 우선 (data URL보다 빠름)
  try {
    let img: Electron.NativeImage | null = null
    if (result.filePath) {
      img = nativeImage.createFromPath(result.filePath)
    } else if (result.dataUrl) {
      img = nativeImage.createFromDataURL(result.dataUrl)
    }
    if (img && !img.isEmpty()) clipboard.writeImage(img)
  } catch {
    /* ignore */
  }

  if (!editorWindow || editorWindow.isDestroyed()) {
    prewarmEditorWindow()
  }
  if (!editorWindow) return

  if (editorReady) {
    editorWindow.webContents.send(IPC.EDITOR_INIT, result)
  } else {
    pendingInit = result
  }

  // show는 renderer가 EDITOR_READY_SIGNAL을 보내오면 실행 (빈 창 깜빡임 방지).
  // 하지만 안전장치: 350ms 내에 신호가 없으면 그냥 show (이미지 로드 실패 대비)
  setTimeout(() => {
    if (editorWindow && !editorWindow.isDestroyed() && !editorWindow.isVisible()) {
      editorWindow.show()
      editorWindow.focus()
    }
  }, 350)
}

export function closeEditor(): void {
  if (editorWindow && !editorWindow.isDestroyed() && editorWindow.isVisible()) {
    editorWindow.hide()
  }
}

export function destroyEditorWindow(): void {
  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.removeAllListeners('close')
    editorWindow.destroy()
  }
  editorWindow = null
}
