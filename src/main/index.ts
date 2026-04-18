import { app, BrowserWindow } from 'electron'
import { createTray, setHotkeyFailureBadge } from './tray'
import { registerHotkeys, unregisterAllHotkeys } from './hotkey'
import { registerIpcHandlers } from './ipc'
import { getSettings } from './store'
import { prewarmOverlayWindows } from './windows/overlay'
import { prewarmEditorWindow, destroyEditorWindow } from './windows/editor'
import { promises as fs } from 'node:fs'

// Single instance
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

// Hide dock icon on Mac; tray-only app
if (process.platform === 'darwin') {
  app.dock?.hide()
}

app.whenReady().then(async () => {
  // Ensure save folder exists
  try {
    await fs.mkdir(getSettings().saveFolder, { recursive: true })
  } catch {
    // ignore
  }

  registerIpcHandlers()
  createTray()

  // 단축키 등록 결과를 받아서 실패 시 트레이에 배지 표시 (v0.3.0)
  const { failed } = registerHotkeys(getSettings().hotkeys)
  setHotkeyFailureBadge(failed)

  // v0.3.0: 창 예열 — 앱 시작 시 숨김 상태로 미리 생성해서 첫 캡처 지연 제거.
  // 약간의 메모리 비용(~150MB)으로 수백 ms 지연을 없앰.
  prewarmOverlayWindows()
  prewarmEditorWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // no-op
    }
  })
})

app.on('window-all-closed', () => {
  // Keep app running in background (tray-only)
})

app.on('before-quit', () => {
  // 편집기 창이 close preventDefault 걸려있으므로 종료 전에 명시 해제
  destroyEditorWindow()
})

app.on('will-quit', () => {
  unregisterAllHotkeys()
})
