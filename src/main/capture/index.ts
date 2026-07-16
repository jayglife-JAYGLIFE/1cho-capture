import { desktopCapturer, screen } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { captureFullScreenMac, captureRegionMac } from './mac'
import { captureFullScreenWin, captureRegionWin } from './win'
import type { CaptureResult, WindowSource } from '../../shared/types'

const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'

/**
 * v0.9.2: Windows 캡처를 PowerShell CopyFromScreen → Electron desktopCapturer 로 교체.
 *
 * PowerShell 5.1 은 "시스템 DPI 인식"(로그인 시점 주 모니터 배율 고정)이라,
 * 로그인 후 배율 변경/배율 다른 모니터 연결 등의 조건에서 화면을 실제보다 작게
 * 인식해 좌상단 일부만 캡처하는 버그가 있었음 (화면 잘림, 작업표시줄 누락,
 * 스냅샷 확대 증상). desktopCapturer 는 Electron 이 모니터별 DPI 를 직접
 * 처리하므로 좌표계 어긋남이 원천적으로 없음. 실패 시 PowerShell 폴백.
 */

/** 특정 디스플레이 1개를 desktopCapturer 로 물리 해상도 그대로 캡처. */
async function captureDisplayWinDC(display: Electron.Display): Promise<Buffer> {
  const physRect = screen.dipToScreenRect(null, display.bounds)
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: physRect.width, height: physRect.height }
  })
  const src =
    sources.find((s) => (s as { display_id?: string }).display_id === String(display.id)) ??
    (sources.length === 1 ? sources[0] : undefined)
  if (!src) throw new Error('desktopCapturer: 해당 디스플레이 소스를 찾지 못함')
  let img = src.thumbnail
  if (img.isEmpty()) throw new Error('desktopCapturer: 빈 이미지')
  const size = img.getSize()
  // thumbnailSize 는 aspect-fit 이라 요청 크기와 미세하게 다를 수 있음 → 보정
  if (size.width !== physRect.width || size.height !== physRect.height) {
    img = img.resize({ width: physRect.width, height: physRect.height })
  }
  return img.toPNG()
}

/**
 * Windows: 물리 가상화면 좌표 (x,y,w,h) 영역을 desktopCapturer 로 캡처.
 * 영역 중심이 속한 디스플레이를 통째로 찍은 뒤 crop.
 */
export async function captureRegionWinDC(
  x: number,
  y: number,
  w: number,
  h: number
): Promise<Buffer> {
  const displays = screen.getAllDisplays()
  const cx = x + w / 2
  const cy = y + h / 2
  let target = displays[0]
  let targetRect = screen.dipToScreenRect(null, displays[0].bounds)
  for (const d of displays) {
    const r = screen.dipToScreenRect(null, d.bounds)
    if (cx >= r.x && cx < r.x + r.width && cy >= r.y && cy < r.y + r.height) {
      target = d
      targetRect = r
      break
    }
  }
  const buf = await captureDisplayWinDC(target)
  const { nativeImage } = await import('electron')
  const full = nativeImage.createFromBuffer(buf)
  const size = full.getSize()
  const cropX = Math.max(0, Math.min(size.width - 1, Math.round(x - targetRect.x)))
  const cropY = Math.max(0, Math.min(size.height - 1, Math.round(y - targetRect.y)))
  const cropW = Math.max(1, Math.min(size.width - cropX, Math.round(w)))
  const cropH = Math.max(1, Math.min(size.height - cropY, Math.round(h)))
  return full.crop({ x: cropX, y: cropY, width: cropW, height: cropH }).toPNG()
}

/** Capture the full screen (Windows: 커서가 있는 디스플레이, Mac: 주 디스플레이). */
export async function captureFullScreen(): Promise<CaptureResult> {
  let buf: Buffer
  if (isMac) {
    buf = await captureFullScreenMac()
  } else if (isWin) {
    try {
      const cursor = screen.getCursorScreenPoint()
      const display = screen.getDisplayNearestPoint(cursor)
      buf = await captureDisplayWinDC(display)
    } catch (e) {
      console.warn('[capture] desktopCapturer 실패 → PowerShell 폴백:', e)
      buf = await captureFullScreenWin()
    }
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
    try {
      buf = await captureRegionWinDC(x, y, w, h)
    } catch (e) {
      console.warn('[capture] desktopCapturer region 실패 → PowerShell 폴백:', e)
      buf = await captureRegionWin(x, y, w, h)
    }
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
