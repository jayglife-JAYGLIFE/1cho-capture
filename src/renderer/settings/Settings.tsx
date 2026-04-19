import { useEffect, useState } from 'react'
import type { SettingsBridge } from '../../shared/bridge'
import type { AppSettings } from '../../shared/types'

declare global {
  interface Window {
    settings: SettingsBridge
  }
}

const HOTKEY_LABELS: Record<keyof AppSettings['hotkeys'], string> = {
  region: '영역 캡처',
  fullscreen: '전체 화면 캡처',
  window: '창 캡처',
  scroll: '스크롤 캡처',
  repeat: '마지막 영역 재캡처'
}

export function Settings(): JSX.Element {
  const [cfg, setCfg] = useState<AppSettings | null>(null)
  const [version, setVersion] = useState<string>('')
  const [recordingKey, setRecordingKey] = useState<keyof AppSettings['hotkeys'] | null>(null)

  useEffect(() => {
    window.settings.get().then(setCfg)
    window.settings.onInit(setCfg)
    window.settings.getVersion().then(setVersion).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!recordingKey) return
    const onKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      const parts: string[] = []
      if (e.metaKey) parts.push('Command')
      if (e.ctrlKey) parts.push('Control')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      const key = e.key
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return
      const keyStr = key.length === 1 ? key.toUpperCase() : key
      parts.push(keyStr)
      const accelerator = parts.join('+')
      updateHotkey(recordingKey, accelerator)
      setRecordingKey(null)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [recordingKey, cfg])

  const updateHotkey = async (key: keyof AppSettings['hotkeys'], value: string): Promise<void> => {
    if (!cfg) return
    const next = { ...cfg, hotkeys: { ...cfg.hotkeys, [key]: value } }
    setCfg(next)
    await window.settings.set({ hotkeys: next.hotkeys })
  }

  const pickFolder = async (): Promise<void> => {
    const p = await window.settings.pickFolder()
    if (p && cfg) {
      const next = { ...cfg, saveFolder: p }
      setCfg(next)
      await window.settings.set({ saveFolder: p })
    }
  }

  const setField = async <K extends keyof AppSettings>(k: K, v: AppSettings[K]): Promise<void> => {
    if (!cfg) return
    const next = { ...cfg, [k]: v }
    setCfg(next)
    await window.settings.set({ [k]: v } as Partial<AppSettings>)
  }

  if (!cfg) {
    return <div className="p-6 text-gray-400">불러오는 중…</div>
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-screen">
      <h1 className="text-xl font-bold">1초캡처 설정</h1>

      <section>
        <h2 className="text-sm font-semibold text-gray-300 mb-2">단축키</h2>
        <div className="space-y-2">
          {(Object.keys(HOTKEY_LABELS) as Array<keyof AppSettings['hotkeys']>).map((k) => (
            <div
              key={k}
              className="flex items-center justify-between bg-gray-800 rounded px-3 py-2"
            >
              <span className="text-sm">{HOTKEY_LABELS[k]}</span>
              <button
                onClick={() => setRecordingKey(k)}
                className={`px-3 py-1 rounded text-xs font-mono ${
                  recordingKey === k
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {recordingKey === k ? '키 입력 대기…' : cfg.hotkeys[k] || '미지정'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-300 mb-2">저장</h2>
        <div className="space-y-2">
          <div className="bg-gray-800 rounded px-3 py-2">
            <div className="text-xs text-gray-400 mb-1">저장 폴더</div>
            <div className="flex gap-2">
              <input
                readOnly
                value={cfg.saveFolder}
                className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs"
              />
              <button
                onClick={pickFolder}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs"
              >
                변경…
              </button>
            </div>
          </div>

          <div className="bg-gray-800 rounded px-3 py-2">
            <div className="text-xs text-gray-400 mb-1">파일 형식</div>
            <div className="flex gap-2">
              {(['png', 'jpg'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setField('fileFormat', f)}
                  className={`px-3 py-1 rounded text-xs ${
                    cfg.fileFormat === f ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gray-800 rounded px-3 py-2">
            <div className="text-xs text-gray-400 mb-1">
              파일명 규칙 · <span className="text-gray-500">{'{YYYY}{MM}{DD}{HH}{mm}{ss}'}</span>
            </div>
            <input
              value={cfg.filenamePattern}
              onChange={(e) => setField('filenamePattern', e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs font-mono"
            />
          </div>

          <div className="bg-gray-800 rounded px-3 py-2">
            <div className="text-xs text-gray-400 mb-1">캡처 후 기본 동작</div>
            <div className="flex gap-2">
              {(
                [
                  { id: 'editor', label: '편집기 열기' },
                  { id: 'save', label: '바로 저장' },
                  { id: 'clipboard', label: '클립보드만' }
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setField('afterCapture', opt.id)}
                  className={`flex-1 px-3 py-1.5 rounded text-xs ${
                    cfg.afterCapture === opt.id ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* v0.6.2: 시작 옵션 */}
      <section>
        <h2 className="text-sm font-semibold text-gray-300 mb-2">시작 옵션</h2>
        <label className="flex items-center justify-between bg-gray-800 rounded px-3 py-3 cursor-pointer">
          <div>
            <div className="text-sm">컴퓨터 시작 시 자동 실행</div>
            <div className="text-xs text-gray-400 mt-0.5">
              켜두면 Windows/Mac 로그인 후 자동으로 트레이에 상주해요
            </div>
          </div>
          <input
            type="checkbox"
            checked={cfg.autoStart}
            onChange={(e) => setField('autoStart', e.target.checked)}
            className="w-5 h-5 accent-blue-500"
          />
        </label>
      </section>

      <p className="text-xs text-gray-500 pt-2">
        변경사항은 즉시 저장됩니다. macOS에서는 화면 녹화 권한이 필요합니다.
      </p>

      {/* v0.6.1: 버전 표시 */}
      <footer className="pt-4 mt-4 border-t border-gray-700 flex items-center justify-between text-xs text-gray-500">
        <span>1초캡처</span>
        <span className="font-mono">{version ? `v${version}` : ''}</span>
      </footer>
    </div>
  )
}
