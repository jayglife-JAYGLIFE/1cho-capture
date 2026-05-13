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

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * v0.8.2: 2-step 영역 캡처 모델
 *
 * 1단계: 드래그-릴리즈 → 미리보기 (확정 안 됨)
 * 2단계: Enter / 더블클릭 / 선택영역 단일클릭 → 확정
 *
 * 다시 조정: 선택 바깥에서 새 드래그 → 새 영역으로 교체
 * 취소: Esc(1차 = 미리보기만 취소, 2차 = 오버레이 닫기) / 우클릭 / 가운데 버튼
 */
export function Overlay(): JSX.Element {
  const [init, setInit] = useState<InitData | null>(null)
  const [start, setStart] = useState<Point | null>(null)
  const [current, setCurrent] = useState<Point | null>(null)
  const [mouse, setMouse] = useState<Point | null>(null)
  /** v0.8.2: drag-release 후 확정 대기 중인 사각형 */
  const [committed, setCommitted] = useState<Rect | null>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    window.overlay.onInit((data) => {
      setInit(data)
      // 새 세션 시작: 이전 선택 초기화
      setStart(null)
      setCurrent(null)
      setMouse(null)
      setCommitted(null)
      draggingRef.current = false
    })
  }, [])

  const submit = (r: Rect): void => {
    if (!init) return
    if (r.width < 4 || r.height < 4) return
    window.overlay.submit({
      displayId: init.displayId,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height
    })
  }

  // 키보드: Enter 확정 / Esc 1차 미리보기만 취소, 2차 오버레이 종료
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        if (committed) {
          e.preventDefault()
          submit(committed)
        }
      } else if (e.key === 'Escape') {
        if (committed) {
          // 미리보기만 취소 → 다시 드래그할 수 있게
          setCommitted(null)
          setStart(null)
          setCurrent(null)
        } else {
          window.overlay.cancel()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [committed, init])

  const isInsideCommitted = (p: Point): boolean => {
    if (!committed) return false
    return (
      p.x >= committed.x &&
      p.x <= committed.x + committed.width &&
      p.y >= committed.y &&
      p.y <= committed.y + committed.height
    )
  }

  const onMouseDown = (e: React.MouseEvent): void => {
    const p = { x: e.clientX, y: e.clientY }
    // 미리보기가 있고 그 안쪽 클릭이면 → 드래그 시작 안 함 (더블클릭/싱글클릭으로 확정 받기 위해)
    if (committed && isInsideCommitted(p)) {
      return
    }
    // 그 외(미리보기 밖 클릭 등)는 새 드래그 시작
    setCommitted(null)
    draggingRef.current = true
    setStart(p)
    setCurrent(p)
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
      // 사실상 단일 클릭 → 선택 초기화
      setStart(null)
      setCurrent(null)
      return
    }
    // v0.8.2: 미리보기로만 저장. 즉시 submit 하지 않음.
    setCommitted(sel)
    setStart(null)
    setCurrent(null)
  }

  // 선택 영역 내부 더블클릭 → 확정
  const onDoubleClick = (e: React.MouseEvent): void => {
    if (committed && isInsideCommitted({ x: e.clientX, y: e.clientY })) {
      submit(committed)
    }
  }

  // 선택 영역 내부 단일 클릭 (mouseup 후 그 자리에서) → 확정
  // onClick은 mouseup-mousedown이 같은 위치일 때 발화. 드래그 후엔 발화 안 됨.
  const onClick = (e: React.MouseEvent): void => {
    if (committed && isInsideCommitted({ x: e.clientX, y: e.clientY })) {
      submit(committed)
    }
  }

  if (!init) {
    return <div style={{ width: '100vw', height: '100vh' }} />
  }

  const draggingRect =
    start && current && draggingRef.current ? computeRect(start, current) : null
  const visibleRect = draggingRect ?? committed

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault()
        window.overlay.cancel()
      }}
      onAuxClick={(e) => {
        if (e.button === 1 || e.button === 2) {
          e.preventDefault()
          window.overlay.cancel()
        }
      }}
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'crosshair',
        background: 'rgba(0,0,0,0.003)'
      }}
    >
      {/* 선택 사각형 (드래그 중 또는 미리보기 확정 전) */}
      {visibleRect && (
        <div
          className="pointer-events-none"
          style={{
            position: 'absolute',
            left: visibleRect.x,
            top: visibleRect.y,
            width: visibleRect.width,
            height: visibleRect.height,
            border: committed ? '2px solid #22C55E' : '1.5px solid #3B82F6',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)'
          }}
        />
      )}

      {/* 크기 라벨 */}
      {visibleRect && (
        <div
          className="pointer-events-none"
          style={{
            position: 'absolute',
            left: visibleRect.x,
            top:
              visibleRect.y > 28
                ? visibleRect.y - 26
                : visibleRect.y + visibleRect.height + 6,
            background: committed ? 'rgba(34,197,94,0.95)' : 'rgba(0,0,0,0.85)',
            color: 'white',
            padding: '3px 8px',
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            whiteSpace: 'nowrap'
          }}
        >
          {visibleRect.width} × {visibleRect.height}
          {committed ? '  ✓ 확정 대기' : ''}
        </div>
      )}

      {/* 커서 옆 좌표 (드래그 전, 선택 없음) */}
      {!visibleRect && mouse && (
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

      {/* 상단 안내 문구 — 상태에 따라 다른 메시지 */}
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
        {committed
          ? '✅ Enter / 더블클릭 / 선택영역 클릭 = 확정 · Esc 다시 그리기'
          : '드래그하여 영역 선택 · ESC / 우클릭 취소'}
      </div>
    </div>
  )
}

function computeRect(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  }
}
