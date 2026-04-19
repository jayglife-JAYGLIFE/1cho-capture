import type { ToolbarBridge, ToolbarCaptureMode } from '../../shared/bridge'

declare global {
  interface Window {
    toolbarApi: ToolbarBridge
  }
}

interface Btn {
  id: ToolbarCaptureMode
  label: string
  icon: string
  shortcut: string
}

const BUTTONS: Btn[] = [
  { id: 'region', label: '영역', icon: '▢', shortcut: 'Ctrl+Shift+C' },
  { id: 'fullscreen', label: '전체', icon: '◻', shortcut: 'Ctrl+Shift+Z' },
  { id: 'window', label: '창', icon: '▤', shortcut: 'Ctrl+Shift+X' },
  { id: 'scroll', label: '스크롤', icon: '⇣', shortcut: 'Ctrl+Shift+V' }
]

export function Toolbar(): JSX.Element {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'linear-gradient(180deg, rgba(31,41,55,0.98) 0%, rgba(17,24,39,0.98) 100%)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'nowrap',
        whiteSpace: 'nowrap',
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)',
        padding: '0 8px',
        fontSize: 12,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif',
        userSelect: 'none',
        // 창 전체 드래그 가능 (개별 버튼은 -webkit-app-region: no-drag으로 제외)
        WebkitAppRegion: 'drag'
      } as React.CSSProperties}
    >
      {/* 로고/드래그 핸들 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 10px',
          color: '#9CA3AF',
          fontWeight: 600,
          fontSize: 12,
          whiteSpace: 'nowrap',
          flexShrink: 0
        }}
      >
        <span style={{ fontSize: 14 }}>📸</span>
        <span>1초캡처</span>
      </div>

      {/* 구분선 */}
      <div
        style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }}
      />

      {/* 캡처 버튼들 */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          flex: 1,
          padding: '0 4px',
          flexWrap: 'nowrap'
        }}
      >
        {BUTTONS.map((b) => (
          <CaptureBtn
            key={b.id}
            label={b.label}
            icon={b.icon}
            title={`${b.label} 캡처 · ${b.shortcut}`}
            onClick={() => window.toolbarApi.capture(b.id)}
          />
        ))}
      </div>

      {/* 구분선 */}
      <div
        style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }}
      />

      {/* 설정/숨기기 */}
      <div style={{ display: 'flex', gap: 2 }}>
        <IconBtn title="설정" onClick={() => window.toolbarApi.settings()}>
          ⚙
        </IconBtn>
        <IconBtn title="툴바 숨기기 (트레이에서 다시 켤 수 있어요)" onClick={() => window.toolbarApi.hide()}>
          ✕
        </IconBtn>
      </div>
    </div>
  )
}

function CaptureBtn(props: {
  label: string
  icon: string
  title: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={props.onClick}
      title={props.title}
      style={
        {
          WebkitAppRegion: 'no-drag',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 10px',
          background: 'transparent',
          border: 'none',
          borderRadius: 6,
          color: '#E5E7EB',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          flexShrink: 0,
          transition: 'background 120ms'
        } as React.CSSProperties
      }
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(59,130,246,0.25)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
      }}
    >
      <span style={{ fontSize: 14, opacity: 0.85 }}>{props.icon}</span>
      <span>{props.label}</span>
    </button>
  )
}

function IconBtn(props: {
  title: string
  onClick: () => void
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={props.onClick}
      title={props.title}
      style={
        {
          WebkitAppRegion: 'no-drag',
          width: 26,
          height: 26,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          borderRadius: 6,
          color: '#9CA3AF',
          cursor: 'pointer',
          fontSize: 13,
          transition: 'background 120ms, color 120ms'
        } as React.CSSProperties
      }
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.background = 'rgba(255,255,255,0.08)'
        el.style.color = '#fff'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.background = 'transparent'
        el.style.color = '#9CA3AF'
      }}
    >
      {props.children}
    </button>
  )
}
