import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const execFileP = promisify(execFile)

function tmpPng(): string {
  return path.join(os.tmpdir(), `1cho_${Date.now()}_${Math.random().toString(36).slice(2)}.png`)
}

/** Capture entire main display using macOS `screencapture`. Returns PNG as Buffer. */
export async function captureFullScreenMac(): Promise<Buffer> {
  const p = tmpPng()
  // -x: 소리 없이, -C: 커서 포함 안함 기본
  await execFileP('/usr/sbin/screencapture', ['-x', p])
  const buf = await fs.readFile(p)
  await fs.unlink(p).catch(() => undefined)
  return buf
}

/**
 * Capture a specific region of the screen using macOS `screencapture -R`.
 * 좌표는 virtual screen 기준 logical points (Retina 자동 처리).
 * 캡처 당시 화면에 보이는 모든 윈도우가 포함되므로, 호출 전에 오버레이 창이 hide 상태여야 한다.
 */
export async function captureRegionMac(
  x: number,
  y: number,
  w: number,
  h: number
): Promise<Buffer> {
  const p = tmpPng()
  await execFileP('/usr/sbin/screencapture', [
    '-x', // no sound
    '-R',
    `${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}`,
    p
  ])
  const buf = await fs.readFile(p)
  await fs.unlink(p).catch(() => undefined)
  return buf
}

/**
 * v0.9.4: 지정 경로에 직접 저장하는 영역 캡처 (스냅샷용).
 * 기존 captureRegionMac 은 임시 파일 → 읽기 → 삭제 → 재쓰기 로 파일 I/O 가
 * 2배였는데, 스냅샷은 경로만 필요하므로 screencapture 가 바로 최종 경로에 쓰게 함.
 */
export async function captureRegionMacToFile(
  x: number,
  y: number,
  w: number,
  h: number,
  outPath: string
): Promise<void> {
  await execFileP('/usr/sbin/screencapture', [
    '-x',
    '-R',
    `${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}`,
    outPath
  ])
}

/** Capture all displays separately. Returns Buffer[] in display order. */
export async function captureAllDisplaysMac(): Promise<Buffer[]> {
  // screencapture -x file1.png file2.png ... for each display in order
  const paths: string[] = []
  // figure out display count via system_profiler would be overkill; try up to 4 and ignore missing
  for (let i = 0; i < 4; i++) paths.push(tmpPng())
  // -D N specifies which display (1-indexed); we'll capture individually
  const results: Buffer[] = []
  for (let i = 0; i < 4; i++) {
    const p = paths[i]
    try {
      await execFileP('/usr/sbin/screencapture', ['-x', '-D', String(i + 1), p])
      const buf = await fs.readFile(p)
      results.push(buf)
      await fs.unlink(p).catch(() => undefined)
    } catch {
      break
    }
  }
  return results
}
