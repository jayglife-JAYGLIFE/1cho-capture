import { app, Notification } from 'electron'
import pkg from 'electron-updater'

const { autoUpdater } = pkg

/**
 * v0.5.0 자동 업데이트.
 *
 * 동작:
 * - 앱 실행 3초 후 GitHub Releases 체크
 * - 새 버전 있으면 백그라운드에서 조용히 다운로드
 * - 다운로드 완료 → 작은 데스크톱 알림: "새 버전 준비됨, 종료 시 적용"
 * - 사용자가 다음에 앱을 종료할 때 자동으로 설치됨
 * - 이후 6시간마다 재확인 (장시간 실행 유저 대응)
 *
 * 수동 확인:
 * - 트레이 메뉴 '업데이트 확인…' 에서 checkForUpdates() 직접 호출
 */

let lastDownloadedVersion: string | null = null
let listenersInitialized = false

export function getLastDownloadedVersion(): string | null {
  return lastDownloadedVersion
}

export function setupAutoUpdater(): void {
  // 패키징된 앱에서만 동작 (dev 모드에선 no-op)
  if (!app.isPackaged) {
    console.log('[updater] dev 모드 — 자동 업데이트 비활성화')
    return
  }

  if (!listenersInitialized) {
    autoUpdater.autoDownload = true // 발견 즉시 백그라운드 다운로드
    autoUpdater.autoInstallOnAppQuit = true // 종료 시 설치
    autoUpdater.allowPrerelease = false
    autoUpdater.logger = {
      info: (...a: unknown[]) => console.log('[updater]', ...a),
      warn: (...a: unknown[]) => console.warn('[updater]', ...a),
      error: (...a: unknown[]) => console.error('[updater]', ...a),
      debug: () => undefined
    }

    autoUpdater.on('checking-for-update', () => {
      console.log('[updater] 업데이트 확인 중…')
    })

    autoUpdater.on('update-available', (info: { version?: string }) => {
      console.log('[updater] 새 버전 발견:', info.version)
    })

    autoUpdater.on('update-not-available', () => {
      console.log('[updater] 최신 버전 사용 중')
    })

    autoUpdater.on('download-progress', (p: { percent: number }) => {
      console.log(`[updater] 다운로드 ${p.percent.toFixed(0)}%`)
    })

    autoUpdater.on('update-downloaded', async (info: { version?: string }) => {
      lastDownloadedVersion = info.version ?? null
      console.log('[updater] 다운로드 완료 → 다음 종료 시 적용:', info.version)
      notifyUserUpdateReady(info.version ?? '')
      // 트레이 메뉴에 "v0.x.y 설치하고 재시작" 항목이 뜨도록 갱신
      try {
        const tray = await import('./tray')
        tray.rebuildMenu()
      } catch {
        /* ignore */
      }
    })

    autoUpdater.on('error', (err: Error) => {
      console.error('[updater] 오류:', err.message)
    })

    listenersInitialized = true
  }

  // 시작 직후 한 번 확인 (다른 초기화 작업과 경합 피하려고 3초 지연)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e: Error) => {
      console.error('[updater] checkForUpdates 실패:', e.message)
    })
  }, 3000)

  // 장시간 실행 대비 6시간마다 재확인
  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch((e: Error) => {
        console.error('[updater] checkForUpdates 실패:', e.message)
      })
    },
    6 * 60 * 60 * 1000
  )
}

function notifyUserUpdateReady(version: string): void {
  try {
    if (Notification.isSupported()) {
      const n = new Notification({
        title: '1초캡처 업데이트 준비 완료 🎉',
        body: version
          ? `v${version} 이 다운로드됐어요. 앱을 종료했다가 다시 켜면 자동으로 적용됩니다.`
          : '새 버전이 다운로드됐어요. 앱을 종료했다가 다시 켜면 자동 적용됩니다.'
      })
      n.show()
    }
  } catch (e) {
    console.warn('[updater] 알림 표시 실패:', e)
  }
}

/** 트레이 메뉴에서 수동 호출. */
export async function checkForUpdatesManually(): Promise<void> {
  if (!app.isPackaged) {
    new Notification({
      title: '1초캡처',
      body: '개발 모드에선 업데이트 확인이 비활성화돼요.'
    }).show()
    return
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result) return
    const info = result.updateInfo
    if (info && info.version === app.getVersion()) {
      new Notification({
        title: '1초캡처',
        body: `이미 최신 버전이에요 (v${app.getVersion()}).`
      }).show()
    }
  } catch (e) {
    console.error('[updater] manual check 실패:', e)
    new Notification({
      title: '1초캡처 업데이트 확인 실패',
      body: '네트워크를 확인해주세요.'
    }).show()
  }
}

/** 이미 다운로드된 업데이트가 있으면 지금 즉시 종료→재시작 설치. */
export function quitAndInstallIfReady(): boolean {
  if (lastDownloadedVersion) {
    autoUpdater.quitAndInstall(false, true)
    return true
  }
  return false
}
