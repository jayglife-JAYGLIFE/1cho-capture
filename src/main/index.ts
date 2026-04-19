import { app, BrowserWindow } from 'electron'
import { createTray, rebuildMenu, setHotkeyFailureBadge } from './tray'
import { registerHotkeys, unregisterAllHotkeys } from './hotkey'
import { registerIpcHandlers } from './ipc'
import { getSettings } from './store'
import { prewarmOverlayWindows } from './windows/overlay'
import { prewarmEditorWindow, destroyEditorWindow } from './windows/editor'
import {
  createToolbarWindow,
  destroyToolbarWindow,
  showToolbar
} from './windows/toolbar'
import { setupAutoUpdater } from './updater'
import { cleanupTempCaptures } from './capture'
import { prewarmPowerShell, destroyPowerShell } from './capture/win'
import { applyAutoStart } from './autostart'
import { promises as fs } from 'node:fs'

// Single instance
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

// 이미 앱이 실행 중인 상태에서 데스크톱 아이콘이 또 클릭되면 → 툴바 팝업
app.on('second-instance', () => {
  showToolbar()
  rebuildMenu()
})

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

  // v0.6.0: 이전 실행에서 남은 임시 캡처 파일 정리
  cleanupTempCaptures()

  // v0.6.0: Windows에서 PowerShell 세션 프리워밍
  if (process.platform === 'win32') {
    prewarmPowerShell()
  }

  registerIpcHandlers()
  createTray()

  // 단축키 등록 결과를 받아서 실패 시 트레이에 배지 표시 (v0.3.0)
  const { failed } = registerHotkeys(getSettings().hotkeys)
  setHotkeyFailureBadge(failed)

  // v0.3.0: 창 예열 — 앱 시작 시 숨김 상태로 미리 생성해서 첫 캡처 지연 제거.
  prewarmOverlayWindows()
  prewarmEditorWindow()

  // v0.4.0: 플로팅 툴바. 설정에서 showOnStartup=false면 숨김 상태로만 생성.
  const showToolbarOnStartup = getSettings().toolbar?.showOnStartup ?? true
  createToolbarWindow(showToolbarOnStartup)
  // 툴바 보이기/숨기기 상태 반영
  setTimeout(rebuildMenu, 100)

  // v0.5.0: 자동 업데이트 (백그라운드 다운로드 + 다음 종료 시 적용)
  setupAutoUpdater()

  // v0.6.2: 사용자 설정에 따라 OS 로그인 자동 시작 반영
  applyAutoStart(getSettings().autoStart)

  app.on('activate', () => {
    // macOS 도크 숨겨져 있지만 혹시 재활성화되면 툴바 보이기
    showToolbar()
    if (BrowserWindow.getAllWindows().length === 0) {
      // no-op
    }
  })
})

app.on('window-all-closed', () => {
  // Keep app running in background (tray-only)
})

app.on('before-quit', () => {
  // close preventDefault 걸려있는 창들 종료 전에 명시 해제
  destroyEditorWindow()
  destroyToolbarWindow()
  // v0.6.0: PowerShell 세션 정리
  if (process.platform === 'win32') destroyPowerShell()
})

app.on('will-quit', () => {
  unregisterAllHotkeys()
})
