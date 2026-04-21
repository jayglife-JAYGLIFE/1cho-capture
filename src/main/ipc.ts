import { app, ipcMain, dialog, clipboard, nativeImage, shell, BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { IPC } from '../shared/constants'
import type { AppSettings, RegionSelection } from '../shared/types'
import type { ToolbarCaptureMode } from '../shared/bridge'
import { getSettings, setSettings } from './store'
import { captureFullScreen, listWindowSources, captureWindowBySourceId } from './capture'
import {
  handleOverlaySelection,
  cancelRegionOverlay,
  openRegionOverlay
} from './windows/overlay'
import { openEditorWithImage, closeEditor } from './windows/editor'
import { openSettingsWindow } from './windows/settings'
import {
  hideToolbar,
  hideToolbarForCapture,
  restoreToolbarAfterCapture
} from './windows/toolbar'
import {
  startScrollCapture,
  addScrollFrame,
  finishScrollCapture,
  cancelScrollCapture
} from './capture/scroll'

export function registerIpcHandlers(): void {
  // ---------- Overlay ----------
  ipcMain.handle(IPC.OVERLAY_SELECT, async (_, sel: RegionSelection) => {
    await handleOverlaySelection(sel)
  })
  ipcMain.handle(IPC.OVERLAY_CANCEL, () => {
    cancelRegionOverlay()
  })

  // ---------- Editor ----------
  ipcMain.handle(
    IPC.EDITOR_SAVE,
    async (_, payload: { dataUrl: string; format?: 'png' | 'jpg' }) => {
      const settings = getSettings()
      const format = payload.format ?? settings.fileFormat
      const filename = buildFilename(settings, format)
      try {
        await fs.mkdir(settings.saveFolder, { recursive: true })
        const full = path.join(settings.saveFolder, filename)
        const buf = dataUrlToBuffer(payload.dataUrl)
        await fs.writeFile(full, buf)
        console.log('[editor] 저장 성공:', full)
        return full
      } catch (e) {
        const msg = (e as Error)?.message ?? String(e)
        console.error('[editor] 저장 실패:', msg, 'folder:', settings.saveFolder)
        // 저장 실패 시 사용자 알림
        try {
          const { Notification } = await import('electron')
          new Notification({
            title: '1초캡처 — 저장 실패',
            body: `파일을 저장할 수 없어요.\n저장 경로: ${settings.saveFolder}\n오류: ${msg}`
          }).show()
        } catch {
          /* ignore */
        }
        throw e
      }
    }
  )

  ipcMain.handle(IPC.EDITOR_COPY, async (_, dataUrl: string) => {
    const img = nativeImage.createFromDataURL(dataUrl)
    clipboard.writeImage(img)
  })

  ipcMain.handle(IPC.EDITOR_CLOSE, () => {
    closeEditor()
  })

  // v0.6.3: renderer에서 CSP/same-origin 회피용으로 이미지 버퍼를 IPC로 읽어감
  ipcMain.handle(IPC.EDITOR_LOAD_IMAGE, async (_, filePath: string) => {
    try {
      return await fs.readFile(filePath)
    } catch (e) {
      console.error('[ipc] EDITOR_LOAD_IMAGE 실패:', filePath, e)
      return new Uint8Array()
    }
  })

  // ---------- Settings ----------
  ipcMain.handle(IPC.SETTINGS_GET, () => getSettings())

  ipcMain.handle(IPC.SETTINGS_SET, async (_, patch: Partial<AppSettings>) => {
    const next = setSettings(patch)
    // 단축키 변경 시 재등록 + 트레이 경고 업데이트
    if (patch.hotkeys) {
      const [{ registerHotkeys }, { setHotkeyFailureBadge }] = await Promise.all([
        import('./hotkey'),
        import('./tray')
      ])
      const { failed } = registerHotkeys(next.hotkeys)
      setHotkeyFailureBadge(failed)
    }
    // v0.6.2: 자동 시작 on/off 변경 시 OS 등록 상태 반영
    if (patch.autoStart !== undefined) {
      const { applyAutoStart } = await import('./autostart')
      applyAutoStart(next.autoStart)
    }
    return next
  })

  ipcMain.handle(IPC.SETTINGS_GET_VERSION, () => app.getVersion())

  ipcMain.handle(IPC.SETTINGS_PICK_FOLDER, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const res = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  // ---------- Capture entry points (from tray) ----------
  ipcMain.handle(IPC.CAPTURE_REGION, () => openRegionOverlay())
  ipcMain.handle(IPC.CAPTURE_FULLSCREEN, async () => {
    const r = await captureFullScreen()
    await openEditorWithImage(r)
  })
  ipcMain.handle(IPC.CAPTURE_LIST_WINDOWS, async () => listWindowSources())
  ipcMain.handle(IPC.CAPTURE_WINDOW, async (_, sourceId: string) => {
    const r = await captureWindowBySourceId(sourceId)
    if (r) await openEditorWithImage(r)
  })

  // ---------- Scroll capture ----------
  ipcMain.handle(IPC.CAPTURE_SCROLL, () => startScrollCapture())
  ipcMain.handle(IPC.SCROLL_ADD_FRAME, () => addScrollFrame())
  ipcMain.handle(IPC.SCROLL_DONE, () => finishScrollCapture())
  ipcMain.handle(IPC.SCROLL_CANCEL, () => cancelScrollCapture())

  // ---------- Toolbar (v0.4.0) ----------
  ipcMain.handle(IPC.TOOLBAR_CAPTURE, async (_, mode: ToolbarCaptureMode) => {
    // 툴바 자체가 스크린샷에 찍히지 않게 숨긴 후 캡처 실행
    hideToolbarForCapture()
    try {
      if (mode === 'region' || mode === 'window') {
        // 창 캡처는 MVP에서 영역 캡처로 폴백
        await openRegionOverlay()
      } else if (mode === 'fullscreen') {
        const r = await captureFullScreen()
        await openEditorWithImage(r)
        restoreToolbarAfterCapture()
      } else if (mode === 'scroll') {
        await startScrollCapture()
      }
    } catch (e) {
      console.error('[toolbar capture]', e)
      restoreToolbarAfterCapture()
    }
  })

  ipcMain.handle(IPC.TOOLBAR_HIDE, () => hideToolbar())
  ipcMain.handle(IPC.TOOLBAR_SETTINGS, () => openSettingsWindow())
  // 위치 저장은 main의 'move' 이벤트에서 이미 처리. 여기선 혹시라도 명시적 저장 요청 대응.
  ipcMain.handle(IPC.TOOLBAR_SAVE_POSITION, (_, pos: { x: number; y: number }) => {
    const current = getSettings()
    setSettings({ toolbar: { ...current.toolbar, position: pos } })
  })
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl)
  if (!m) throw new Error('Invalid data URL')
  return Buffer.from(m[2], 'base64')
}

function buildFilename(settings: AppSettings, format: 'png' | 'jpg'): string {
  const d = new Date()
  const pad = (n: number, w = 2): string => n.toString().padStart(w, '0')
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    MM: pad(d.getMonth() + 1),
    DD: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds())
  }
  const base = settings.filenamePattern.replace(/{(YYYY|MM|DD|HH|mm|ss)}/g, (_, k) => map[k])
  return `${base}.${format}`
}

export function openSaveFolder(): void {
  const settings = getSettings()
  shell.openPath(settings.saveFolder).catch(() => undefined)
}
