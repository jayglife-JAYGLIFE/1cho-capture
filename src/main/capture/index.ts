import { desktopCapturer, screen } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
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
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 4096, height: 4096 }
    })
    buf = sources[0].thumbnail.toPNG()
  }
  return bufferToResult(buf)
}

/**
 * v0.6.0+: 캡처 버퍼를 임시 파일로 저장해 경로를 반환한다.
 * base64 직렬화 + IPC 전송 + 파싱의 비용을 없애 편집기 표시 지연이 크게 줄어든다.
 */
async function bufferToResult(buf: Buffer): Promise<CaptureResult> {
  const tmpPath = path.join(
    os.tmpdir(),
    `1cho_cap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`
  )
  await fs.writeFile(tmpPath, buf)
  return { filePath: tmpPath, width: 0, height: 0 }
}

/** 앱 시작 시 이전 실행에서 남은 임시 캡처 파일 정리. */
export async function cleanupTempCaptures(): Promise<void> {
  try {
    const dir = os.tmpdir()
    const names = await fs.readdir(dir)
    await Promise.all(
      names
        .filter((n) => /^1cho_cap_\d+_[a-z0-9]+\.png$/.test(n))
        .map((n) => fs.unlink(path.join(dir, n)).catch(() => undefined))
    )
  } catch {
    /* ignore */
  }
}

/**
 * 특정 영역만 캡처 (v0.3.1+). v0.6.0부터는 임시 파일 경로로 반환.
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
    buf = cropped.toPNG()
  }
  const res = await bufferToResult(buf)
  res.width = Math.round(w)
  res.height = Math.round(h)
  return res
}

/** Capture primary display only. */
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
