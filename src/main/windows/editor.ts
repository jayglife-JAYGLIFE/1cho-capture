import { BrowserWindow, clipboard, nativeImage } from 'electron'
import path from 'node:path'
import { IPC } from '../../shared/constants'
import type { CaptureResult } from '../../shared/types'

/**
 * 성능 최적화 (v0.3.0): 편집기 창도 앱 시작 시 1개 미리 생성하고 숨김 상태로 유지.
 * 캡처 완료 시 show() + 이미지 전달만 하면 되므로 첫 캡처 지연이 ~1초 → ~50ms로 단축.
 */

let editorWindow: BrowserWindow | null = null
let editorReady = false
let lastCapture: CaptureResult | null = null
let pendingInit: CaptureResult | null = null

export function getLastCapture(): CaptureResult | null {
  return lastCapture
}

export function prewarmEditorWindow(): void {
  if (editorWindow && !editorWindow.isDestroyed()) return
  editorReady = false

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

  // 창 닫기 버튼: destroy가 아닌 hide로 처리 (재사용)
  editorWindow.on('close', (e) => {
    if (editorWindow && !editorWindow.isDestroyed()) {
      e.preventDefault()
      editorWindow.hide()
    }
  })

  editorWindow.webContents.once('did-finish-load', () => {
    editorReady = true
    // 캡처가 먼저 와서 대기 중이면 바로 전달
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

  // 원본 이미지를 클립보드에 즉시 복사
  try {
    const img = nativeImage.createFromDataURL(result.dataUrl)
    clipboard.writeImage(img)
  } catch {
    // ignore
  }

  // 창이 없거나 destroy 됐으면 재생성
  if (!editorWindow || editorWindow.isDestroyed()) {
    prewarmEditorWindow()
  }

  if (!editorWindow) return

  if (editorReady) {
    editorWindow.webContents.send(IPC.EDITOR_INIT, result)
  } else {
    pendingInit = result
  }

  if (!editorWindow.isVisible()) editorWindow.show()
  editorWindow.focus()
}

export function closeEditor(): void {
  if (editorWindow && !editorWindow.isDestroyed() && editorWindow.isVisible()) {
    editorWindow.hide()
  }
}

/** 앱 종료 시 강제 파괴 */
export function destroyEditorWindow(): void {
  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.removeAllListeners('close')
    editorWindow.destroy()
  }
  editorWindow = null
}
