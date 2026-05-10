import { useEffect, useState } from 'react'
import type { CaptureBoxBridge, CaptureBoxInitData } from '../../shared/bridge'
import type { CaptureBoxPreset } from '../../shared/types'

declare global {
  interface Window {
    captureBox: CaptureBoxBridge
  }
}

// captureBox.ts 의 CONTROL_BAR_HEIGHT 와 일치시켜야 함
const CONTROL_BAR_HEIGHT = 40

/**
 * v0.8.0 창 캡처 박스 UI:
 *
 * 상단 컨트롤바 (40px):
 *   [📷 캡처] [800 × 600] [프리셋 ▼] [✕]
 *
 * 컨트롤바 = 드래그 영역 (창 이동)
 * 컨트롤바 아래 = 투명 (라이브 화면이 비침), 파란 점선 테두리만
 * 우측 하단 = 작은 ⌟ resize 핸들
 */
export function CaptureBox(): JSX.Element {
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600
  })
  const [presets, setPresets] = useState<CaptureBoxPreset[]>([])
  const [presetOpen, setPresetOpen] = useState(false)
  const [editingSize, setEditingSize] = useState(false)
  const [draftW, setDraftW] = useState('')
  const [draftH, setDraftH] = useState('')

  useEffect(() => {
    window.captureBox.onInit((data: CaptureBoxInitData) => {
      setSize({ width: data.width, height: data.height })
      setPresets(data.presets)
    })
    // 사용자가 native resize handle로 크기 바꾸면 main에서 알려줌
    window.captureBox.onSizeChanged((data) => {
      setSize(data)
    })
  }, [])

  const applyPreset = (p: CaptureBoxPreset): void => {
    setSize({ width: p.width, height: p.height })
    window.captureBox.resize(p.width, p.height)
    setPresetOpen(false)
  }

  const startEditingSize = (): void => {
    setDraftW(String(size.width))
    setDraftH(String(size.height))
    setEditingSize(true)
  }

  const commitSize = (): void => {
    const w = parseInt(draftW, 10)
    const h = parseInt(draftH, 10)
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      const W = Math.max(100, Math.min(8000, w))
      const H = Math.max(100, Math.min(8000, h))
      setSize({ width: W, height: H })
      window.captureBox.resize(W, H)
    }
    setEditingSize(false)
  }

  const onShoot = (): void => {
    window.captureBox.shoot()
  }

  const onClose = (): void => {
    window.captureBox.close()
  }

  // ESC = 닫기, Enter = 캡처
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (presetOpen) setPresetOpen(false)
        else if (editingSize) setEditingSize(false)
        else onClose()
      } else if (e.key === 'Enter' && !editingSize) {
        onShoot()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presetOpen, editingSize])

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* 컨트롤바 */}
      <div
        style={
          {
            height: CONTROL_BAR_HEIGHT,
            background:
              'linear-gradient(180deg, rgba(31,41,55,0.95) 0%, rgba(17,24,39,0.95) 100%)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 10px',
            borderTopLeftRadius: 10,
            borderTopRightRadius: 10,
            borderBottom: '1.5px solid #3B82F6',
            fontSize: 12,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif',
            userSelect: 'none',
            WebkitAppRegion: 'drag',
            whiteSpace: 'nowrap'
          } as React.CSSProperties
        }
      >
        {/* 캡처 버튼 */}
        <button
          onClick={onShoot}
          title="이 영역 캡처 (Enter)"
          style={
            {
              WebkitAppRegion: 'no-drag',
              padding: '5px 14px',
              background: '#3B82F6',
              border: 'none',
              borderRadius: 6,
              color: 'white',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600
            } as React.CSSProperties
          }
        >
          📷 캡처
        </button>

        {/* 사이즈 표시/입력 */}
        {editingSize ? (
          <div
            style={
              {
                WebkitAppRegion: 'no-drag',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: 'rgba(0,0,0,0.4)',
                borderRadius: 6,
                padding: '2px 6px'
              } as React.CSSProperties
            }
          >
            <input
              type="number"
              value={draftW}
              onChange={(e) => setDraftW(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commitSize()}
              style={{
                width: 60,
                background: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: 12,
                textAlign: 'right',
                outline: 'none'
              }}
              autoFocus
            />
            <span style={{ color: '#6B7280' }}>×</span>
            <input
              type="number"
              value={draftH}
              onChange={(e) => setDraftH(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commitSize()}
              style={{
                width: 60,
                background: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: 12,
                outline: 'none'
              }}
            />
            <button
              onClick={commitSize}
              style={
                {
                  WebkitAppRegion: 'no-drag',
                  padding: '2px 8px',
                  background: '#3B82F6',
                  border: 'none',
                  borderRadius: 4,
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: 11
                } as React.CSSProperties
              }
            >
              적용
            </button>
          </div>
        ) : (
          <button
            onClick={startEditingSize}
            title="클릭하여 크기 직접 입력"
            style={
              {
                WebkitAppRegion: 'no-drag',
                padding: '5px 10px',
                background: 'rgba(255,255,255,0.08)',
                border: 'none',
                borderRadius: 6,
                color: '#E5E7EB',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
              } as React.CSSProperties
            }
          >
            {size.width} × {size.height}
          </button>
        )}

        {/* 프리셋 드롭다운 */}
        <div
          style={{ position: 'relative' }}
        >
          <button
            onClick={() => setPresetOpen((v) => !v)}
            title="저장된 크기 프리셋"
            style={
              {
                WebkitAppRegion: 'no-drag',
                padding: '5px 10px',
                background: 'rgba(255,255,255,0.08)',
                border: 'none',
                borderRadius: 6,
                color: '#E5E7EB',
                cursor: 'pointer',
                fontSize: 12
              } as React.CSSProperties
            }
          >
            프리셋 ▾
          </button>
          {presetOpen && (
            <div
              style={
                {
                  WebkitAppRegion: 'no-drag',
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  background: '#1f2937',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  minWidth: 180,
                  maxHeight: 240,
                  overflowY: 'auto',
                  zIndex: 1000,
                  padding: 4
                } as React.CSSProperties
              }
            >
              {presets.length === 0 ? (
                <div
                  style={{
                    padding: '8px 12px',
                    color: '#6B7280',
                    fontSize: 11
                  }}
                >
                  저장된 프리셋 없음 — 설정에서 추가
                </div>
              ) : (
                presets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p)}
                    style={{
                      display: 'flex',
                      width: '100%',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 10px',
                      background: 'transparent',
                      border: 'none',
                      color: '#E5E7EB',
                      cursor: 'pointer',
                      fontSize: 12,
                      borderRadius: 4,
                      textAlign: 'left'
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background =
                        'rgba(59,130,246,0.2)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background =
                        'transparent'
                    }}
                  >
                    <span>{p.name}</span>
                    <span
                      style={{
                        color: '#6B7280',
                        fontSize: 11,
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, monospace'
                      }}
                    >
                      {p.width}×{p.height}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* 닫기 */}
        <button
          onClick={onClose}
          title="닫기 (Esc)"
          style={
            {
              WebkitAppRegion: 'no-drag',
              width: 24,
              height: 24,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.08)',
              border: 'none',
              borderRadius: 6,
              color: '#9CA3AF',
              cursor: 'pointer',
              fontSize: 12
            } as React.CSSProperties
          }
        >
          ✕
        </button>
      </div>

      {/* 박스 본문: 투명 + 파란 점선 테두리 */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          // 매우 옅은 dim — Windows에서 mouse event 받기 위해 alpha 약간 필요
          background: 'rgba(0,0,0,0.003)',
          border: '1.5px dashed #3B82F6',
          borderTop: 'none',
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 10
        }}
      />
    </div>
  )
}
