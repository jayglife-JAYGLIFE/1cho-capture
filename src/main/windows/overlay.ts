import { BrowserWindow, Display, globalShortcut, powerMonitor, screen } from 'electron'
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
let autoResetTimer: NodeJS.Timeout | null = null
const AUTO_RESET_MS = 60_000 // 60초 안에 사용자 액션 없으면 강제 정리

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

  // v0.7.7: ESC를 main 단에서 직접 잡음 (renderer keydown 리스너가 포커스 문제로
  // 못 받는 케이스 대비). before-input-event 는 webContents가 살아있는 한 잡힘.
  w.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'Escape') {
      event.preventDefault()
      cancelRegionOverlay()
    }
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
    console.log('[overlay] display-added → 오버레이 추가')
    entries.push(buildOverlayWindow(d))
  })
  screen.on('display-removed', (_, d) => {
    console.log('[overlay] display-removed → 오버레이 제거')
    const idx = entries.findIndex((e) => e.displayId === d.id)
    if (idx >= 0) {
      const [removed] = entries.splice(idx, 1)
      if (!removed.window.isDestroyed()) removed.window.destroy()
    }
  })

  // v0.7.5: DPI/해상도/회전 등 디스플레이 메트릭 변경 시 오버레이 재구축
  // 그렇지 않으면 미리 만든 창의 좌표/크기가 어긋나 첫 캡처가 실패함.
  screen.on('display-metrics-changed', () => {
    console.log('[overlay] display-metrics-changed → 오버레이 재구축')
    rebuildAllOverlays()
  })

  // v0.7.5: 시스템 절전(suspend/sleep)에서 깨어나면 오버레이가 stale 상태가
  // 되어 첫 단축키가 무반응인 케이스가 많아, 깨어남 직후 살짝 지연 두고 재구축.
  powerMonitor.on('resume', () => {
    console.log('[overlay] system resume → 1초 후 오버레이 재구축')
    setTimeout(rebuildAllOverlays, 1000)
  })
  powerMonitor.on('unlock-screen', () => {
    console.log('[overlay] unlock-screen → 오버레이 재구축')
    setTimeout(rebuildAllOverlays, 500)
  })
}

function disposeAllOverlays(): void {
  while (entries.length) {
    const e = entries.pop()
    if (e && !e.window.isDestroyed()) e.window.destroy()
  }
  isOpen = false
  if (autoResetTimer) {
    clearTimeout(autoResetTimer)
    autoResetTimer = null
  }
}

/** v0.7.5: 모든 오버레이 창을 폐기하고 현재 디스플레이 구성으로 새로 만듦. */
function rebuildAllOverlays(): void {
  disposeAllOverlays()
  for (const d of screen.getAllDisplays()) {
    entries.push(buildOverlayWindow(d))
  }
}

/** v0.7.5: 깨진 entry 정리 + 누락된 디스플레이는 새로 빌드. */
function ensureHealthyEntries(): void {
  // 깨진 창 제거
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.window.isDestroyed()) {
      entries.splice(i, 1)
    }
  }
  // 누락된 디스플레이 채움
  const have = new Set(entries.map((e) => e.displayId))
  for (const d of screen.getAllDisplays()) {
    if (!have.has(d.id)) {
      console.log('[overlay] 누락된 디스플레이 발견 → 새 오버레이 생성', d.id)
      entries.push(buildOverlayWindow(d))
    }
  }
}

