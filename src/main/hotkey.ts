import { globalShortcut } from 'electron'
import type { HotkeyConfig } from '../shared/types'
import { captureFullScreen } from './capture'
import { openEditorWithImage, getLastCapture } from './windows/editor'
import { openRegionOverlay } from './windows/overlay'
import {
  openCaptureBox,
  isCaptureBoxOpen,
  shootCaptureBox
} from './windows/captureBox'
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
    // v0.8.6: 토글 동작
    // - 박스 안 떠있을 때: 박스 열기 (마지막 위치/크기 복원)
    // - 박스 떠있을 때: 그 영역을 캡처 (박스 클릭 안 하므로 펼쳐진 메뉴 유지됨)
    if (isCaptureBoxOpen()) {
      shootCaptureBox()
    } else {
      openCaptureBox()
    }
  })
  // v0.9.5: 스크롤 캡처는 Windows 전용 — Mac 은 단축키 자체를 등록하지 않음
  if (process.platform === 'win32') {
    tryRegister(cfg.scroll, () => startScrollCapture())
  }
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
