import { BrowserWindow, screen } from 'electron'
import path from 'node:path'
import { IPC } from '../../shared/constants'
import type { ScrollControllerStatus } from '../../shared/bridge'

/**
 * v0.7.0: 스크롤 캡처 진행 중에 화면 하단에 떠있는 작은 컨트롤러 창.
 * "N 프레임 캡처됨" 표시 + [완료] / [취소] 버튼.
 */

const WIDTH = 420
const HEIGHT = 48

let win: BrowserWindow | null = null
let ready = false
let pendingStatus: ScrollControllerStatus | null = null

export function openScrollController(): void {
  if (win && !win.isDestroyed()) {
    positionWindow(win)
    // v0.9.5: 포커스를 가져가면 자동 스크롤 휠 이벤트가 대상 창으로 안 갈 수 있어 inactive 표시
    win.showInactive()
    return
  }

  ready = false
  const pos = defaultPosition()

  win = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // v0.9.5: 자동 스크롤 중 대상 창의 포커스/휠 라우팅을 방해하지 않도록
    focusable: false,
    skipTaskbar: true,
    hasShadow: true,
    backgroundColor: '#00000000',
    title: '1초캡처 스크롤 캡처',
    webPreferences: {
      preload: path.join(__dirname, '../preload/scrollController.js'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  win.webContents.once('did-finish-load', () => {
    ready = true
    if (pendingStatus && win && !win.isDestroyed()) {
      win.webContents.send(IPC.SCROLL_CONTROLLER_STATUS, pendingStatus)
      pendingStatus = null
    }
    if (win && !win.isDestroyed()) {
      win.showInactive()
    }
  })

  win.on('closed', () => {
    win = null
    ready = false
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/scrollController/index.html`)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/scrollController/index.html'))
  }
}

function defaultPosition(): { x: number; y: number } {
  // v0.8.0: primary 모니터가 아닌 '현재 사용자 마우스가 있는 모니터' 하단에 띄움.
  // 이전엔 보조 모니터에서 스크롤 캡처 시작해도 컨트롤러가 primary에 떠서
  // 사용자가 못 보는 케이스 발생.
  let display: Electron.Display
  try {
    const cursor = screen.getCursorScreenPoint()
    display = screen.getDisplayNearestPoint(cursor)
  } catch {
    display = screen.getPrimaryDisplay()
  }
  const { workArea } = display
  return {
    x: Math.round(workArea.x + (workArea.width - WIDTH) / 2),
    y: Math.round(workArea.y + workArea.height - HEIGHT - 60)
  }
}

function positionWindow(w: BrowserWindow): void {
  const pos = defaultPosition()
  w.setPosition(pos.x, pos.y)
}

export function updateScrollControllerStatus(status: ScrollControllerStatus): void {
  if (!win || win.isDestroyed()) {
    pendingStatus = status
    return
  }
  if (ready) {
    win.webContents.send(IPC.SCROLL_CONTROLLER_STATUS, status)
  } else {
    pendingStatus = status
  }
}

export function closeScrollController(): void {
  if (win && !win.isDestroyed()) {
    win.destroy()
  }
  win = null
  ready = false
  pendingStatus = null
}

export function isScrollControllerOpen(): boolean {
  return !!(win && !win.isDestroyed())
}
