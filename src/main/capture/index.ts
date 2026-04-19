import { desktopCapturer, screen } from 'electron'
import { captureFullScreenMac, captureRegionMac } from './mac'
import { captureFullScreenWin, captureRegionWin } from './win'
import type { CaptureResult, WindowSource } from '../../shared/types'

const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'

/** Capture the full virtual screen (all displays combined on Windows, primary on Mac). */
export async function captureFullScreen(): Promise<CaptureResult> {
  let buf: Buffer
  if (isMac) {
    buf = await captureFullScreenMac()
  } else if (isWin) {
    buf = await captureFullScreenWin()
  } else {
    // Linux fallback via desktopCapturer
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 4096, height: 4096 }
    })
    buf = sources[0].thumbnail.toPNG()
  }
  return bufferToResult(buf)
}

function bufferToResult(buf: Buffer): CaptureResult {
  const dataUrl = `data:image/png;base64,${buf.toString('base64')}`
  // width/height are filled by renderer after load; main doesn't parse PNG header
  return { dataUrl, width: 0, height: 0 }
}

/**
 * 특정 영역만 캡처 (v0.3.1+).
 * 좌표는 virtual screen 기준 logical pixels.
 * 호출 전에 오버레이 창이 반드시 숨겨져 있어야 함.
 */
export async function captureRegion(
  x: number,
  y: number,
  w: number,
  h: number
): Promise<CaptureResult> {
  let buf: Buffer
  if (isMac) {
    buf = await captureRegionMac(x, y, w, h)
  } else if (isWin) {
    buf = await captureRegionWin(x, y, w, h)
  } else {
    // Linux fallback: 전체 화면 캡처 후 Electron nativeImage.crop 사용
    const { nativeImage } = await import('electron')
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 4096, height: 4096 }
    })
    const full = sources[0].thumbnail
    const cropped = full.crop({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(1, Math.round(w)),
      height: Math.max(1, Math.round(h))
    })
    return { dataUrl: cropped.toDataURL(), width: Math.round(w), height: Math.round(h) }
  }
  const dataUrl = `data:image/png;base64,${buf.toString('base64')}`
  return { dataUrl, width: Math.round(w), height: Math.round(h) }
}

/** Capture primary display only, returns data URL. */
export async function capturePrimaryDisplay(): Promise<CaptureResult> {
  if (isMac) {
    const buf = await captureFullScreenMac()
    return bufferToResult(buf)
  }
  if (isWin) {
    const buf = await captureFullScreenWin()
    return bufferToResult(buf)
  }
  return captureFullScreen()
}

/**
 * Capture screenshots of each display at full resolution using Electron desktopCapturer.
 * Used by region-capture overlay for background preview.
 */
export async function captureAllDisplaysForOverlay(): Promise<
  Array<{ displayId: number; dataUrl: string; bounds: Electron.Rectangle; scaleFactor: number }>
> {
  const displays = screen.getAllDisplays()
  const maxW = Math.max(...displays.map((d) => Math.round(d.bounds.width * d.scaleFactor)))
  const maxH = Math.max(...displays.map((d) => Math.round(d.bounds.height * d.scaleFactor)))
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: maxW, height: maxH }
  })

  const results: Array<{
    displayId: number
    dataUrl: string
    bounds: Electron.Rectangle
    scaleFactor: number
  }> = []

  // desktopCapturer source IDs look like "screen:0:0" - we map by index order
  // sources order is not guaranteed to match screen.getAllDisplays order, but
  // on most platforms source.display_id matches display.id when available
  for (let i = 0; i < displays.length; i++) {
    const d = displays[i]
    // try to find matching source by display_id
    const src =
      sources.find((s) => (s as { display_id?: string }).display_id === String(d.id)) ?? sources[i]
    if (!src) continue
    results.push({
      displayId: d.id,
      dataUrl: src.thumbnail.toDataURL(),
      bounds: d.bounds,
      scaleFactor: d.scaleFactor
    })
  }
  return results
}

/** List capturable windows for "window capture" flow. */
export async function listWindowSources(): Promise<WindowSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 300, height: 200 },
    fetchWindowIcons: false
  })
  return sources
    .filter((s) => s.name && s.name.trim().length > 0)
    .map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL()
    }))
}

/** Capture a specific window by its source ID at full resolution. */
export async function captureWindowBySourceId(sourceId: string): Promise<CaptureResult | null> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 4096, height: 4096 }
  })
  const src = sources.find((s) => s.id === sourceId)
  if (!src) return null
  return { dataUrl: src.thumbnail.toDataURL(), width: 0, height: 0 }
}
