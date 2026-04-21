import { useEffect, useState } from 'react'
import type { ScrollControllerBridge, ScrollControllerStatus } from '../../shared/bridge'

declare global {
  interface Window {
    scrollApi: ScrollControllerBridge
  }
}

export function ScrollController(): JSX.Element {
  const [status, setStatus] = useState<ScrollControllerStatus>({
    frameCount: 0,
    isCapturing: true
  })

  useEffect(() => {
    window.scrollApi.onStatus((s) => setStatus(s))

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') window.scrollApi.finish()
      else if (e.key === 'Escape') window.scrollApi.cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      style={
        {
          width: '100%',
          height: '100%',
          background:
            'linear-gradient(180deg, rgba(31,41,55,0.98) 0%, rgba(17,24,39,0.98) 100%)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 12px',
          borderRadius: 12,
          boxShadow:
            '0 10px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08)',
          fontSize: 13,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          WebkitAppRegion: 'drag'
        } as React.CSSProperties
      }
    >
      {/* 로고 + 상태 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flex: 1,
          color: '#E5E7EB'
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: status.isCapturing ? '#22C55E' : '#6B7280',
            animation: status.isCapturing ? 'pulse 1.4s ease-in-out infinite' : 'none'
          }}
        />
        <span style={{ fontWeight: 600 }}>📜 스크롤 캡처 중</span>
        <span style={{ color: '#9CA3AF', fontSize: 12 }}>
          · {status.frameCount} 프레임
        </span>
      </div>

      {/* 안내 */}
      <span
        style={{
          color: '#9CA3AF',
          fontSize: 11,
          borderRight: '1px solid rgba(255,255,255,0.1)',
          paddingRight: 10
        }}
      >
        타겟 앱을 스크롤하세요
      </span>

      {/* 버튼들 */}
      <button
        onClick={() => window.scrollApi.cancel()}
        style={
          {
            WebkitAppRegion: 'no-drag',
            padding: '6px 12px',
            background: 'rgba(255,255,255,0.08)',
            border: 'none',
            borderRadius: 6,
            color: '#E5E7EB',
            cursor: 'pointer',
            fontSize: 12
          } as React.CSSProperties
        }
        title="취소 (Esc)"
      >
        취소
      </button>
      <button
        onClick={() => window.scrollApi.finish()}
        style={
          {
            WebkitAppRegion: 'no-drag',
            padding: '6px 14px',
            background: '#3B82F6',
            border: 'none',
            borderRadius: 6,
            color: 'white',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600
          } as React.CSSProperties
        }
        title="완료 (Enter)"
      >
        ✓ 완료
      </button>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  )
}
