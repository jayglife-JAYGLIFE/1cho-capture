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
  backgroundDataUrl: string
}

export function Overlay(): JSX.Element {
  const [init, setInit] = useState<InitData | null>(null)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    window.overlay.onInit((data) => setInit(data))

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        window.overlay.cancel()
      }
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
    return <div className="w-screen h-screen bg-black/30" />
  }

  const rect = start && current ? computeRect(start, current) : null

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      className="w-screen h-screen relative overflow-hidden cursor-crosshair"
      style={{
        backgroundImage: `url(${init.backgroundDataUrl})`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* darkening overlay with a hole where the selection is */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: rect
            ? `rgba(0,0,0,0.45)`
            : `rgba(0,0,0,0.35)`
        }}
      />
      {rect && (
        <>
          {/* clear window showing selection */}
          <div
            className="absolute border-2 border-blue-400 pointer-events-none"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              backgroundImage: `url(${init.backgroundDataUrl})`,
              backgroundSize: `${init.bounds.width}px ${init.bounds.height}px`,
              backgroundPosition: `-${rect.x}px -${rect.y}px`,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0)'
            }}
          />
          {/* size label */}
          <div
            className="absolute bg-black/80 text-white text-xs px-2 py-1 rounded pointer-events-none"
            style={{
              left: rect.x,
              top: Math.max(0, rect.y - 26)
            }}
          >
            {rect.width} × {rect.height}
          </div>
        </>
      )}
      {/* hint */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-sm px-3 py-1.5 rounded-full pointer-events-none">
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
