import { screen } from 'electron'
import { captureAllDisplaysForOverlay } from './index'
import { openEditorWithImage } from '../windows/editor'
import { openRegionOverlay } from '../windows/overlay'

interface ScrollSession {
  bounds: { x: number; y: number; width: number; height: number }
  displayId: number
  scaleFactor: number
  frames: string[] // data URLs of the cropped region
  active: boolean
}

let session: ScrollSession | null = null

/**
 * Start scroll capture: first open region overlay, then the renderer sends a
 * special "scroll selection" signal (same overlay, but we remember it as scroll
 * session). For MVP simplicity we let the user select a region via the regular
 * overlay; when `handleScrollSelection` is called, we keep polling for frames.
 */
export async function startScrollCapture(): Promise<void> {
  // Re-use region overlay but mark session as pending-scroll
  // We piggyback a flag: the renderer will call scroll:addFrame after initial selection.
  session = null
  await openRegionOverlay()
  // Actual frame capture begins when renderer calls addScrollFrame() with a region
}

/**
 * Called by a small "scroll control" panel (not implemented as separate window in MVP:
 * instead editor shows a "Add frame" button). Adds a new frame to the session.
 */
export async function addScrollFrame(): Promise<{ dataUrl: string; index: number } | null> {
  if (!session) return null
  const shots = await captureAllDisplaysForOverlay()
  const shot = shots.find((s) => s.displayId === session!.displayId)
  if (!shot) return null
  const { nativeImage } = await import('electron')
  const img = nativeImage.createFromDataURL(shot.dataUrl)
  const cropped = img.crop({
    x: Math.round(session.bounds.x * session.scaleFactor),
    y: Math.round(session.bounds.y * session.scaleFactor),
    width: Math.max(1, Math.round(session.bounds.width * session.scaleFactor)),
    height: Math.max(1, Math.round(session.bounds.height * session.scaleFactor))
  })
  const dataUrl = cropped.toDataURL()
  session.frames.push(dataUrl)
  return { dataUrl, index: session.frames.length - 1 }
}

/** Called when user finishes scrolling. Stitches frames and opens editor. */
export async function finishScrollCapture(): Promise<void> {
  if (!session || session.frames.length === 0) {
    session = null
    return
  }
  // Stitching happens in renderer (editor) for simplicity.
  // Main just passes frames via a special CaptureResult with `sourceBounds`.
  // We concat via a quick canvas stitch (with simple overlap detection) in renderer.
  const frames = session.frames
  session = null
  await openEditorWithImage({
    dataUrl: frames[0],
    width: 0,
    height: 0,
    sourceBounds: undefined
  })
  // We can't pass the full frames via CaptureResult type; extend it via a side channel later.
  // For MVP, only first frame is shown — stitch logic stubbed for follow-up.
}

export function cancelScrollCapture(): void {
  session = null
}

export function beginScrollSession(
  bounds: { x: number; y: number; width: number; height: number },
  displayId: number
): void {
  const displays = screen.getAllDisplays()
  const d = displays.find((x) => x.id === displayId)
  session = {
    bounds,
    displayId,
    scaleFactor: d?.scaleFactor ?? 1,
    frames: [],
    active: true
  }
}
