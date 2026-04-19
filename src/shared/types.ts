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
  /** v0.6.2: OS 시작 시 자동 실행 여부 (기본 true) */
  autoStart: boolean
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
  /**
   * v0.6.0+: 임시 파일 경로. base64 data URL 대신 main에서 임시 파일로 저장한 후
   * 경로만 전달해 IPC 직렬화 비용과 base64 인코딩/디코딩 비용을 제거한다.
   * renderer는 file:// URL로 직접 로드.
   */
  filePath?: string
  /** 하위 호환: data URL (예: 편집 결과 반환 시) */
  dataUrl?: string
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
