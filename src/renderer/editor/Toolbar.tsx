import type { Tool } from './types'

interface ToolbarProps {
  tool: Tool
  color: string
  strokeWidth: number
  onToolChange: (t: Tool) => void
  onColorChange: (c: string) => void
  onStrokeChange: (n: number) => void
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  /** v0.7.8: 다른 이름으로 저장 (파일 다이얼로그) */
  onSaveAs?: () => void
  onCopy: () => void
  onClose: () => void
  canUndo: boolean
  canRedo: boolean
  /** v0.7.1: 줌/패닝 */
  zoomPercent?: number
  onFit?: () => void
  onActualSize?: () => void
}

const TOOLS: Array<{ id: Tool; label: string; icon: string }> = [
  { id: 'select', label: '이동/팬', icon: '✋' },
  { id: 'crop', label: '자르기', icon: '✂' },
  { id: 'pen', label: '펜', icon: '✎' },
  { id: 'line', label: '직선', icon: '／' },
  { id: 'arrow', label: '화살표', icon: '➜' },
  { id: 'rect', label: '사각형', icon: '▢' },
  { id: 'ellipse', label: '원', icon: '◯' },
  { id: 'text', label: '텍스트', icon: 'T' },
  { id: 'mosaic', label: '모자이크', icon: '🟫' }
]

const COLORS = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#111827', '#FFFFFF']

export function Toolbar(props: ToolbarProps): JSX.Element {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          title={t.label}
          onClick={() => props.onToolChange(t.id)}
          className={`w-10 h-10 flex items-center justify-center rounded text-lg transition ${
            props.tool === t.id
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
          }`}
        >
          {t.icon}
        </button>
      ))}

      <div className="w-px h-8 bg-gray-700 mx-2" />

      <div className="flex items-center gap-1">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => props.onColorChange(c)}
            className={`w-6 h-6 rounded-full border-2 ${
              props.color === c ? 'border-white' : 'border-gray-600'
            }`}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
      </div>

      <div className="w-px h-8 bg-gray-700 mx-2" />

      <label className="flex items-center gap-2 text-xs text-gray-300">
        굵기
        <input
          type="range"
          min={1}
          max={30}
          value={props.strokeWidth}
          onChange={(e) => props.onStrokeChange(Number(e.target.value))}
          className="w-24"
        />
        <span className="w-6 text-right">{props.strokeWidth}</span>
      </label>

      <div className="flex-1" />

      {/* v0.7.1 줌 UI */}
      {props.zoomPercent !== undefined && (
        <>
          <button
            onClick={props.onFit}
            title="화면에 맞춤"
            className="px-2 h-8 rounded bg-gray-700 hover:bg-gray-600 text-xs"
          >
            맞춤
          </button>
          <button
            onClick={props.onActualSize}
            title="실제 크기 (100%)"
            className="px-2 h-8 rounded bg-gray-700 hover:bg-gray-600 text-xs"
          >
            100%
          </button>
          <span
            title="현재 줌 (Ctrl/⌘+휠로 조절)"
            className="px-2 min-w-[52px] text-center text-xs text-gray-300 font-mono"
          >
            {props.zoomPercent}%
          </span>
          <div className="w-px h-8 bg-gray-700 mx-2" />
        </>
      )}

      <button
        onClick={props.onUndo}
        disabled={!props.canUndo}
        title="되돌리기 (Cmd/Ctrl+Z)"
        className="w-10 h-10 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        ↶
      </button>
      <button
        onClick={props.onRedo}
        disabled={!props.canRedo}
        title="다시 실행 (Cmd/Ctrl+Y)"
        className="w-10 h-10 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        ↷
      </button>

      <div className="w-px h-8 bg-gray-700 mx-2" />

      <button
        onClick={props.onCopy}
        title="클립보드 복사 (Cmd/Ctrl+C)"
        className="px-3 h-10 rounded bg-gray-700 hover:bg-gray-600 text-sm"
      >
        복사
      </button>
      {props.onSaveAs && (
        <button
          onClick={props.onSaveAs}
          title="다른 이름으로 저장... (Cmd/Ctrl+Shift+S)"
          className="px-3 h-10 rounded bg-gray-700 hover:bg-gray-600 text-sm"
        >
          다른 이름으로…
        </button>
      )}
      <button
        onClick={props.onSave}
        title="저장 (Cmd/Ctrl+S)"
        className="px-4 h-10 rounded bg-blue-600 hover:bg-blue-500 text-sm font-semibold"
      >
        저장
      </button>
      <button
        onClick={props.onClose}
        title="닫기 (Esc)"
        className="w-10 h-10 rounded bg-gray-700 hover:bg-gray-600"
      >
        ✕
      </button>
    </div>
  )
}
