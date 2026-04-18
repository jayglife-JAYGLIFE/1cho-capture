import { BrowserWindow, Display, screen } from 'electron'
import path from 'node:path'
import { captureAllDisplaysForOverlay } from '../capture'
import { IPC } from '../../shared/constants'
import type { RegionSelection } from '../../shared/types'
import { openEditorWithImage } from './editor'

/**
 * 성능 최적화 (v0.3.0): 오버레이 창은 앱 시작 시 디스플레이별로 1개씩 미리 생성해두고
 * 숨김 상태로 유지한다. 단축키가 눌리면 배경 이미지만 갈아끼우고 show() 한다.
 * 이전 버전처럼 매번 new BrowserWindow() 하지 않으므로 체감 지연이 수백 ms 사라진다.
 */

interface OverlayEntry {
  window: BrowserWindow
  displayId: number
  ready: boolean // did-finish-load 완료 여부
}

const entries: OverlayEntry[] = []
let pendingDisplays: Awaited<ReturnType<typeof captureAllDisplaysForOverlay>> = []
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

/** 앱 시작 시 호출: 모든 디스플레이에 대해 오버레이 창을 미리 생성. */
export function prewarmOverlayWindows(): void {
  disposeAllOverlays()
  for (const d of screen.getAllDisplays()) {
    entries.push(buildOverlayWindow(d))
  }

  // 디스플레이가 연결/해제되면 오버레이 창도 재구성
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

/** 단축키 호출 진입점: 캡처 후 배경을 갈아끼우고 show. */
export async function openRegionOverlay(): Promise<void> {
  if (isOpen) return
  isOpen = true

  try {
    // 창이 아직 없으면 (극히 드문 케이스 - 예열 전에 호출) 즉시 생성
    if (entries.length === 0) {
      for (const d of screen.getAllDisplays()) {
        entries.push(buildOverlayWindow(d))
      }
    }

    const displayShots = await captureAllDisplaysForOverlay()
    pendingDisplays = displayShots

    // 각 디스플레이 오버레이에 배경 이미지 갈아끼우고 표시
    for (const entry of entries) {
      const shot = displayShots.find((s) => s.displayId === entry.displayId)
      if (!shot) continue
      await waitForReady(entry)
      if (entry.window.isDestroyed()) continue
      const display = screen.getAllDisplays().find((d) => d.id === entry.displayId)
      entry.window.webContents.send(IPC.OVERLAY_INIT, {
        displayId: entry.displayId,
        bounds: display?.bounds ?? shot.bounds,
        scaleFactor: display?.scaleFactor ?? shot.scaleFactor,
        backgroundDataUrl: shot.dataUrl
      })
      entry.window.showInactive()
      entry.window.focus()
    }
  } catch (e) {
    console.error('[overlay] openRegionOverlay', e)
    isOpen = false
  }
}

/** 오버레이 숨기기 (destroy 아님 — 재사용 위해 유지). */
export function closeAllOverlays(): void {
  for (const e of entries) {
    if (!e.window.isDestroyed() && e.window.isVisible()) {
      e.window.hide()
    }
  }
  isOpen = false
}

export async function handleOverlaySelection(selection: RegionSelection): Promise<void> {
  const shot = pendingDisplays.find((s) => s.displayId === selection.displayId)
  closeAllOverlays()
  if (!shot) return

  const croppedDataUrl = await cropDataUrl(shot.dataUrl, selection, shot.scaleFactor)
  await openEditorWithImage({ dataUrl: croppedDataUrl, width: 0, height: 0 })
}

async function cropDataUrl(
  dataUrl: string,
  sel: { x: number; y: number; width: number; height: number },
  scaleFactor: number
): Promise<string> {
  const { nativeImage } = await import('electron')
  const img = nativeImage.createFromDataURL(dataUrl)
  const cropped = img.crop({
    x: Math.round(sel.x * scaleFactor),
    y: Math.round(sel.y * scaleFactor),
    width: Math.max(1, Math.round(sel.width * scaleFactor)),
    height: Math.max(1, Math.round(sel.height * scaleFactor))
  })
  return cropped.toDataURL()
}
