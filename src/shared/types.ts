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
