import { useEffect, useRef, useState } from 'react'
import type { OverlayBridge } from '../../shared/bridge'

declare global {
  interface Window {
    overlay: OverlayBridge
  }
}

interface InitData {
  displayId: number
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
}

interface Point {
  x: number
  y: number
}

/**
 * v0.3.1 라이브 화면 오버레이:
 * - 사전 스크린샷 없음. 실제 사용자 화면이 투명 창 너머로 그대로 보인다.
 * - 커서는 크로스헤어.
 * - 드래그 시작 전: 아주 연한 hover 표시만 (화면은 원본 그대로).
 * - 드래그 중: 선택 사각형 바깥만 살짝 어둡게 (box-shadow로 구현, 안쪽은 완전 투명).
 * - 투명창이라도 mouse 이벤트를 받기 위해 0.3% 수준의 극미한 background alpha 적용 (Windows 대응).
 */
export function Overlay(): JSX.Element {
  const [init, setInit] = useState<InitData | null>(null)
  const [start, setStart] = useState<Point | null>(null)
  const [current, setCurrent] = useState<Point | null>(null)
  const [mouse, setMouse] = useState<Point | null>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    window.overlay.onInit((data) => {
      setInit(data)
      // 새 세션 시작: 이전 선택 초기화
      setStart(null)
      setCurrent(null)
      setMouse(null)
      draggingRef.current = false
    })

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.overlay.cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onMouseDown = (e: React.MouseEvent): void => {
    draggingRef.current = true
    setStart({ x: e.clientX, y: e.clientY })
    setCurrent({ x: e.clientX, y: e.clientY })
  }

  const onMouseMove = (e: React.MouseEvent): void => {
    setMouse({ x: e.clientX, y: e.clientY })
    if (!draggingRef.current) return
    setCurrent({ x: e.clientX, y: e.clientY })
  }

  const onMouseUp = (): void => {
    if (!draggingRef.current || !start || !current || !init) {
      draggingRef.current = false
      return
    }
    draggingRef.current = false
    const sel = computeRect(start, current)
    if (sel.width < 4 || sel.height < 4) {
      setStart(null)
      setCurrent(null)
      return
    }
    window.overlay.submit({
      displayId: init.displayId,
      x: sel.x,
      y: sel.y,
      width: sel.width,
      height: sel.height
    })
  }

  if (!init) {
    // 아직 init 전엔 render하지 않음 (완전 투명 유지)
    return <div style={{ width: '100vw', height: '100vh' }} />
  }

  const rect = start && current ? computeRect(start, current) : null

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'crosshair',
        // 완전 투명(alpha 0)이면 Windows에서 마우스 이벤트가 통과해버리므로 극미한 alpha 적용
        background: 'rgba(0,0,0,0.003)'
      }}
    >
      {/* 선택 사각형 (내부는 완전 투명, 외부는 box-shadow로 살짝 어둡게) */}
      {rect && (
        <div
          className="pointer-events-none"
          style={{
            position: 'absolute',
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            border: '1.5px solid #3B82F6',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)'
          }}
        />
      )}

      {/* 크기 라벨 (드래그 중) */}
      {rect && (
        <div
          className="pointer-events-none"
          style={{
            position: 'absolute',
            left: rect.x,
            top: rect.y > 28 ? rect.y - 26 : rect.y + rect.height + 6,
            background: 'rgba(0,0,0,0.85)',
            color: 'white',
            padding: '3px 8px',
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            whiteSpace: 'nowrap'
          }}
        >
          {rect.width} × {rect.height}
        </div>
      )}

      {/* 커서 옆 좌표 안내 (드래그 전) */}
      {!rect && mouse && (
        <div
          className="pointer-events-none"
          style={{
            position: 'absolute',
            left: Math.min(mouse.x + 18, init.bounds.width - 120),
            top: Math.min(mouse.y + 18, init.bounds.height - 30),
            background: 'rgba(0,0,0,0.75)',
            color: 'white',
            padding: '3px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
          }}
        >
          {mouse.x}, {mouse.y}
        </div>
      )}

      {/* 상단 안내 문구 */}
      <div
        className="pointer-events-none"
        style={{
          position: 'absolute',
          top: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '6px 14px',
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 500
        }}
      >
        드래그하여 영역 선택 · ESC 취소
      </div>
    </div>
  )
}

function computeRect(
  a: { x: number; y: number },
  b: { x: number; y: number }
): { x: number; y: number; width: number; height: number } {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  }
}
