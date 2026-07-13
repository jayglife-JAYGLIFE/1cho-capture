import type { AppSettings, CaptureResult, RegionSelection } from './types'

export interface OverlayBridge {
  onInit: (
    cb: (data: {
      displayId: number
      bounds: { x: number; y: number; width: number; height: number }
      scaleFactor: number
      /**
       * v0.9.0: 스냅샷 캡처 모드에서 이 디스플레이의 프리캡처 이미지 URL.
       * 존재하면 오버레이는 이 이미지를 배경으로 표시하고, 드래그 완료 시엔 이 이미지를
       * crop 해서 결과를 만든다 (실제 화면은 다시 캡처하지 않음).
       */
      backgroundUrl?: string
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
  /**
   * v0.7.8: 다른 이름으로 저장 — 파일 선택 다이얼로그 띄움 후 사용자가 고른 경로에 저장.
   * 편집 없이 originalFilePath 만 있을 때는 그 파일을 그대로 복사 (무손실).
   * 편집 있을 때는 dataUrl을 사용. 확장자에 따라 PNG/JPG 자동 결정.
   * 사용자가 취소하면 null 반환.
   */
  saveAs?: (payload: {
    dataUrl?: string
    originalFilePath?: string
  }) => Promise<string | null>
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

// v0.8.0: 창 캡처 박스 브리지
import type { CaptureBoxPreset } from './types'

export interface CaptureBoxInitData {
  width: number
  height: number
  presets: CaptureBoxPreset[]
}

export interface CaptureBoxBridge {
  onInit: (cb: (data: CaptureBoxInitData) => void) => void
  /** 사용자가 native resize handle로 크기 바꿀 때 main → renderer */
  onSizeChanged: (cb: (data: { width: number; height: number }) => void) => void
  /** 박스 안의 화면 영역을 캡처 → 편집기 오픈 */
  shoot: () => Promise<void>
  /** 박스 닫기 */
  close: () => Promise<void>
  /** 사용자가 입력으로 크기 변경 시 main에 새 크기 전달 */
  resize: (width: number, height: number) => Promise<void>
  /** 프리셋 가져오기 */
  getPresets: () => Promise<CaptureBoxPreset[]>
  /** 프리셋 저장 (전체 배열 교체) */
  setPresets: (presets: CaptureBoxPreset[]) => Promise<void>
  /** v0.8.5: JS 기반 창 이동 (WebkitAppRegion drag는 dblclick과 충돌함) */
  startDrag: (mouseScreenX: number, mouseScreenY: number) => Promise<void>
  dragMove: (mouseScreenX: number, mouseScreenY: number) => Promise<void>
  dragEnd: () => Promise<void>
}
