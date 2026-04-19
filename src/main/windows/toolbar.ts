import { BrowserWindow, screen } from 'electron'
import path from 'node:path'
import { store } from '../store'

/**
 * v0.4.0: 알캡처처럼 작은 플로팅 툴바. 앱이 켜져있다는 걸 시각적으로 알려주고,
 * 버튼 클릭으로 캡처를 시작할 수 있게 한다. 데스크톱 아이콘을 다시 클릭(두 번째
 * 인스턴스 실행)해도 이 툴바가 팝업.
 *
 * 프레임리스 + always-on-top. 드래그 영역은 CSS로 지정. 위치는 localStorage에 저장.
 * 캡처 중엔 자동으로 hide했다가 완료 후 다시 show.
 */

const TOOLBAR_WIDTH = 380
const TOOLBAR_HEIGHT = 48

let toolbarWindow: BrowserWindow | null = null
/** 캡처 실행 중 잠시 숨겼다가 다시 보여야 하는지 기억 */
let wasVisibleBeforeCapture = false

function defaultPosition(): { x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: Math.round(workArea.x + (workArea.width - TOOLBAR_WIDTH) / 2),
    y: Math.round(workArea.y + 40)
  }
}

export function createToolbarWindow(showImmediately: boolean): void {
  if (toolbarWindow && !toolbarWindow.isDestroyed()) {
    if (showImmediately) showToolbar()
    return
  }

  const saved = (store.get('toolbar') as { position?: { x: number; y: number } })?.position
  const pos = saved ?? defaultPosition()

  toolbarWindow = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: TOOLBAR_WIDTH,
    height: TOOLBAR_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // Windows에선 작업표시줄에 표시해서 앱 실행 여부 시각화에 도움
    skipTaskbar: process.platform === 'darwin',
    hasShadow: true,
    backgroundColor: '#00000000',
    title: '1초캡처',
    webPreferences: {
      preload: path.join(__dirname, '../preload/toolbar.js'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false
    }
  })

  toolbarWindow.setAlwaysOnTop(true, 'floating')

  // 창 닫기 버튼: 프레임이 없어서 의미 없지만 안전하게 hide 처리
  toolbarWindow.on('close', (e) => {
    if (toolbarWindow && !toolbarWindow.isDestroyed()) {
      e.preventDefault()
      toolbarWindow.hide()
    }
  })

  // 이동 시 위치 저장 (debounce)
  let moveTimer: NodeJS.Timeout | null = null
  toolbarWindow.on('move', () => {
    if (!toolbarWindow || toolbarWindow.isDestroyed()) return
    if (moveTimer) clearTimeout(moveTimer)
    moveTimer = setTimeout(() => {
      if (!toolbarWindow || toolbarWindow.isDestroyed()) return
      const [x, y] = toolbarWindow.getPosition()
      const current = (store.get('toolbar') as { showOnStartup?: boolean }) ?? {
        showOnStartup: true
      }
      store.set('toolbar', { ...current, position: { x, y } })
    }, 300)
  })

  toolbarWindow.webContents.once('did-finish-load', () => {
    if (showImmediately) showToolbar()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    toolbarWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/toolbar/index.html`)
  } else {
    toolbarWindow.loadFile(path.join(__dirname, '../renderer/toolbar/index.html'))
  }
}

export function showToolbar(): void {
  if (!toolbarWindow || toolbarWindow.isDestroyed()) {
    createToolbarWindow(true)
    return
  }
  toolbarWindow.show()
  toolbarWindow.focus()
}

export function hideToolbar(): void {
  if (toolbarWindow && !toolbarWindow.isDestroyed() && toolbarWindow.isVisible()) {
    toolbarWindow.hide()
  }
}

export function isToolbarVisible(): boolean {
  return !!(toolbarWindow && !toolbarWindow.isDestroyed() && toolbarWindow.isVisible())
}

export function toggleToolbar(): void {
  if (isToolbarVisible()) hideToolbar()
  else showToolbar()
}

/** 캡처 직전 호출: 툴바가 스크린샷에 찍히지 않게 임시 숨김. */
export function hideToolbarForCapture(): void {
  if (!toolbarWindow || toolbarWindow.isDestroyed()) {
    wasVisibleBeforeCapture = false
    return
  }
  wasVisibleBeforeCapture = toolbarWindow.isVisible()
  if (wasVisibleBeforeCapture) toolbarWindow.hide()
}

/** 캡처 완료 후 호출: 원래 보였던 경우에만 다시 표시. */
export function restoreToolbarAfterCapture(): void {
  if (!toolbarWindow || toolbarWindow.isDestroyed()) return
  if (wasVisibleBeforeCapture) toolbarWindow.show()
}

/** 앱 종료 시 강제 파괴. */
export function destroyToolbarWindow(): void {
  if (toolbarWindow && !toolbarWindow.isDestroyed()) {
    toolbarWindow.removeAllListeners('close')
    toolbarWindow.destroy()
  }
  toolbarWindow = null
}
