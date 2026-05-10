import type { AppSettings, HotkeyConfig } from './types'

// 사용자 요청: Control+Shift+Z/X/C/V (Mac/Windows 동일)
// C = 직접 영역 지정 (region)
export const DEFAULT_HOTKEYS: HotkeyConfig = {
  region: 'Control+Shift+C',
  fullscreen: 'Control+Shift+Z',
  window: 'Control+Shift+X',
  scroll: 'Control+Shift+V',
  repeat: ''
}

export const DEFAULT_SETTINGS: Omit<AppSettings, 'saveFolder'> = {
  hotkeys: DEFAULT_HOTKEYS,
  afterCapture: 'editor',
  fileFormat: 'png',
  filenamePattern: 'capture_{YYYY}{MM}{DD}_{HH}{mm}{ss}',
  toolbar: {
    showOnStartup: true
  },
  autoStart: true,
  captureBox: {
    lastSize: { width: 800, height: 600 },
    presets: [
      { id: 'hd', name: 'HD 720p', width: 1280, height: 720 },
      { id: 'fhd', name: 'FHD 1080p', width: 1920, height: 1080 },
      { id: 'square', name: '정사각 800', width: 800, height: 800 },
      { id: 'twitter', name: '트위터 카드', width: 1200, height: 628 },
      { id: 'youtube', name: '유튜브 썸네일', width: 1280, height: 720 }
    ]
  }
}

export const IPC = {
  // Main → Renderer
  OVERLAY_INIT: 'overlay:init',
  EDITOR_INIT: 'editor:init',
  SETTINGS_INIT: 'settings:init',

  // Renderer → Main
  OVERLAY_SELECT: 'overlay:select',
  OVERLAY_CANCEL: 'overlay:cancel',

  EDITOR_SAVE: 'editor:save',
  EDITOR_COPY: 'editor:copy',
  EDITOR_CLOSE: 'editor:close',
  // v0.7.6: 편집이 없을 때 원본 파일을 그대로 복사 (무손실 보장)
  EDITOR_SAVE_ORIGINAL: 'editor:saveOriginal',
  EDITOR_COPY_ORIGINAL: 'editor:copyOriginal',
  // v0.7.8: 다른 이름으로 저장 (파일 다이얼로그)
  EDITOR_SAVE_AS: 'editor:saveAs',
  EDITOR_LOAD_IMAGE: 'editor:load-image',

  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_PICK_FOLDER: 'settings:pickFolder',
  SETTINGS_GET_VERSION: 'settings:getVersion',

  CAPTURE_REGION: 'capture:region',
  CAPTURE_FULLSCREEN: 'capture:fullscreen',
  CAPTURE_WINDOW: 'capture:window',
  CAPTURE_SCROLL: 'capture:scroll',
  CAPTURE_LIST_WINDOWS: 'capture:listWindows',

  SCROLL_ADD_FRAME: 'scroll:addFrame',
  SCROLL_DONE: 'scroll:done',
  SCROLL_CANCEL: 'scroll:cancel',
  // v0.7.0 스크롤 컨트롤러
  SCROLL_CONTROLLER_INIT: 'scroll:controller:init',
  SCROLL_CONTROLLER_STATUS: 'scroll:controller:status',
  SCROLL_CONTROLLER_FINISH: 'scroll:controller:finish',
  SCROLL_CONTROLLER_CANCEL: 'scroll:controller:cancel',

  // Toolbar (v0.4.0)
  TOOLBAR_CAPTURE: 'toolbar:capture',
  TOOLBAR_HIDE: 'toolbar:hide',
  TOOLBAR_SETTINGS: 'toolbar:settings',
  TOOLBAR_SAVE_POSITION: 'toolbar:savePosition',

  // v0.8.0 창 캡처 박스
  CAPTURE_BOX_OPEN: 'captureBox:open',
  CAPTURE_BOX_INIT: 'captureBox:init',
  CAPTURE_BOX_SHOOT: 'captureBox:shoot',
  CAPTURE_BOX_CLOSE: 'captureBox:close',
  CAPTURE_BOX_RESIZE: 'captureBox:resize',
  CAPTURE_BOX_GET_PRESETS: 'captureBox:getPresets',
  CAPTURE_BOX_SET_PRESETS: 'captureBox:setPresets',
  CAPTURE_BOX_SIZE_CHANGED: 'captureBox:sizeChanged'
} as const
