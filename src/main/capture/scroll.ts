import { nativeImage, screen } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { captureRegionMac } from './mac'
import { captureRegionWin } from './win'
import { openRegionOverlay } from '../windows/overlay'
import { openEditorWithImage } from '../windows/editor'
import {
  openScrollController,
  closeScrollController,
  updateScrollControllerStatus
} from '../windows/scrollController'
import type { CaptureResult } from '../../shared/types'

/**
 * v0.7.0 스크롤 캡처 (A안 — 반자동):
 *
 * 1. 사용자가 Ctrl+Shift+V → 기존 region 오버레이로 영역 선택
 * 2. 선택 완료 → scrollController 창 표시 + 주기적 폴링 시작
 * 3. 250ms마다 해당 영역 캡처 → 이전 프레임과 diff → 변경됐으면 append
 * 4. 사용자가 [완료] → 프레임들을 row-hash 기반 overlap 감지로 이어붙여 편집기
 * 5. [취소] → 세션 버림
 */

interface ScrollFrame {
  bitmap: Buffer // BGRA raw pixels
  width: number
  height: number
  hash: string // 전체 해시 (변경 감지용)
}

interface ScrollSession {
  bounds: { x: number; y: number; width: number; height: number } // absolute screen coords
  displayId: number
  scaleFactor: number
  frames: ScrollFrame[]
  pollTimer: NodeJS.Timeout | null
  lastCaptureHash: string | null
  isFinishing: boolean
}

const POLL_INTERVAL_MS = 280

let session: ScrollSession | null = null
let scrollMode = false

const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'

/** Ctrl+Shift+V → 오버레이 띄우고 scroll 모드로 표시 */
export async function startScrollCapture(): Promise<void> {
  if (session) return // 이미 진행 중
  scrollMode = true
  try {
    await openRegionOverlay()
  } catch (e) {
    scrollMode = false
    console.error('[scroll] startScrollCapture', e)
  }
}

export function isScrollSelectionPending(): boolean {
  return scrollMode
}

export function consumeScrollSelectionFlag(): boolean {
  const v = scrollMode
  scrollMode = false
  return v
}

/** 영역 선택 완료 → 세션 시작 + 폴링 개시 */
export async function beginScrollSession(
  bounds: { x: number; y: number; width: number; height: number },
  displayId: number,
  scaleFactor: number
): Promise<void> {
  // 기존 세션 청소
  cleanupSession()

  session = {
    bounds,
    displayId,
    scaleFactor,
    frames: [],
    pollTimer: null,
    lastCaptureHash: null,
    isFinishing: false
  }

  openScrollController()
  updateScrollControllerStatus({ frameCount: 0, isCapturing: true })

  // 첫 프레임 즉시 캡처
  await captureAndMaybeAppend()

  // 주기적 폴링
  session.pollTimer = setInterval(() => {
    captureAndMaybeAppend().catch((e) => console.warn('[scroll] poll capture err', e))
  }, POLL_INTERVAL_MS)
}

async function captureAndMaybeAppend(): Promise<void> {
  if (!session || session.isFinishing) return
  const { bounds } = session

  let buf: Buffer
  try {
    if (isMac) {
      buf = await captureRegionMac(bounds.x, bounds.y, bounds.width, bounds.height)
    } else if (isWin) {
      buf = await captureRegionWin(bounds.x, bounds.y, bounds.width, bounds.height)
    } else {
      return
    }
  } catch (e) {
    console.warn('[scroll] capture fail:', (e as Error).message)
    return
  }

  const hash = crypto.createHash('md5').update(buf).digest('hex')
  // 이전 캡처와 100% 동일(스크롤 멈춤)이면 skip
  if (hash === session.lastCaptureHash) return
  session.lastCaptureHash = hash

  // 첫 프레임은 무조건 추가
  if (session.frames.length === 0) {
    const frame = decodeFrame(buf, hash)
    if (frame) session.frames.push(frame)
    updateScrollControllerStatus({
      frameCount: session.frames.length,
      isCapturing: true
    })
    return
  }

  // 두 번째 이후: 이전 "추가된 프레임"과 동일하면 skip
  const last = session.frames[session.frames.length - 1]
  if (last.hash === hash) return

  const frame = decodeFrame(buf, hash)
  if (frame) session.frames.push(frame)
  updateScrollControllerStatus({
    frameCount: session.frames.length,
    isCapturing: true
  })
}

function decodeFrame(pngBuf: Buffer, hash: string): ScrollFrame | null {
  const img = nativeImage.createFromBuffer(pngBuf)
  if (img.isEmpty()) return null
  const size = img.getSize()
  const bitmap = img.getBitmap() // BGRA
  return { bitmap, width: size.width, height: size.height, hash }
}

/** [완료] — 스티치 후 편집기 */
export async function finishScrollCapture(): Promise<void> {
  if (!session) {
    closeScrollController()
    return
  }
  session.isFinishing = true
  if (session.pollTimer) clearInterval(session.pollTimer)
  session.pollTimer = null

  const frames = session.frames
  closeScrollController()

  if (frames.length === 0) {
    cleanupSession()
    return
  }

  try {
    let result: CaptureResult
    if (frames.length === 1) {
      // 프레임 하나면 그대로 저장
      const pngBuf = encodeFrameAsPng(frames[0])
      result = await saveAsTempPng(pngBuf, frames[0].width, frames[0].height)
    } else {
      const stitched = stitchFrames(frames)
      result = await saveAsTempPng(stitched.pngBuf, stitched.width, stitched.height)
    }
    await openEditorWithImage(result)
  } catch (e) {
    console.error('[scroll] stitch/save 실패:', e)
    try {
      const { Notification } = await import('electron')
      new Notification({
        title: '1초캡처 — 스크롤 캡처 실패',
        body: '프레임 합성 중 오류가 발생했어요: ' + (e as Error).message
      }).show()
    } catch {
      /* ignore */
    }
  } finally {
    cleanupSession()
  }
}

