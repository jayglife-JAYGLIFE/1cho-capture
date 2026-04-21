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
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 })
  // v0.7.1: 사용자 조작 가능 zoom/pan. null이면 이미지 로드 시 자동 fit.
  const [zoom, setZoom] = useState<number | null>(null)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number } | null>(null)
  // v0.7.2: 자르기
  const [pendingCrop, setPendingCrop] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
  const [cropDragging, setCropDragging] = useState(false)

  // Receive capture from main process (v0.6.3: Blob URL 방식으로 전환)
  useEffect(() => {
    const lastBlobUrlRef = { current: null as string | null }

    window.editor.onInit(async (data) => {
      let src = ''
      let revokeAfterLoad: string | null = null

      // v0.6.3: file:// URL은 Chromium에서 CSP/cross-origin으로 차단되는 경우가 있어
      // IPC로 버퍼를 받아 Blob URL 로 변환 (이미 CSP img-src에 blob: 허용됨)
      if (data.filePath && window.editor.loadImageBuffer) {
        try {
          const buf = await window.editor.loadImageBuffer(data.filePath)
          if (buf && buf.byteLength > 0) {
            // IPC로 온 Uint8Array를 렌더러에서 Blob으로 래핑.
            // TS의 Uint8Array<ArrayBufferLike> vs Blob의 ArrayBufferView<ArrayBuffer>
            // 타입 충돌을 피하려고 BlobPart로 캐스팅 (런타임 안전).
            const blob = new Blob([buf as unknown as BlobPart], { type: 'image/png' })
            src = URL.createObjectURL(blob)
            revokeAfterLoad = src
          }
        } catch (e) {
          console.error('[editor] loadImageBuffer 실패:', e)
        }
      }
      if (!src && data.dataUrl) {
        src = data.dataUrl
      }

      // 이전에 만든 Blob URL은 메모리 해제
      if (lastBlobUrlRef.current) {
        URL.revokeObjectURL(lastBlobUrlRef.current)
        lastBlobUrlRef.current = null
      }

      if (!src) {
        // 이미지가 없어도 창은 띄워야 사용자에게 피드백
        try {
          window.editor.readyToShow?.()
        } catch {
          /* ignore */
        }
        return
      }

      const image = new Image()
      image.onload = () => {
        setImg(image)
        setMosaicImg(null) // v0.6.0: 모자이크는 lazy 계산
        setShapes([])
        setRedoStack([])
        setZoom(null) // v0.7.1: 새 이미지는 자동 fit
        setPendingCrop(null) // v0.7.2
        lastBlobUrlRef.current = revokeAfterLoad
        try {
          window.editor.readyToShow?.()
        } catch {
          /* ignore */
        }
      }
      image.onerror = (err) => {
        console.error('[editor] image.onerror:', err)
        if (revokeAfterLoad) URL.revokeObjectURL(revokeAfterLoad)
        try {
          window.editor.readyToShow?.()
        } catch {
          /* ignore */
        }
      }
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

  // v0.7.1: 컨테이너 크기만 측정 (Stage viewport = container 전체)
  useEffect(() => {
    const update = (): void => {
      if (!containerRef.current) return
      const { clientWidth, clientHeight } = containerRef.current
      setContainerSize({ width: clientWidth, height: clientHeight })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // 자동 fit 계산
  const computeFitZoom = useCallback((): number => {
    if (!img) return 1
    const pad = 40
    const maxW = Math.max(100, containerSize.width - pad)
    const maxH = Math.max(100, containerSize.height - pad)
    return Math.min(maxW / img.width, maxH / img.height, 1)
  }, [img, containerSize])

  const applyFit = useCallback((): void => {
    if (!img) return
    const fit = computeFitZoom()
    setZoom(fit)
    setPan({
      x: (containerSize.width - img.width * fit) / 2,
      y: (containerSize.height - img.height * fit) / 2
    })
  }, [img, containerSize, computeFitZoom])

  const applyActualSize = useCallback((): void => {
    if (!img) return
    setZoom(1)
    setPan({
      x: (containerSize.width - img.width) / 2,
      y: (containerSize.height - img.height) / 2
    })
  }, [img, containerSize])

  // 이미지 or 컨테이너 첫 로드 시 fit 자동 적용 (zoom이 null일 때만)
  useEffect(() => {
    if (zoom === null && img && containerSize.width > 0) {
      applyFit()
    }
  }, [img, containerSize, zoom, applyFit])

  // v0.7.1: 휠 이벤트 — 일반: 세로 스크롤, Shift+: 가로 스크롤, Ctrl/Cmd+: 줌
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (ev: WheelEvent): void => {
      if (!img || zoom === null) return
      ev.preventDefault()
      if (ev.ctrlKey || ev.metaKey) {
        // 커서 위치 기준 줌
        const rect = el.getBoundingClientRect()
        const pointer = { x: ev.clientX - rect.left, y: ev.clientY - rect.top }
        const mousePt = {
          x: (pointer.x - pan.x) / zoom,
          y: (pointer.y - pan.y) / zoom
        }
        const factor = ev.deltaY > 0 ? 0.9 : 1.1
        const newZoom = Math.max(0.05, Math.min(10, zoom * factor))
        setZoom(newZoom)
        setPan({
          x: pointer.x - mousePt.x * newZoom,
          y: pointer.y - mousePt.y * newZoom
        })
      } else {
        // 일반 스크롤: 패닝으로 구현
        const dx = ev.shiftKey ? -ev.deltaY : -ev.deltaX
        const dy = ev.shiftKey ? 0 : -ev.deltaY
        setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [img, zoom, pan.x, pan.y])

  // 실효 zoom (스테이지 transform)
  const scale = zoom ?? 1

  // --- Drawing handlers ---
  // v0.7.1: pan 오프셋 고려한 이미지 좌표 계산
  const getPointer = useCallback((): { x: number; y: number } | null => {
    const stage = stageRef.current
    if (!stage) return null
    const p = stage.getPointerPosition()
    if (!p) return null
    return { x: (p.x - pan.x) / scale, y: (p.y - pan.y) / scale }
  }, [scale, pan.x, pan.y])

  const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    if (!img) return
    // v0.7.1: 선택 도구 = 팬 모드. 드래그로 이미지 이동.
    if (tool === 'select') {
      setIsPanning(true)
      panStartRef.current = {
        mouseX: e.evt.clientX,
        mouseY: e.evt.clientY,
        panX: pan.x,
        panY: pan.y
      }
      return
    }
    const pos = getPointer()
    if (!pos) return
    // v0.7.2: 자르기 도구
    if (tool === 'crop') {
      setPendingCrop({ x: pos.x, y: pos.y, width: 0, height: 0 })
      setCropDragging(true)
      return
    }
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

  const onMouseMove = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    // v0.7.1: 팬 모드 처리
    if (isPanning && panStartRef.current) {
      const dx = e.evt.clientX - panStartRef.current.mouseX
      const dy = e.evt.clientY - panStartRef.current.mouseY
      setPan({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy
      })
      return
    }
    // v0.7.2: 자르기 드래그
    if (cropDragging && pendingCrop) {
      const pos = getPointer()
      if (!pos) return
      setPendingCrop({
        ...pendingCrop,
        width: pos.x - pendingCrop.x,
        height: pos.y - pendingCrop.y
      })
      return
    }
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
    // v0.7.1: 팬 종료
    if (isPanning) {
      setIsPanning(false)
      panStartRef.current = null
      return
    }
    // v0.7.2: 자르기 드래그 종료
    if (cropDragging) {
      setCropDragging(false)
      if (pendingCrop) {
        const { x, y, width, height } = pendingCrop
        const norm = {
          x: width < 0 ? x + width : x,
          y: height < 0 ? y + height : y,
          width: Math.abs(width),
          height: Math.abs(height)
        }
        if (norm.width < 4 || norm.height < 4) {
          setPendingCrop(null)
        } else {
          // 이미지 바깥으로 나간 부분은 clip
          if (img) {
            const x2 = Math.min(norm.x + norm.width, img.width)
            const y2 = Math.min(norm.y + norm.height, img.height)
            const x1 = Math.max(norm.x, 0)
            const y1 = Math.max(norm.y, 0)
            setPendingCrop({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 })
          } else {
            setPendingCrop(norm)
          }
        }
      }
      return
    }
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
    // v0.7.1: pan/zoom과 무관하게 원본 이미지 영역만 원본 해상도로 export
    return stageRef.current.toDataURL({
      x: pan.x,
      y: pan.y,
      width: img.width * scale,
      height: img.height * scale,
      pixelRatio: 1 / scale,
      mimeType: 'image/png'
    })
  }, [scale, img, pan.x, pan.y])

  const [toast, setToast] = useState<string | null>(null)
  const showToast = useCallback((msg: string): void => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }, [])

  const onSave = useCallback(async () => {
    const dataUrl = exportImage()
    if (!dataUrl) {
      showToast('저장할 이미지가 없어요')
      return
    }
    try {
      const full = await window.editor.save(dataUrl, 'png')
      console.log('saved to', full)
      showToast('저장 완료: ' + full)
    } catch (e) {
      showToast('저장 실패: ' + ((e as Error)?.message ?? 'unknown'))
    }
  }, [exportImage, showToast])

  const onCopy = useCallback(async () => {
    const dataUrl = exportImage()
    if (!dataUrl) return
    try {
      await window.editor.copy(dataUrl)
      showToast('클립보드에 복사됨')
    } catch (e) {
      showToast('복사 실패: ' + ((e as Error)?.message ?? 'unknown'))
    }
  }, [exportImage, showToast])

  const onClose = useCallback(async () => {
    await window.editor.close()
  }, [])

  // v0.7.2: 자르기 적용 — 현재 Stage를 crop 영역만 원본 해상도로 export
  // 후 새 이미지로 교체. 기존 편집은 새 이미지에 베이크됨.
  const applyCrop = useCallback((): void => {
    if (!pendingCrop || !stageRef.current || !img) return
    if (pendingCrop.width < 4 || pendingCrop.height < 4) return
    try {
      const dataUrl = stageRef.current.toDataURL({
        x: pan.x + pendingCrop.x * scale,
        y: pan.y + pendingCrop.y * scale,
        width: pendingCrop.width * scale,
        height: pendingCrop.height * scale,
        pixelRatio: 1 / scale, // 원본 해상도로 복원
        mimeType: 'image/png'
      })
      const newImg = new Image()
      newImg.onload = () => {
        setImg(newImg)
        setShapes([])
        setRedoStack([])
        setMosaicImg(null)
        setZoom(null) // 새 이미지 자동 fit
        setPendingCrop(null)
        setTool('pen')
      }
      newImg.onerror = () => {
        setPendingCrop(null)
      }
      newImg.src = dataUrl
    } catch (e) {
      console.error('[editor] applyCrop', e)
      setPendingCrop(null)
    }
  }, [pendingCrop, img, pan.x, pan.y, scale])

  const cancelCrop = useCallback((): void => {
    setPendingCrop(null)
  }, [])

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      // v0.7.2: 자르기 중이면 Enter = 적용, Esc = 취소 우선
      if (pendingCrop && !cropDragging) {
        if (e.key === 'Enter') {
          e.preventDefault()
          applyCrop()
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          cancelCrop()
          return
        }
      }
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
  }, [onSave, onCopy, onClose, undo, redo, editingTextId, pendingCrop, cropDragging, applyCrop, cancelCrop])

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
        zoomPercent={Math.round(scale * 100)}
        onFit={applyFit}
        onActualSize={applyActualSize}
      />
      <div ref={containerRef} className="flex-1 overflow-hidden relative" style={{ background: '#0b1220' }}>
        {img ? (
          <Stage
            ref={stageRef}
            width={containerSize.width}
            height={containerSize.height}
            scaleX={scale}
            scaleY={scale}
            x={pan.x}
            y={pan.y}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            style={{
              background: '#0b1220',
              cursor:
                tool === 'select'
                  ? isPanning
                    ? 'grabbing'
                    : 'grab'
                  : tool === 'text'
                    ? 'text'
                    : 'crosshair'
            }}
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
            {/* v0.7.2: 자르기 미리보기 오버레이 */}
            {pendingCrop && img && (() => {
              // 드래그 중에는 음수 width/height 가능 → 시각화용 정규화
              const x = pendingCrop.width < 0 ? pendingCrop.x + pendingCrop.width : pendingCrop.x
              const y = pendingCrop.height < 0 ? pendingCrop.y + pendingCrop.height : pendingCrop.y
              const width = Math.abs(pendingCrop.width)
              const height = Math.abs(pendingCrop.height)
              // dim 영역 4개 (top, bottom, left, right) + 선택 테두리
              return (
                <Layer listening={false}>
                  {/* top */}
                  <Rect x={0} y={0} width={img.width} height={Math.max(0, y)} fill="rgba(0,0,0,0.55)" />
                  {/* bottom */}
                  <Rect
                    x={0}
                    y={y + height}
                    width={img.width}
                    height={Math.max(0, img.height - (y + height))}
                    fill="rgba(0,0,0,0.55)"
                  />
                  {/* left */}
                  <Rect
                    x={0}
                    y={y}
                    width={Math.max(0, x)}
                    height={height}
                    fill="rgba(0,0,0,0.55)"
                  />
                  {/* right */}
                  <Rect
                    x={x + width}
                    y={y}
                    width={Math.max(0, img.width - (x + width))}
                    height={height}
                    fill="rgba(0,0,0,0.55)"
                  />
                  {/* 테두리 */}
                  <Rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    stroke="#3B82F6"
                    strokeWidth={1.5 / scale}
                    dash={[6 / scale, 4 / scale]}
                  />
                </Layer>
              )
            })()}
          </Stage>
        ) : (
          <div className="text-gray-400">이미지 불러오는 중...</div>
        )}

        {/* v0.7.2: 자르기 적용/취소 버튼 (드래그 끝나면 등장) */}
        {pendingCrop && !cropDragging && pendingCrop.width >= 4 && pendingCrop.height >= 4 && (
          <div
            className="absolute flex gap-2"
            style={{
              left: Math.max(
                8,
                Math.min(
                  containerSize.width - 220,
                  pan.x + pendingCrop.x * scale
                )
              ),
              top: Math.min(
                containerSize.height - 50,
                pan.y + (pendingCrop.y + pendingCrop.height) * scale + 8
              ),
              zIndex: 500
            }}
          >
            <button
              onClick={cancelCrop}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs rounded shadow-lg border border-gray-600"
              title="취소 (Esc)"
            >
              취소
            </button>
            <button
              onClick={applyCrop}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded shadow-lg font-semibold"
              title="자르기 적용 (Enter)"
            >
              ✓ 자르기 적용
            </button>
          </div>
        )}
        {/* v0.6.4: 저장/복사 결과 토스트 */}
        {toast && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/85 text-white text-xs px-4 py-2 rounded-lg shadow-lg pointer-events-none max-w-[90%] truncate"
            style={{ zIndex: 1000 }}
          >
            {toast}
          </div>
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