function isAnyOverlayVisible(): boolean {
  return entries.some((e) => !e.window.isDestroyed() && e.window.isVisible())
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
  // v0.7.5: 깨진 entries 정리 + 디스플레이 변경 자동 반영
  ensureHealthyEntries()

  // 이미 보이는 오버레이가 있으면 진짜 열린 상태 → 무시
  if (isAnyOverlayVisible()) {
    isOpen = true
    return
  }

  // isOpen 플래그가 stuck 상태면 자동 리셋 (첫 단축키 무반응 → 두 번째에 작동 패턴 해결)
  if (isOpen) {
    console.warn('[overlay] isOpen이 true인데 보이는 창이 없음 → 자동 리셋')
    isOpen = false
  }

  isOpen = true
  hideToolbarForCapture()

  try {
    let shownCount = 0
    for (const entry of entries) {
      await waitForReady(entry)
      if (entry.window.isDestroyed()) continue
      const display = screen.getAllDisplays().find((d) => d.id === entry.displayId)
      if (!display) continue
      try {
        entry.window.webContents.send(IPC.OVERLAY_INIT, {
          displayId: entry.displayId,
          bounds: display.bounds,
          scaleFactor: display.scaleFactor
        })
        entry.window.showInactive()
        entry.window.focus()
        shownCount++
      } catch (showErr) {
        console.warn('[overlay] show 실패, 해당 entry 폐기', showErr)
        if (!entry.window.isDestroyed()) entry.window.destroy()
      }
    }

    // 단 하나도 못 띄웠으면 → 전체 재구축 후 한 번 재시도
    if (shownCount === 0) {
      console.warn('[overlay] 0개 표시됨 → 전체 재구축 후 재시도')
      isOpen = false
      rebuildAllOverlays()
      // 재시도는 한 번만
      for (const entry of entries) {
        await waitForReady(entry, 2000)
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
        shownCount++
      }
      if (shownCount === 0) {
        throw new Error('재구축 후에도 오버레이를 표시할 수 없음')
      }
      isOpen = true
    }

    // v0.7.7: 어떤 앱이 포커스든 ESC를 잡기 위해 글로벌 단축키 임시 등록.
    // 오버레이 닫힐 때 unregister.
    try {
      globalShortcut.register('Escape', () => {
        console.log('[overlay] global Escape → cancel')
        cancelRegionOverlay()
      })
    } catch (e) {
      console.warn('[overlay] globalShortcut Escape 등록 실패:', e)
    }

    // 60초 안에 사용자 액션 없으면 자동 정리 (stuck 방지)
    if (autoResetTimer) clearTimeout(autoResetTimer)
    autoResetTimer = setTimeout(() => {
      console.warn('[overlay] 60초 무액션 → 자동 정리')
      cancelRegionOverlay()
    }, AUTO_RESET_MS)
  } catch (e) {
    console.error('[overlay] openRegionOverlay', e)
    isOpen = false
    closeAllOverlays()
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
  // v0.7.5: 자동 reset 타이머 정리
  if (autoResetTimer) {
    clearTimeout(autoResetTimer)
    autoResetTimer = null
  }
  // v0.7.7: 임시 등록한 글로벌 ESC 해제 (다른 앱이 ESC 다시 사용할 수 있도록)
  try {
    if (globalShortcut.isRegistered('Escape')) {
      globalShortcut.unregister('Escape')
    }
  } catch {
    /* ignore */
  }
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

  // v0.7.9: Windows 멀티 모니터 + per-monitor DPI 정확 변환.
  // 이전 v0.7.4 ~ v0.7.8 은 단순히 (display.bounds + selection) * scaleFactor 로
  // 변환했는데, 두 모니터의 배율이 다른 경우 (예: 메인 150%, 보조 100%)
  // 보조 모니터의 물리 origin 이 '메인 모니터의 물리 너비'에 의존하기 때문에
  // 보조 모니터 좌표가 어긋나 일부만 캡처되는 버그가 있었음.
  // Electron 의 screen.dipToScreenRect 가 Windows 내부적으로 MonitorFromPoint
  // + GetDpiForMonitor 를 호출해 멀티 모니터/다른 DPI 를 자동 처리해주므로 사용.
  // Mac screencapture 는 논리 좌표(points)를 받으므로 변환 없이 그대로.
  let absX: number
  let absY: number
  let capW: number
  let capH: number
  const dipRect = {
    x: display.bounds.x + selection.x,
    y: display.bounds.y + selection.y,
    width: selection.width,
    height: selection.height
  }
  if (process.platform === 'win32') {
    const phys = screen.dipToScreenRect(null, dipRect)
    absX = phys.x
    absY = phys.y
    capW = phys.width
    capH = phys.height
  } else {
    absX = dipRect.x
    absY = dipRect.y
    capW = dipRect.width
    capH = dipRect.height
  }

  // v0.7.0: 스크롤 캡처 모드면 session 시작하고 리턴 (툴바 복원은 완료/취소 시에)
  try {
    const scrollMod = await import('../capture/scroll')
    if (scrollMod.consumeScrollSelectionFlag()) {
      await scrollMod.beginScrollSession(
        { x: absX, y: absY, width: capW, height: capH },
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
      w: capW,
      h: capH,
      platform: process.platform
    })
    const result = await captureRegion(absX, absY, capW, capH)
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
