import type { AppSettings, CaptureResult, RegionSelection } from './types'

export interface OverlayBridge {
  onInit: (
    cb: (data: {
      displayId: number
      bounds: { x: number; y: number; width: number; height: number }
      scaleFactor: number
    }) => void
  ) => void
  submit: (sel: RegionSelection) => Promise<void>
  cancel: () => Promise<void>
}

export interface EditorBridge {
  onInit: (cb: (data: CaptureResult) => void) => void
  save: (dataUrl: string, format?: 'png' | 'jpg') => Promise<string>
  copy: (dataUrl: string) => Promise<void>
  close: () => Promise<void>
  /** v0.6.0+: renderer가 이미지 로드 완료 후 호출 → main이 창을 show */
  readyToShow?: () => void
  /**
   * v0.6.3: 캡처 임시 파일을 Buffer로 읽어 Blob URL 생성용.
   * file:// URL은 CSP/same-origin 이슈가 있어 IPC Buffer → Blob 변환으로 교체.
   */
  loadImageBuffer?: (filePath: string) => Promise<Uint8Array>
  /** v0.7.6: 편집 없을 때 원본 PNG 파일을 그대로 결과 폴더로 복사 (무손실) */
  saveOriginal?: (originalFilePath: string, format?: 'png' | 'jpg') => Promise<string>
  /** v0.7.6: 편집 없을 때 원본 PNG 파일을 클립보드에 직접 적재 (무손실) */
  copyOriginal?: (originalFilePath: string) => Promise<void>
}

export interface SettingsBridge {
  onInit: (cb: (data: AppSettings) => void) => void
  get: () => Promise<AppSettings>
  set: (patch: Partial<AppSettings>) => Promise<AppSettings>
  pickFolder: () => Promise<string | null>
  /** v0.6.1+: 설정 창 하단에 버전을 표시하기 위한 앱 버전 조회 */
  getVersion: () => Promise<string>
}

export type ToolbarCaptureMode = 'region' | 'fullscreen' | 'window' | 'scroll'

export interface ToolbarBridge {
  capture: (mode: ToolbarCaptureMode) => Promise<void>
  hide: () => Promise<void>
  settings: () => Promise<void>
  savePosition: (pos: { x: number; y: number }) => Promise<void>
}

export interface ScrollControllerStatus {
  frameCount: number
  isCapturing: boolean
}

export interface ScrollControllerBridge {
  onStatus: (cb: (s: ScrollControllerStatus) => void) => void
  finish: () => Promise<void>
  cancel: () => Promise<void>
}
