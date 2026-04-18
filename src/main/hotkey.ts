import { globalShortcut } from 'electron'
import type { HotkeyConfig } from '../shared/types'
import { captureFullScreen } from './capture'
import { openEditorWithImage, getLastCapture } from './windows/editor'
import { openRegionOverlay } from './windows/overlay'
import { startScrollCapture } from './capture/scroll'

/**
 * 단축키 등록 결과. `failed`는 다른 앱과 충돌해서 등록되지 못한 단축키 문자열 배열.
 * 트레이 UI에서 경고 표시에 활용.
 */
export interface RegisterResult {
  failed: string[]
}

export function registerHotkeys(cfg: HotkeyConfig): RegisterResult {
  globalShortcut.unregisterAll()

  const failed: string[] = []
  const tryRegister = (accelerator: string, handler: () => void | Promise<void>): void => {
    if (!accelerator) return // 의도적 비활성화
    if (!safeRegister(accelerator, handler)) failed.push(accelerator)
  }

  tryRegister(cfg.region, () => openRegionOverlay())
  tryRegister(cfg.fullscreen, async () => {
    const r = await captureFullScreen()
    await openEditorWithImage(r)
  })
  tryRegister(cfg.window, () => {
    // MVP: 창 picker는 차후 구현. 임시로 영역 캡처로 폴백.
    openRegionOverlay()
  })
  tryRegister(cfg.scroll, () => startScrollCapture())
  tryRegister(cfg.repeat, async () => {
    const last = getLastCapture()
    if (last) await openEditorWithImage(last)
  })

  if (failed.length > 0) {
    console.warn('[hotkey] 등록 실패:', failed.join(', '), '(다른 앱과 충돌)')
  }
  return { failed }
}

function safeRegister(accelerator: string, handler: () => void | Promise<void>): boolean {
  try {
    return globalShortcut.register(accelerator, () => {
      Promise.resolve(handler()).catch((err) => console.error('[hotkey handler]', err))
    })
  } catch (e) {
    console.error('[hotkey register]', accelerator, e)
    return false
  }
}

export function unregisterAllHotkeys(): void {
  globalShortcut.unregisterAll()
}
