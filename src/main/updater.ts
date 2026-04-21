import { app, Notification, dialog } from 'electron'
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
      // 트레이 메뉴에 "v0.x.y 설치하고 재시작" 항목이 뜨도록 먼저 갱신
      try {
        const tray = await import('./tray')
        tray.rebuildMenu()
      } catch {
        /* ignore */
      }
      // v0.6.4: 알림 대신 '재시작 체크박스 + 마침' 다이얼로그 표시
      await promptInstallUpdate(info.version ?? '')
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

/**
 * v0.6.4: 업데이트 다운로드 완료 시 설치 마법사의 '마침' 화면처럼
 * 체크박스 + 마침 버튼 조합의 다이얼로그를 띄워 즉시 재시작을 유도.
 *
 * - "마침" 버튼 + "지금 재시작" 체크박스(기본 ON) → autoUpdater.quitAndInstall
 * - "나중에" 또는 체크박스 해제 후 마침 → 다이얼로그만 닫음 (다음 종료 시 자동 적용)
 */
async function promptInstallUpdate(version: string): Promise<void> {
  try {
    const versionLabel = version ? `v${version}` : '새 버전'
    const result = await dialog.showMessageBox({
      type: 'info',
      title: '1초캡처 업데이트 준비 완료',
      message: `🎉 1초캡처 ${versionLabel} 업데이트가 준비됐어요!`,
      detail:
        '아래 체크박스를 그대로 두고 "마침"을 누르면 바로 재시작되면서 최신 버전으로 사용할 수 있어요.\n\n체크를 해제하면 지금은 닫히고, 다음에 앱을 종료했다가 다시 켤 때 자동 적용됩니다.',
      buttons: ['마침', '나중에'],
      defaultId: 0,
      cancelId: 1,
      checkboxLabel: '지금 재시작하고 업데이트 적용',
      checkboxChecked: true,
      noLink: true
    })

    // "마침" + 체크 상태 → 즉시 재시작
    if (result.response === 0 && result.checkboxChecked) {
      // isSilent=false, isForceRunAfter=true → 설치 후 자동으로 앱 재실행
      autoUpdater.quitAndInstall(false, true)
    } else {
      // 다이얼로그는 닫혔지만 autoInstallOnAppQuit=true라서 나중에 종료 시 적용됨
      // 동시에 토스트 알림으로 한 번 더 안내
      notifyUserUpdateReady(version)
    }
  } catch (e) {
    console.warn('[updater] 설치 안내 다이얼로그 실패, 알림으로 대체:', e)
    notifyUserUpdateReady(version)
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
