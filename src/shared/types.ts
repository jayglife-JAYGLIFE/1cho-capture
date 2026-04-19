export type CaptureMode = 'region' | 'fullscreen' | 'window' | 'scroll'

export type AfterCaptureAction = 'editor' | 'save' | 'clipboard'

export interface HotkeyConfig {
  region: string
  fullscreen: string
  window: string
  scroll: string
  repeat: string
}

export interface AppSettings {
  hotkeys: HotkeyConfig
  saveFolder: string
  afterCapture: AfterCaptureAction
  fileFormat: 'png' | 'jpg'
  filenamePattern: string
  toolbar: ToolbarSettings
}

export interface ToolbarSettings {
  /** 앱 시작 시 툴바를 자동으로 표시할지 */
  showOnStartup: boolean
  /** 마지막 툴바 위치 (없으면 화면 상단 중앙) */
  position?: { x: number; y: number }
}

export interface DisplayInfo {
  id: number
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
}

export interface RegionSelection {
  displayId: number
  x: number
  y: number
  width: number
  height: number
}

export interface CaptureResult {
  /** base64 data URL of PNG */
  dataUrl: string
  width: number
  height: number
  displayId?: number
  /** for scroll capture, the source bounds */
  sourceBounds?: { x: number; y: number; width: number; height: number }
}

export interface WindowSource {
  id: string
  name: string
  thumbnail: string // data URL
}
