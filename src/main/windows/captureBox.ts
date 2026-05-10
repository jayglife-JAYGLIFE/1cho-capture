import { BrowserWindow, screen } from 'electron'
import path from 'node:path'
import { IPC } from '../../shared/constants'
import { captureRegion } from '../capture'
import { openEditorWithImage } from './editor'
import { hideToolbarForCapture, restoreToolbarAfterCapture } from './toolbar'
import { getSettings, setSettings } from '../store'

/**
 * v0.8.0 창 캡처 박스:
 *
 * 기존 MVP 스텁(영역 캡처로 폴백)을 대체. 사용자가 원하는 크기의 박스를
 * 화면에 띄워서 위치/크기를 조절한 뒤 [캡처] 버튼으로 그 영역만 캡처.
 *
 * - 박스 자체는 frame:false + transparent 로 안쪽이 비치게 (라이브 화면)
 * - 상단의 컨트롤바 영역만 약간 어두운 색으로 표시 (드래그 핸들)
 * - 우측 하단 모서리에 resize 핸들 (HTML로 직접 구현)
 * - 마지막 사용 크기는 자동 저장, 다음 호출 시 복원
 * - 자주 쓰는 크기를 프리셋으로 저장
 */

const MIN_WIDTH = 100
const MIN_HEIGHT = 100
const CONTROL_BAR_HEIGHT = 40 // CaptureBox.tsx와 일치

let win: BrowserWindow | null = null
let ready = false

function defaultBounds(): {
  x: number
  y: number
  width: number
  height: number
} {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { workArea } = display
  const settings = getSettings()
  const last = settings.captureBox?.lastSize ?? { width: 800, height: 600 }
  // 컨트롤바 높이를 더해서 실제 창 높이는 box height + 컨트롤바
  const w = Math.min(last.width, workArea.width)
  const h = Math.min(last.height + CONTROL_BAR_HEIGHT, workArea.height)
  // 사용자 모니터 중앙 부근에 배치
  const x = workArea.x + Math.round((workArea.width - w) / 2)
  const y = workArea.y + Math.round((workArea.height - h) / 2)
  return { x, y, width: w, height: h }
}

export function openCaptureBox(): void {
  if (win && !win.isDestroyed()) {
    sendInit()
    win.show()
    win.focus()
    return
  }

  ready = false
  const b = defaultBounds()

  win = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT + CONTROL_BAR_HEIGHT,
    skipTaskbar: true,
    hasShadow: true,
    backgroundColor: '#00000000',
    title: '1초캡처 - 창 캡처 박스',
    webPreferences: {
      preload: path.join(__dirname, '../preload/captureBox.js'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // 사용자가 OS native resize handle로 크기 변경 시 마지막 크기 저장
  let resizeTimer: NodeJS.Timeout | null = null
  win.on('resize', () => {
    if (!win || win.isDestroyed()) return
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      if (!win || win.isDestroyed()) return
      const [w, h] = win.getSize()
      // 캡처 영역 = window 내부에서 컨트롤바 제외한 부분
      const boxW = w
      const boxH = Math.max(MIN_HEIGHT, h - CONTROL_BAR_HEIGHT)
      const settings = getSettings()
      setSettings({
        captureBox: {
          ...settings.captureBox,
          lastSize: { width: boxW, height: boxH }
        }
      })
      // renderer에도 알려서 사이즈 라벨 갱신
      try {
        win.webContents.send(IPC.CAPTURE_BOX_SIZE_CHANGED, {
          width: boxW,
          height: boxH
        })
      } catch {
        /* ignore */
      }
    }, 200)
  })

  win.webContents.once('did-finish-load', () => {
    ready = true
    sendInit()
    if (win && !win.isDestroyed()) {
      win.show()
      win.focus()
    }
  })

  win.on('closed', () => {
    win = null
    ready = false
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/captureBox/index.html`)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/captureBox/index.html'))
  }
}

function sendInit(): void {
  if (!win || win.isDestroyed() || !ready) return
  const settings = getSettings()
  const [w, h] = win.getSize()
  win.webContents.send(IPC.CAPTURE_BOX_INIT, {
    width: w,
    height: Math.max(MIN_HEIGHT, h - CONTROL_BAR_HEIGHT),
    presets: settings.captureBox?.presets ?? []
  })
}

export function closeCaptureBox(): void {
  if (win && !win.isDestroyed()) win.destroy()
  win = null
  ready = false
}

export function resizeCaptureBox(width: number, height: number): void {
  if (!win || win.isDestroyed()) return
  const w = Math.max(MIN_WIDTH, Math.round(width))
  const h = Math.max(MIN_HEIGHT, Math.round(height))
  // 컨트롤바 높이 더해서 실제 창 크기로
  win.setSize(w, h + CONTROL_BAR_HEIGHT)
  // 마지막 크기 저장
  const settings = getSettings()
  setSettings({
    captureBox: {
      ...settings.captureBox,
      lastSize: { width: w, height: h }
    }
  })
}

/**
 * 박스 안 영역을 캡처. 컨트롤바 부분은 제외.
 * 박스 자체가 캡처에 찍히지 않도록 hide 후 짧게 대기.
 */
export async function shootCaptureBox(): Promise<void> {
  if (!win || win.isDestroyed()) return
  const bounds = win.getBounds()
  // 컨트롤바 아래의 box 영역만 캡처 대상
  const captureRect = {
    x: bounds.x,
    y: bounds.y + CONTROL_BAR_HEIGHT,
    width: bounds.width,
    height: bounds.height - CONTROL_BAR_HEIGHT
  }
  if (captureRect.width < 10 || captureRect.height < 10) return

  // 마지막 크기 저장
  const settings = getSettings()
  setSettings({
    captureBox: {
      ...settings.captureBox,
      lastSize: { width: captureRect.width, height: captureRect.height }
    }
  })

  // 박스 자체 + 툴바 hide
  hideToolbarForCapture()
  win.hide()
  await new Promise((r) => setTimeout(r, process.platform === 'win32' ? 120 : 80))

  // Windows DPI 보정 (v0.7.9 dipToScreenRect 패턴)
  let physRect = captureRect
  if (process.platform === 'win32') {
    try {
      physRect = screen.dipToScreenRect(null, captureRect)
    } catch (e) {
      console.warn('[captureBox] dipToScreenRect 실패, DIP 그대로:', e)
    }
  }

  try {
    const result = await captureRegion(
      physRect.x,
      physRect.y,
      physRect.width,
      physRect.height
    )
    await openEditorWithImage(result)
  } catch (e) {
    console.error('[captureBox] capture 실패:', e)
    try {
      const { Notification } = await import('electron')
      new Notification({
        title: '1초캡처 — 캡처 실패',
        body: (e as Error)?.message ?? '알 수 없는 오류'
      }).show()
    } catch {
      /* ignore */
    }
  } finally {
    restoreToolbarAfterCapture()
    // 박스는 다음 사용을 위해 일단 닫음 (사용자가 다시 단축키로 호출하면 마지막 크기로 복원됨)
    closeCaptureBox()
  }
}
