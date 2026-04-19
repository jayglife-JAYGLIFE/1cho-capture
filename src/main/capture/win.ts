import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

/**
 * v0.6.0: PowerShell 프로세스를 한 번만 띄워두고 재사용해서 캡처 호출마다 드는
 * PS 기동 비용(~300ms)을 없앤다. 첫 캡처만 ~300ms, 이후는 ~50ms 수준.
 *
 * 방식:
 * - 앱 기동 시 PS를 "-NoProfile -NoLogo -NonInteractive -Command -"로 띄움
 *   (stdin에서 명령을 계속 받음)
 * - 캡처 요청마다 스크립트 + 고유 마커를 stdin에 쓰고 stdout에 마커가 나올 때까지 대기
 * - 오류나 종료 감지 시 자동 재기동
 */

interface PsSession {
  proc: ChildProcessWithoutNullStreams
  stdoutBuf: string
  waiters: Array<{ marker: string; resolve: () => void; reject: (e: Error) => void }>
}

let ps: PsSession | null = null

function tmpPng(): string {
  return path.join(os.tmpdir(), `1cho_${Date.now()}_${Math.random().toString(36).slice(2)}.png`)
}

function getOrCreatePs(): PsSession {
  if (ps && !ps.proc.killed && ps.proc.exitCode === null) return ps

  const proc = spawn(
    'powershell.exe',
    ['-NoProfile', '-NoLogo', '-NonInteractive', '-Command', '-'],
    { windowsHide: true }
  )
  const session: PsSession = { proc, stdoutBuf: '', waiters: [] }

  proc.stdout.setEncoding('utf8')
  proc.stdout.on('data', (chunk: string) => {
    session.stdoutBuf += chunk
    // 등록된 마커들을 순서대로 매칭
    while (session.waiters.length > 0) {
      const w = session.waiters[0]
      const idx = session.stdoutBuf.indexOf(w.marker)
      if (idx < 0) break
      // 해당 마커까지 포함하는 부분을 버퍼에서 제거
      session.stdoutBuf = session.stdoutBuf.slice(idx + w.marker.length)
      session.waiters.shift()
      w.resolve()
    }
  })
  proc.stderr.setEncoding('utf8')
  proc.stderr.on('data', (chunk: string) => {
    console.warn('[ps-stderr]', chunk.trim())
  })
  proc.on('exit', () => {
    // 대기 중이던 waiter들 실패 처리 & 세션 초기화
    for (const w of session.waiters) w.reject(new Error('PowerShell 세션 종료'))
    if (ps === session) ps = null
  })

  // 준비 단계: Assembly 미리 로드해둬서 첫 캡처도 빠르게
  proc.stdin.write(
    `Add-Type -AssemblyName System.Drawing\nAdd-Type -AssemblyName System.Windows.Forms\n`
  )

  ps = session
  return session
}

/** 프리워밍용: 앱 시작 시 호출해서 PS 세션을 미리 띄워둠. */
export function prewarmPowerShell(): void {
  try {
    getOrCreatePs()
  } catch (e) {
    console.warn('[ps prewarm]', e)
  }
}

function runPsScript(script: string, timeoutMs = 8000): Promise<void> {
  const session = getOrCreatePs()
  const marker = `__1CHO_${Date.now()}_${Math.random().toString(36).slice(2)}__`
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = session.waiters.findIndex((w) => w.marker === marker)
      if (idx >= 0) session.waiters.splice(idx, 1)
      reject(new Error('PowerShell 명령 타임아웃'))
    }, timeoutMs)

    session.waiters.push({
      marker,
      resolve: () => {
        clearTimeout(timer)
        resolve()
      },
      reject: (e) => {
        clearTimeout(timer)
        reject(e)
      }
    })
    session.proc.stdin.write(`${script}\nWrite-Host "${marker}"\n`)
  })
}

/**
 * Capture full virtual screen on Windows.
 */
export async function captureFullScreenWin(): Promise<Buffer> {
  const p = tmpPng()
  const script = `
$screens = [System.Windows.Forms.Screen]::AllScreens
$top = ($screens | Measure-Object -Property {$_.Bounds.Top} -Minimum).Minimum
$left = ($screens | Measure-Object -Property {$_.Bounds.Left} -Minimum).Minimum
$right = ($screens | Measure-Object -Property {$_.Bounds.Right} -Maximum).Maximum
$bottom = ($screens | Measure-Object -Property {$_.Bounds.Bottom} -Maximum).Maximum
$w = $right - $left
$h = $bottom - $top
$bmp = New-Object System.Drawing.Bitmap $w, $h
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($left, $top, 0, 0, $bmp.Size)
$bmp.Save('${p.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$gfx.Dispose(); $bmp.Dispose()
`.trim()
  await runPsScript(script)
  const buf = await fs.readFile(p)
  await fs.unlink(p).catch(() => undefined)
  return buf
}

/**
 * Capture a specific rect of the screen on Windows.
 */
export async function captureRegionWin(
  x: number,
  y: number,
  w: number,
  h: number
): Promise<Buffer> {
  const p = tmpPng()
  const script = `
$bmp = New-Object System.Drawing.Bitmap ${Math.round(w)}, ${Math.round(h)}
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen(${Math.round(x)}, ${Math.round(y)}, 0, 0, $bmp.Size)
$bmp.Save('${p.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$gfx.Dispose(); $bmp.Dispose()
`.trim()
  await runPsScript(script)
  const buf = await fs.readFile(p)
  await fs.unlink(p).catch(() => undefined)
  return buf
}

export function destroyPowerShell(): void {
  if (ps && ps.proc) {
    try {
      ps.proc.stdin.end()
      ps.proc.kill()
    } catch {
      /* ignore */
    }
  }
  ps = null
}
