import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer, Image as KImage, Line, Rect, Ellipse, Arrow, Text, Group } from 'react-konva'
import type Konva from 'konva'
import { Toolbar } from './Toolbar'
import type { Shape, Tool } from './types'
import type { EditorBridge } from '../../shared/bridge'
import { makeMosaicCanvas } from './mosaic'

declare global {
  interface Window {
    editor: EditorBridge
  }
}

export function Editor(): JSX.Element {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [mosaicImg, setMosaicImg] = useState<HTMLCanvasElement | null>(null)
  const [shapes, setShapes] = useState<Shape[]>([])
  const [redoStack, setRedoStack] = useState<Shape[]>([])
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState('#EF4444')
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [drafting, setDrafting] = useState<Shape | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })

  // Receive capture from main process
  useEffect(() => {
    window.editor.onInit((data) => {
      const image = new Image()
      image.onload = () => {
        setImg(image)
        setMosaicImg(null) // v0.6.0: 모자이크는 lazy 계산 (실제 툴 선택 시에만)
        setShapes([])
        setRedoStack([])
        // main process에게 "이미지 로드 완료 — 창 show 해도 됨" 신호
        try {
          window.editor.readyToShow?.()
        } catch {
          /* older preload */
        }
      }
      image.onerror = () => {
        // 혹시 실패해도 창은 띄워야 함
        try {
          window.editor.readyToShow?.()
        } catch {
          /* ignore */
        }
      }
      // v0.6.0: filePath 우선 (file:// URL), 없으면 dataUrl 폴백
      const src = data.filePath ? `file://${data.filePath.replace(/\\/g, '/')}` : (data.dataUrl ?? '')
      image.src = src
    })
  }, [])

  // v0.6.0: 모자이크 캔버스는 처음 모자이크 툴 선택 시에만 한 번 계산
  useEffect(() => {
    if (tool !== 'mosaic' || !img || mosaicImg) return
    // 다음 프레임으로 밀어서 UI 스레드 블록 최소화
    const timer = setTimeout(() => {
      setMosaicImg(makeMosaicCanvas(img, 14))
    }, 0)
    return () => clearTimeout(timer)
  }, [tool, img, mosaicImg])

  // Compute stage size to fit the window and image
  useEffect(() => {
    const update = (): void => {
      if (!containerRef.current || !img) return
      const { clientWidth, clientHeight } = containerRef.current
      const pad = 40
      const maxW = clientWidth - pad
      const maxH = clientHeight - pad
      const ratio = img.width / img.height
      let w = Math.min(img.width, maxW)
      let h = w / ratio
      if (h > maxH) {
        h = maxH
        w = h * ratio
      }
      setStageSize({ width: w, height: h })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [img])

  // scaling: shapes are stored in IMAGE coordinates; stage is scaled via `scale` prop
  const scale = img ? stageSize.width / img.width : 1

  // --- Drawing handlers ---
  const getPointer = useCallback((): { x: number; y: number } | null => {
    const stage = stageRef.current
    if (!stage) return null
    const p = stage.getPointerPosition()
    if (!p) return null
    return { x: p.x / scale, y: p.y / scale }
  }, [scale])

  const onMouseDown = (): void => {
    if (!img) return
    if (tool === 'select') return
    const pos = getPointer()
    if (!pos) return
    const id = crypto.randomUUID()
    if (tool === 'pen') {
      setDrafting({ id, tool: 'pen', points: [pos.x, pos.y], color, strokeWidth })
    } else if (tool === 'line' || tool === 'arrow') {
      setDrafting({ id, tool, x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y, color, strokeWidth })
    } else if (tool === 'rect') {
      setDrafting({
        id,
        tool: 'rect',
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        color,
        strokeWidth
      })
    } else if (tool === 'ellipse') {
      setDrafting({
        id,
        tool: 'ellipse',
        cx: pos.x,
        cy: pos.y,
        rx: 0,
        ry: 0,
        color,
        strokeWidth
      })
    } else if (tool === 'mosaic') {
      setDrafting({
        id,
        tool: 'mosaic',
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        color,
        strokeWidth
      })
    } else if (tool === 'text') {
      const text: Shape = {
        id,
        tool: 'text',
        x: pos.x,
        y: pos.y,
        text: '텍스트',
        fontSize: Math.max(14, strokeWidth * 4),
        color,
        strokeWidth
      }
      commit([...shapes, text])
      setEditingTextId(id)
      setDrafting(null)
    }
  }

  const onMouseMove = (): void => {
    if (!drafting) return
    const pos = getPointer()
    if (!pos) return
    if (drafting.tool === 'pen') {
      setDrafting({ ...drafting, points: [...drafting.points, pos.x, pos.y] })
    } else if (drafting.tool === 'line' || drafting.tool === 'arrow') {
      setDrafting({ ...drafting, x2: pos.x, y2: pos.y })
    } else if (drafting.tool === 'rect' || drafting.tool === 'mosaic') {
      setDrafting({ ...drafting, width: pos.x - drafting.x, height: pos.y - drafting.y })
    } else if (drafting.tool === 'ellipse') {
      setDrafting({
        ...drafting,
        rx: Math.abs(pos.x - drafting.cx),
        ry: Math.abs(pos.y - drafting.cy)
      })
    }
  }

  const onMouseUp = (): void => {
    if (!drafting) return
    // normalise rect/mosaic with negative width/height
    let finalShape: Shape = drafting
    if (drafting.tool === 'rect' || drafting.tool === 'mosaic') {
      const { x, y, width, height } = drafting
      finalShape = {
        ...drafting,
        x: width < 0 ? x + width : x,
        y: height < 0 ? y + height : y,
        width: Math.abs(width),
        height: Math.abs(height)
      } as Shape
      if (Math.abs(width) < 3 || Math.abs(height) < 3) {
        setDrafting(null)
        return
      }
    }
    if (drafting.tool === 'ellipse' && (drafting.rx < 2 || drafting.ry < 2)) {
      setDrafting(null)
      return
    }
    commit([...shapes, finalShape])
    setDrafting(null)
  }

  const commit = (next: Shape[]): void => {
    setShapes(next)
    setRedoStack([])
  }

  const undo = (): void => {
    if (shapes.length === 0) return
    const last = shapes[shapes.length - 1]
    setShapes(shapes.slice(0, -1))
    setRedoStack([...redoStack, last])
  }
  const redo = (): void => {
    if (redoStack.length === 0) return
    const last = redoStack[redoStack.length - 1]
    setRedoStack(redoStack.slice(0, -1))
    setShapes([...shapes, last])
  }

  const exportImage = useCallback((): string | null => {
    if (!stageRef.current || !img) return null
    // Render at original image resolution
    return stageRef.current.toDataURL({
      pixelRatio: 1 / scale,
      mimeType: 'image/png'
    })
  }, [scale, img])

  const onSave = useCallback(async () => {
    const dataUrl = exportImage()
    if (!dataUrl) return
    const full = await window.editor.save(dataUrl, 'png')
    console.log('saved to', full)
  }, [exportImage])

  const onCopy = useCallback(async () => {
    const dataUrl = exportImage()
    if (!dataUrl) return
    await window.editor.copy(dataUrl)
  }, [exportImage])

  const onClose = useCallback(async () => {
    await window.editor.close()
  }, [])

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        onSave()
      } else if (mod && e.key.toLowerCase() === 'c' && !editingTextId) {
        e.preventDefault()
        onCopy()
      } else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((mod && e.key.toLowerCase() === 'y') || (mod && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault()
        redo()
      } else if (e.key === 'Escape') {
        if (editingTextId) {
          setEditingTextId(null)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSave, onCopy, onClose, undo, redo, editingTextId])

  const allShapes = useMemo(() => {
    return drafting ? [...shapes, drafting] : shapes
  }, [shapes, drafting])

  const mosaicShapes = allShapes.filter((s): s is Shape & { tool: 'mosaic' } => s.tool === 'mosaic')
  const otherShapes = allShapes.filter((s) => s.tool !== 'mosaic')

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      <Toolbar
        tool={tool}
        color={color}
        strokeWidth={strokeWidth}
        onToolChange={setTool}
        onColorChange={setColor}
        onStrokeChange={setStrokeWidth}
        onUndo={undo}
        onRedo={redo}
        onSave={onSave}
        onCopy={onCopy}
        onClose={onClose}
        canUndo={shapes.length > 0}
        canRedo={redoStack.length > 0}
      />
      <div ref={containerRef} className="flex-1 flex items-center justify-center overflow-hidden relative">
        {img ? (
          <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            scaleX={scale}
            scaleY={scale}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            style={{ background: '#0b1220', cursor: tool === 'select' ? 'default' : 'crosshair' }}
          >
            <Layer listening={false}>
              <KImage image={img} />
            </Layer>
            {/* Mosaic layer: clipped mosaic canvas shown only under mosaic shapes */}
            {mosaicImg && mosaicShapes.length > 0 && (
              <Layer listening={false}>
                {mosaicShapes.map((s) => {
                  const r = normalize(s)
                  return (
                    <Group
                      key={s.id}
                      clipX={r.x}
                      clipY={r.y}
                      clipWidth={r.width}
                      clipHeight={r.height}
                    >
                      <KImage image={mosaicImg} />
                    </Group>
                  )
                })}
              </Layer>
            )}
            <Layer>
              {otherShapes.map((s) => renderShape(s, editingTextId === s.id, (newText) => {
                setShapes((prev) =>
                  prev.map((p) => (p.id === s.id && p.tool === 'text' ? { ...p, text: newText } : p))
                )
                setEditingTextId(null)
              }))}
            </Layer>
          </Stage>
        ) : (
          <div className="text-gray-400">이미지 불러오는 중...</div>
        )}
      </div>
      <div className="px-4 py-1.5 bg-gray-800 text-xs text-gray-400 border-t border-gray-700 flex justify-between">
        <span>
          {img ? `${img.width} × ${img.height}` : '-'}
          {` · ${shapes.length}개 편집`}
        </span>
        <span>Cmd/Ctrl+S 저장 · Cmd/Ctrl+C 복사 · Cmd/Ctrl+Z 되돌리기 · Esc 닫기</span>
      </div>
    </div>
  )
}

