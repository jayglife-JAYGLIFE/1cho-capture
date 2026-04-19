import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const execFileP = promisify(execFile)

function tmpPng(): string {
  return path.join(os.tmpdir(), `1cho_${Date.now()}_${Math.random().toString(36).slice(2)}.png`)
}

/**
 * Capture full virtual screen on Windows using PowerShell + System.Drawing.
 * Much faster than Electron's desktopCapturer for high-resolution monitors.
 */
export async function captureFullScreenWin(): Promise<Buffer> {
  const p = tmpPng()
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
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
  await execFileP('powershell.exe', ['-NoProfile', '-Command', script], {
    windowsHide: true
  })
  const buf = await fs.readFile(p)
  await fs.unlink(p).catch(() => undefined)
  return buf
}

/**
 * Capture a specific rect of the screen on Windows via PowerShell + System.Drawing.
 * 좌표는 virtual screen 기준 (멀티 모니터의 음수 좌표 지원).
 * 호출 전에 오버레이 창이 hide 상태여야 한다.
 */
export async function captureRegionWin(
  x: number,
  y: number,
  w: number,
  h: number
): Promise<Buffer> {
  const p = tmpPng()
  const script = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap ${Math.round(w)}, ${Math.round(h)}
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen(${Math.round(x)}, ${Math.round(y)}, 0, 0, $bmp.Size)
$bmp.Save('${p.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$gfx.Dispose(); $bmp.Dispose()
`.trim()
  await execFileP('powershell.exe', ['-NoProfile', '-Command', script], {
    windowsHide: true
  })
  const buf = await fs.readFile(p)
  await fs.unlink(p).catch(() => undefined)
  return buf
}
