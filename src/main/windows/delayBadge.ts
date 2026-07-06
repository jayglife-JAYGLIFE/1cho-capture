import { BrowserWindow, ipcMain, screen } from 'electron'
import path from 'node:path'
import { captureFullScreen } from '../capture'
import { openEditorWithImage } from './editor'
import { hideToolbarForCapture, restoreToolbarAfterCapture } from './toolbar'

/**
 * v0.8.9: 지연 캡처 배지
 *
 * 화면 우하단에 작은 원형 배지 창을 띄우고 카운트다운 표시.
 * 그동안 사용자가 팝업 메뉴/드롭다운을 펼쳐놓을 시간 확보.
 * 0초가 되면 전체 화면을 캡처해서 편집기로 → 사용자가 자르기로 원하는
 * 부분만 남기면 됨.
 *
 * 배지 창은 focus 안 가져감 (showInactive) + always-on-top.
 * 사용자 클릭으로 취소 가능.
 */

const BADGE_SIZE = 120
const BADGE_MARGIN = 24

let badgeWin: BrowserWindow | null = null
let currentTimer: NodeJS.Timeout | null = null
let currentTicker: NodeJS.Timeout | null = null
let cancelHandlerRegistered = false

function registerCancelHandler(): void {
  if (cancelHandlerRegistered) return
  cancelHandlerRegistered = true
  ipcMain.on('delay:cancel', () => {
    cancelDelayCapture()
  })
}

function buildBadgeWindow(): BrowserWindow {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { workArea } = display
  const x = workArea.x + workArea.width - BADGE_SIZE - BADGE_MARGIN
  const y = workArea.y + workArea.height - BADGE_SIZE - BADGE_MARGIN

  const w = new BrowserWindow({
    x,
    y,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false, // v0.8.9 핵심: 포커스 절대 안 가져감 → 팝업 메뉴 유지
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    title: '1초캡처 지연 카운트다운',
    webPreferences: {
      preload: path.join(__dirname, '../preload/delayBadge.js'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false
    }
  })
  w.setAlwaysOnTop(true, 'screen-saver')
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // click-through 아님 (사용자가 취소하려면 클릭 가능해야 함)

  if (process.env['ELECTRON_RENDERER_URL']) {
    w.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/delayBadge/index.html`)
  } else {
    w.loadFile(path.join(__dirname, '../renderer/delayBadge/index.html'))
  }

  return w
}

/**
 * 지연 캡처 시작 — 초 카운트다운 후 전체화면 캡처 → 편집기
 */
export function startDelayFullScreenCapture(seconds: number): void {
  registerCancelHandler()

  // 이미 진행 중이면 취소하고 새로 시작
  if (currentTimer) {
    cancelDelayCapture()
  }

  if (badgeWin && !badgeWin.isDestroyed()) {
    badgeWin.destroy()
  }
  badgeWin = buildBadgeWindow()

  let count = seconds
  const sendCount = (): void => {
    if (badgeWin && !badgeWin.isDestroyed()) {
      badgeWin.webContents.send('delay:count', count)
    }
  }

  badgeWin.webContents.once('did-finish-load', () => {
    if (!badgeWin || badgeWin.isDestroyed()) return
    // focus 안 가져감
    badgeWin.showInactive()
    sendCount()
  })

  currentTicker = setInterval(() => {
    count -= 1
    if (count > 0) {
      sendCount()
    }
  }, 1000)

  currentTimer = setTimeout(async () => {
    cleanupTimers()
    // 배지 창 hide (캡처에 안 찍히게)
    if (badgeWin && !badgeWin.isDestroyed()) {
      badgeWin.hide()
    }
    hideToolbarForCapture()
    // OS 렌더링 반영 대기
    await new Promise((r) => setTimeout(r, process.platform === 'win32' ? 120 : 80))
    try {
      const result = await captureFullScreen()
      await openEditorWithImage(result)
    } catch (e) {
      console.error('[delayCapture] failed:', e)
    } finally {
      restoreToolbarAfterCapture()
      if (badgeWin && !badgeWin.isDestroyed()) {
        badgeWin.destroy()
      }
      badgeWin = null
    }
  }, seconds * 1000)
}

function cleanupTimers(): void {
  if (currentTimer) {
    clearTimeout(currentTimer)
    currentTimer = null
  }
  if (currentTicker) {
    clearInterval(currentTicker)
    currentTicker = null
  }
}

export function cancelDelayCapture(): void {
  cleanupTimers()
  if (badgeWin && !badgeWin.isDestroyed()) {
    badgeWin.destroy()
  }
  badgeWin = null
}

export function destroyDelayBadge(): void {
  cancelDelayCapture()
}
