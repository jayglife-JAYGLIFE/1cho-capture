import { app } from 'electron'

/**
 * v0.6.2: OS 로그인 시 자동 실행 on/off 관리.
 *
 * Windows: 레지스트리 HKCU\Software\Microsoft\Windows\CurrentVersion\Run 에 앱 등록
 * macOS : 로그인 항목(Login Items) 에 앱 등록
 *
 * Electron의 `app.setLoginItemSettings` 한 줄로 양 OS 모두 처리된다.
 * 중요: dev 모드(`npm run dev`)에선 electron 바이너리 자체가 등록되어버리므로 skip.
 */

export function isAutoStartSupported(): boolean {
  // Linux/다른 플랫폼은 지원 X
  return process.platform === 'darwin' || process.platform === 'win32'
}

export function isAutoStartEnabled(): boolean {
  if (!app.isPackaged || !isAutoStartSupported()) return false
  try {
    const settings = app.getLoginItemSettings()
    return settings.openAtLogin
  } catch {
    return false
  }
}

export function setAutoStart(enabled: boolean): void {
  if (!app.isPackaged || !isAutoStartSupported()) return
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      // macOS: 자동 시작 시 도크 아이콘/창 없이 트레이에만 상주
      openAsHidden: true,
      // Windows: 앱 실행 경로는 Electron이 자동으로 결정 (packaged exe)
      args: ['--autostart']
    })
  } catch (e) {
    console.warn('[autostart] setLoginItemSettings 실패:', e)
  }
}

/** 사용자가 설정한 원하는 상태와 현재 OS 등록 상태가 다르면 맞춘다. */
export function applyAutoStart(desired: boolean): void {
  if (!app.isPackaged || !isAutoStartSupported()) return
  if (isAutoStartEnabled() !== desired) setAutoStart(desired)
}
