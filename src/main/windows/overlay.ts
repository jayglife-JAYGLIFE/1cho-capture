import { BrowserWindow, Display, screen } from 'electron'
import path from 'node:path'
import { captureRegion } from '../capture'
import { IPC } from '../../shared/constants'
import type { RegionSelection } from '../../shared/types'
import { openEditorWithImage } from './editor'
import { hideToolbarForCapture, restoreToolbarAfterCapture } from './toolbar'

/**
 * v0.3.1 UX 개편: 맥 Cmd+Shift+4 처럼 "라이브 화면" 위에 투명 오버레이만 띄우고,
 * 드래그가 끝나면 오버레이를 숨긴 뒤 해당 영역만 네이티브로 캡처한다.
 *
 * 이전 v0.3.0은 단축키 누를 때 전체 화면을 먼저 스냅샷으로 찍어 그 이미지 위에 드래그를
 * 받았기에, 순간적으로 화면이 정지/배율 살짝 어긋남 등 어색함이 있었다.
 *
 * 창 예열 자체는 유지 — 지연은 여전히 ~50ms 수준.
 */

interface OverlayEntry {
  window: BrowserWindow
  displayId: number
  ready: boolean
}

const entries: OverlayEntry[] = []
let isOpen = false

function buildOverlayWindow(d: Display): OverlayEntry {
  const w = new BrowserWindow({
    x: d.bounds.x,
    y: d.bounds.y,
    width: d.bounds.width,
    height: d.bounds.height,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    fullscreen: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/overlay.js'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false
    }
  })
  w.setAlwaysOnTop(true, 'screen-saver')
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  const entry: OverlayEntry = { window: w, displayId: d.id, ready: false }

  w.webContents.once('did-finish-load', () => {
    entry.ready = true
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    w.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay/index.html`)
  } else {
    w.loadFile(path.join(__dirname, '../renderer/overlay/index.html'))
  }

  return entry
}

export function prewarmOverlayWindows(): void {
  disposeAllOverlays()
  for (const d of screen.getAllDisplays()) {
    entries.push(buildOverlayWindow(d))
  }

  screen.on('display-added', (_, d) => {
    entries.push(buildOverlayWindow(d))
  })
  screen.on('display-removed', (_, d) => {
    const idx = entries.findIndex((e) => e.displayId === d.id)
    if (idx >= 0) {
      const [removed] = entries.splice(idx, 1)
      if (!removed.window.isDestroyed()) removed.window.destroy()
    }
  })
}

function disposeAllOverlays(): void {
  while (entries.length) {
    const e = entries.pop()
    if (e && !e.window.isDestroyed()) e.window.destroy()
  }
}

async function waitForReady(entry: OverlayEntry, timeoutMs = 2000): Promise<void> {
  if (entry.ready) return
  return new Promise((resolve) => {
    const start = Date.now()
    const check = (): void => {
      if (entry.ready) return resolve()
      if (Date.now() - start > timeoutMs) return resolve()
      setTimeout(check, 10)
    }
    check()
  })
}

/** 단축키 진입점: 라이브 화면 위에 투명 오버레이 즉시 표시. */
export async function openRegionOverlay(): Promise<void> {
  if (isOpen) return
  isOpen = true

  // 오버레이 + 플로팅 툴바 모두 스크린샷에 찍히면 안 됨
  hideToolbarForCapture()

  try {
    if (entries.length === 0) {
      for (const d of screen.getAllDisplays()) {
        entries.push(buildOverlayWindow(d))
      }
    }

    for (const entry of entries) {
      await waitForReady(entry)
      if (entry.window.isDestroyed()) continue
      const display = screen.getAllDisplays().find((d) => d.id === entry.displayId)
      if (!display) continue
      entry.window.webContents.send(IPC.OVERLAY_INIT, {
        displayId: entry.displayId,
        bounds: display.bounds,
        scaleFactor: display.scaleFactor
      })
      entry.window.showInactive()
      entry.window.focus()
    }
  } catch (e) {
    console.error('[overlay] openRegionOverlay', e)
    isOpen = false
    restoreToolbarAfterCapture()
  }
}

export function closeAllOverlays(): void {
  for (const e of entries) {
    if (!e.window.isDestroyed() && e.window.isVisible()) {
      e.window.hide()
    }
  }
  isOpen = false
}

/** 사용자가 ESC 등으로 선택을 취소한 경우: 툴바 복원 */
export function cancelRegionOverlay(): void {
  closeAllOverlays()
  restoreToolbarAfterCapture()
}

/**
 * 드래그 완료 → 오버레이 숨긴 후 해당 영역만 네이티브 캡처.
 * 오버레이 자체가 스크린샷에 찍히지 않도록 hide 후 짧게 대기 (OS 렌더링 반영).
 */
export async function handleOverlaySelection(selection: RegionSelection): Promise<void> {
  closeAllOverlays()

  const display = screen.getAllDisplays().find((d) => d.id === selection.displayId)
  if (!display) {
    restoreToolbarAfterCapture()
    return
  }

  // 오버레이가 실제 화면에서 사라지기까지 OS 렌더링 반영 대기.
  // macOS는 보통 16~32ms면 충분, Windows는 DWM 합성 때문에 50~80ms 권장.
  await new Promise((r) => setTimeout(r, process.platform === 'win32' ? 100 : 60))

  const absX = display.bounds.x + selection.x
  const absY = display.bounds.y + selection.y

  // v0.7.0: 스크롤 캡처 모드면 session 시작하고 리턴 (툴바 복원은 완료/취소 시에)
  try {
    const scrollMod = await import('../capture/scroll')
    if (scrollMod.consumeScrollSelectionFlag()) {
      await scrollMod.beginScrollSession(
        { x: absX, y: absY, width: selection.width, height: selection.height },
        display.id,
        display.scaleFactor
      )
      restoreToolbarAfterCapture()
      return
    }
  } catch (e) {
    console.warn('[overlay] scroll mode check fail:', e)
  }

  try {
    console.log('[overlay] capturing region:', {
      absX,
      absY,
      w: selection.width,
      h: selection.height
    })
    const result = await captureRegion(absX, absY, selection.width, selection.height)
    console.log('[overlay] captured →', result.filePath ?? '(no filePath)')
    await openEditorWithImage(result)
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e)
    console.error('[overlay] captureRegion 실패:', msg)
    try {
      const { Notification } = await import('electron')
      new Notification({
        title: '1초캡처 — 캡처 실패',
        body:
          process.platform === 'darwin'
            ? '화면 녹화 권한이 허용됐는지 확인해주세요.\n시스템 설정 → 개인정보 보호 및 보안 → 화면 녹화.'
            : '캡처에 실패했습니다. ' + msg
      }).show()
    } catch {
      /* ignore */
    }
  } finally {
    restoreToolbarAfterCapture()
  }
}