function normalize(s: Shape & { tool: 'mosaic' | 'rect' }): {
  x: number
  y: number
  width: number
  height: number
} {
  const x = s.width < 0 ? s.x + s.width : s.x
  const y = s.height < 0 ? s.y + s.height : s.y
  return { x, y, width: Math.abs(s.width), height: Math.abs(s.height) }
}

function renderShape(
  s: Shape,
  isEditingText: boolean,
  onTextCommit: (t: string) => void
): JSX.Element | null {
  switch (s.tool) {
    case 'pen':
      return (
        <Line
          key={s.id}
          points={s.points}
          stroke={s.color}
          strokeWidth={s.strokeWidth}
          tension={0.3}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      )
    case 'line':
      return (
        <Line
          key={s.id}
          points={[s.x1, s.y1, s.x2, s.y2]}
          stroke={s.color}
          strokeWidth={s.strokeWidth}
          lineCap="round"
          listening={false}
        />
      )
    case 'arrow':
      return (
        <Arrow
          key={s.id}
          points={[s.x1, s.y1, s.x2, s.y2]}
          stroke={s.color}
          fill={s.color}
          strokeWidth={s.strokeWidth}
          pointerLength={12 + s.strokeWidth}
          pointerWidth={10 + s.strokeWidth}
          listening={false}
        />
      )
    case 'rect': {
      const n = normalize(s)
      return (
        <Rect
          key={s.id}
          x={n.x}
          y={n.y}
          width={n.width}
          height={n.height}
          stroke={s.color}
          strokeWidth={s.strokeWidth}
          listening={false}
        />
      )
    }
    case 'ellipse':
      return (
        <Ellipse
          key={s.id}
          x={s.cx}
          y={s.cy}
          radiusX={s.rx}
          radiusY={s.ry}
          stroke={s.color}
          strokeWidth={s.strokeWidth}
          listening={false}
        />
      )
    case 'text':
      if (isEditingText) {
        return (
          <Text
            key={s.id}
            x={s.x}
            y={s.y}
            text={s.text}
            fontSize={s.fontSize}
            fill={s.color}
            listening={false}
            onDblClick={() => undefined}
            fontStyle="bold"
          />
        )
      }
      return (
        <Text
          key={s.id}
          x={s.x}
          y={s.y}
          text={s.text}
          fontSize={s.fontSize}
          fill={s.color}
          listening={true}
          fontStyle="bold"
          onDblClick={() => {
            const next = window.prompt('텍스트 입력', s.text)
            if (next != null) onTextCommit(next)
          }}
        />
      )
    case 'mosaic':
      return null
    default:
      return null
  }
}
