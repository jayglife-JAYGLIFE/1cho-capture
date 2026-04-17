import { Tray, Menu, nativeImage, app } from 'electron'
import path from 'node:path'
import { openRegionOverlay } from './windows/overlay'
import { captureFullScreen } from './capture'
import { openEditorWithImage } from './windows/editor'
import { openSettingsWindow } from './windows/settings'
import { startScrollCapture } from './capture/scroll'
import { openSaveFolder } from './ipc'

let tray: Tray | null = null

export function createTray(): Tray {
  const iconPath = path.join(__dirname, '../../resources/tray-icon.png')
  let icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) {
    // fallback: generated 1x1 transparent so app still runs
    icon = nativeImage.createEmpty()
  }
  if (process.platform === 'darwin') icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.setToolTip('1초캡처')
  rebuildMenu()
  return tray
}

export function rebuildMenu(): void {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
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
      click: () => openRegionOverlay() // MVP: 창 picker는 차후 추가
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
  ])
  tray.setContextMenu(menu)
}
