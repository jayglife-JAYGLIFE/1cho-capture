import { Tray, Menu, MenuItemConstructorOptions, nativeImage, app } from 'electron'
import path from 'node:path'
import { openRegionOverlay } from './windows/overlay'
import { captureFullScreen } from './capture'
import { openEditorWithImage } from './windows/editor'
import { openSettingsWindow } from './windows/settings'
import { startScrollCapture } from './capture/scroll'
import { openSaveFolder } from './ipc'

let tray: Tray | null = null
let hotkeyFailures: string[] = []

export function createTray(): Tray {
  const iconPath = path.join(__dirname, '../../resources/tray-icon.png')
  let icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) {
    icon = nativeImage.createEmpty()
  }
  if (process.platform === 'darwin') icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.setToolTip('1초캡처')
  rebuildMenu()
  return tray
}

/** 단축키 등록 실패 목록을 받아 UI에 경고 표시. 빈 배열이면 경고 해제. */
export function setHotkeyFailureBadge(failed: string[]): void {
  hotkeyFailures = failed
  if (tray) {
    if (failed.length > 0) {
      tray.setToolTip(
        `1초캡처 - ⚠️ 단축키 충돌: ${failed.join(', ')}\n(설정에서 변경하세요)`
      )
    } else {
      tray.setToolTip('1초캡처')
    }
  }
  rebuildMenu()
}

export function rebuildMenu(): void {
  if (!tray) return

  const items: MenuItemConstructorOptions[] = []

  // 단축키 충돌 경고 배너
  if (hotkeyFailures.length > 0) {
    items.push({
      label: `⚠️ 단축키 충돌: ${hotkeyFailures.join(', ')}`,
      enabled: false
    })
    items.push({
      label: '→ 설정에서 다른 키로 변경하세요',
      click: () => openSettingsWindow()
    })
    items.push({ type: 'separator' })
  }

  items.push(
    {
      label: '영역 캡처 (직접 지정)',
      accelerator: 'Ctrl+Shift+C',
      click: () => openRegionOverlay()
    },
    {
      label: '전체 화면 캡처',
      accelerator: 'Ctrl+Shift+Z',
      click: async () => {
        const r = await captureFullScreen()
        await openEditorWithImage(r)
      }
    },
    {
      label: '창 캡처',
      accelerator: 'Ctrl+Shift+X',
      click: () => openRegionOverlay()
    },
    {
      label: '스크롤 캡처',
      accelerator: 'Ctrl+Shift+V',
      click: () => startScrollCapture()
    },
    { type: 'separator' },
    { label: '저장 폴더 열기', click: () => openSaveFolder() },
    { label: '설정…', click: () => openSettingsWindow() },
    { type: 'separator' },
    { label: '종료', role: 'quit', click: () => app.quit() }
  )

  tray.setContextMenu(Menu.buildFromTemplate(items))
}