/** [취소] — 세션 폐기 */
export function cancelScrollCapture(): void {
  cleanupSession()
  closeScrollController()
}

function cleanupSession(): void {
  if (session?.pollTimer) clearInterval(session.pollTimer)
  session = null
}

/** @deprecated 이전 MVP 호환용 no-op */
export async function addScrollFrame(): Promise<null> {
  return null
}

// ============================================================================
// Row-hash 기반 이미지 스티칭
// ============================================================================

/**
 * 인접 프레임 간 overlap 높이를 찾는다.
 * prev 하단과 next 상단이 같은 row들을 찾아서 그 개수를 반환.
 *
 * - 각 row를 md5 해시로 축약 → O(H) 해시 계산 + O(H) 매칭
 * - exact match 기준 (픽셀이 정확히 같아야 overlap으로 간주)
 * - 1줄만 우연히 일치하는 false positive 방지: 최소 4줄 연속 일치 요구
 */
function hashRows(bitmap: Buffer, width: number, height: number): string[] {
  const rowBytes = width * 4
  const hashes: string[] = new Array(height)
  for (let y = 0; y < height; y++) {
    const h = crypto.createHash('md5')
    h.update(bitmap.subarray(y * rowBytes, (y + 1) * rowBytes))
    hashes[y] = h.digest('hex')
  }
  return hashes
}

function findOverlap(prev: ScrollFrame, next: ScrollFrame): number {
  if (prev.width !== next.width) return 0
  const MIN_MATCH = 4
  const MAX_SEARCH = Math.min(prev.height, next.height, 600)

  const prevHashes = hashRows(prev.bitmap, prev.width, prev.height)
  const nextHashes = hashRows(next.bitmap, next.width, next.height)

  const firstNextHash = nextHashes[0]

  // prev 하단 MAX_SEARCH 범위에서 firstNextHash와 일치하는 row 찾기.
  // 가장 큰 overlap(= prev에서 제일 위쪽 시작점)부터 검사해 최대 겹침 선택.
  const startMin = Math.max(0, prev.height - MAX_SEARCH)
  for (let startY = startMin; startY < prev.height; startY++) {
    if (prevHashes[startY] !== firstNextHash) continue

    const candidateOverlap = prev.height - startY
    // 너무 작으면 의미 없음 (랜덤 일치 가능성)
    // 다만 1줄뿐이면 그냥 넘김
    let matchCount = 0
    const maxMatch = Math.min(candidateOverlap, next.height)
    for (let i = 0; i < maxMatch; i++) {
      if (prevHashes[startY + i] !== nextHashes[i]) break
      matchCount++
    }
    if (matchCount >= MIN_MATCH && matchCount === candidateOverlap) {
      // prev 맨 끝까지 이어지는 일치가 발견됨 = 이게 overlap
      return candidateOverlap
    }
  }
  return 0
}

/**
 * 여러 프레임을 세로로 이어붙여 하나의 긴 이미지로.
 * 각 프레임의 overlap만큼을 다음 프레임에서 잘라낸 뒤 합침.
 */
function stitchFrames(frames: ScrollFrame[]): {
  pngBuf: Buffer
  width: number
  height: number
} {
  const width = frames[0].width
  const segments: Array<{ frame: ScrollFrame; skipTop: number; useHeight: number }> = []

  segments.push({ frame: frames[0], skipTop: 0, useHeight: frames[0].height })

  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1]
    const next = frames[i]
    if (next.width !== width) {
      // 너비 다르면 매칭 skip, 그냥 추가
      segments.push({ frame: next, skipTop: 0, useHeight: next.height })
      continue
    }
    const overlap = findOverlap(prev, next)
    const useHeight = next.height - overlap
    if (useHeight <= 0) {
      // 새 내용 없음 — skip
      continue
    }
    segments.push({ frame: next, skipTop: overlap, useHeight })
  }

  const totalHeight = segments.reduce((sum, s) => sum + s.useHeight, 0)
  const rowBytes = width * 4
  const out = Buffer.alloc(rowBytes * totalHeight)
  let destY = 0
  for (const s of segments) {
    const srcStart = s.skipTop * rowBytes
    const byteCount = s.useHeight * rowBytes
    s.frame.bitmap.copy(out, destY * rowBytes, srcStart, srcStart + byteCount)
    destY += s.useHeight
  }

  const img = nativeImage.createFromBitmap(out, {
    width,
    height: totalHeight,
    scaleFactor: 1
  })
  return { pngBuf: img.toPNG(), width, height: totalHeight }
}

function encodeFrameAsPng(f: ScrollFrame): Buffer {
  const img = nativeImage.createFromBitmap(f.bitmap, {
    width: f.width,
    height: f.height,
    scaleFactor: 1
  })
  return img.toPNG()
}

async function saveAsTempPng(
  buf: Buffer,
  w: number,
  h: number
): Promise<CaptureResult> {
  const tmpPath = path.join(
    os.tmpdir(),
    `1cho_scroll_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`
  )
  await fs.writeFile(tmpPath, buf)
  return { filePath: tmpPath, width: w, height: h }
}

/** For deprecation compatibility with old code in ipc.ts. */
void screen // keep import; may be used later
