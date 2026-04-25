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
  autoStart: true
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
  TOOLBAR_SAVE_POSITION: 'toolbar:savePosition'
} as const
