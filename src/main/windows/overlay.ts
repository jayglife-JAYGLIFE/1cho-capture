import { BrowserWindow, screen } from 'electron'
import path from 'node:path'
import { captureAllDisplaysForOverlay } from '../capture'
import { IPC } from '../../shared/constants'
import type { RegionSelection } from '../../shared/types'
import { openEditorWithImage } from './editor'

const overlays: BrowserWindow[] = []
let pendingDisplays: Awaited<ReturnType<typeof captureAllDisplaysForOverlay>> = []

export async function openRegionOverlay(): Promise<void> {
  if (overlays.length > 0) return // already open

  const displayShots = await captureAllDisplaysForOverlay()
  pendingDisplays = displayShots
  const displays = screen.getAllDisplays()

  for (const d of displays) {
    const shot = displayShots.find((s) => s.displayId === d.id)
    if (!shot) continue
    const w = new BrowserWindow({
      x: d.bounds.x,
      y: d.bounds.y,
      width: d.bounds.width,
      height: d.bounds.height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      fullscreen: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, '../preload/overlay.js'),
        contextIsolation: true,
        sandbox: false
      }
    })
    w.setAlwaysOnTop(true, 'screen-saver')
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    if (process.env['ELECTRON_RENDERER_URL']) {
      w.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay/index.html`)
    } else {
      w.loadFile(path.join(__dirname, '../renderer/overlay/index.html'))
    }

    w.webContents.once('did-finish-load', () => {
      w.webContents.send(IPC.OVERLAY_INIT, {
        displayId: d.id,
        bounds: d.bounds,
        scaleFactor: d.scaleFactor,
        backgroundDataUrl: shot.dataUrl
      })
    })

    overlays.push(w)
  }
}

export function closeAllOverlays(): void {
  while (overlays.length) {
    const w = overlays.pop()
    if (w && !w.isDestroyed()) w.close()
  }
}

export async function handleOverlaySelection(selection: RegionSelection): Promise<void> {
  const shot = pendingDisplays.find((s) => s.displayId === selection.displayId)
  closeAllOverlays()
  if (!shot) return

  // Crop the full-display image to the selected region. Coordinates from renderer
  // are already in display CSS pixels. We need to scale by scaleFactor for the raw buffer.
  const croppedDataUrl = await cropDataUrl(shot.dataUrl, selection, shot.scaleFactor)
  await openEditorWithImage({ dataUrl: croppedDataUrl, width: 0, height: 0 })
}

async function cropDataUrl(
  dataUrl: string,
  sel: { x: number; y: number; width: number; height: number },
  scaleFactor: number
): Promise<string> {
  // Use a hidden BrowserWindow to run offscreen canvas? Simpler: do it in main via nativeImage + Buffer manipulation.
  // Use nativeImage.crop which is supported in Electron.
  const { nativeImage } = await import('electron')
  const img = nativeImage.createFromDataURL(dataUrl)
  const cropped = img.crop({
    x: Math.round(sel.x * scaleFactor),
    y: Math.round(sel.y * scaleFactor),
    width: Math.max(1, Math.round(sel.width * scaleFactor)),
    height: Math.max(1, Math.round(sel.height * scaleFactor))
  })
  return cropped.toDataURL()
}
