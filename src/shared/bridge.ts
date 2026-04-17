import type { AppSettings, CaptureResult, RegionSelection } from './types'

export interface OverlayBridge {
  onInit: (
    cb: (data: {
      displayId: number
      bounds: { x: number; y: number; width: number; height: number }
      scaleFactor: number
      backgroundDataUrl: string
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
}

export interface SettingsBridge {
  onInit: (cb: (data: AppSettings) => void) => void
  get: () => Promise<AppSettings>
  set: (patch: Partial<AppSettings>) => Promise<AppSettings>
  pickFolder: () => Promise<string | null>
}
