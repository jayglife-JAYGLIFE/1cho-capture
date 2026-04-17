import Store from 'electron-store'
import { app } from 'electron'
import path from 'node:path'
import type { AppSettings } from '../shared/types'
import { DEFAULT_HOTKEYS, DEFAULT_SETTINGS } from '../shared/constants'

const HOTKEY_SCHEMA_VERSION = 2

function defaultSaveFolder(): string {
  return path.join(app.getPath('pictures'), '1초캡처')
}

interface StoredAppSettings extends AppSettings {
  _hotkeyVersion?: number
}

export const store = new Store<StoredAppSettings>({
  defaults: {
    ...DEFAULT_SETTINGS,
    saveFolder: defaultSaveFolder()
  }
})

// 이전 버전(숫자 단축키 1/2/3/4)을 쓰던 사용자는 한 번 자동으로 새 기본값으로 마이그레이션.
// 저장된 hotkeys.region이 숫자로 끝나거나 비어있으면 v2 이전이라 판단.
const currentRegion = store.get('hotkeys')?.region ?? ''
const looksLikeV1 = /\+\d$/.test(currentRegion) || currentRegion === ''
if (looksLikeV1) {
  store.set('hotkeys', DEFAULT_HOTKEYS)
  store.set('_hotkeyVersion', HOTKEY_SCHEMA_VERSION)
  console.log('[store] 단축키를 v2 기본값으로 마이그레이션:', DEFAULT_HOTKEYS)
}

export function getSettings(): AppSettings {
  const { _hotkeyVersion: _v, ...rest } = store.store
  void _v
  return rest
}

export function setSettings(partial: Partial<AppSettings>): AppSettings {
  for (const [k, v] of Object.entries(partial)) {
    store.set(k as keyof StoredAppSettings, v as never)
  }
  return getSettings()
}
