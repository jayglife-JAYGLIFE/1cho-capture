import { useEffect, useState } from 'react'

interface DelayApi {
  onCount: (cb: (n: number) => void) => void
  cancel: () => void
}

declare global {
  interface Window {
    delayApi: DelayApi
  }
}

/**
 * v0.8.9: 지연 캡처 카운트다운 배지.
 *
 * 화면 우하단에 작은 원형 창으로 뜸. focus 안 가져감 → 팝업 메뉴 유지.
 * 클릭하면 카운트다운 취소 (main IPC).
 */
export function DelayBadge(): JSX.Element {
  const [n, setN] = useState<number | null>(null)

  useEffect(() => {
    if (window.delayApi) {
      window.delayApi.onCount((count) => setN(count))
    }
  }, [])

  return (
    <div
      onClick={() => window.delayApi?.cancel()}
      title="클릭 = 취소"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(circle at center, rgba(34,197,94,0.95) 0%, rgba(22,163,74,0.95) 100%)',
        color: 'white',
        borderRadius: '50%',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        cursor: 'pointer',
        userSelect: 'none',
        boxShadow:
          '0 10px 32px rgba(0,0,0,0.45), 0 0 0 3px rgba(255,255,255,0.15)',
        border: '2px solid rgba(255,255,255,0.4)'
      }}
    >
      <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1 }}>
        {n ?? '⏱'}
      </div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 500,
          marginTop: 6,
          opacity: 0.85,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif'
        }}
      >
        지연 캡처
      </div>
    </div>
  )
}
