import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/constants'
import type { CaptureBoxBridge, CaptureBoxInitData } from '../shared/bridge'
import type { CaptureBoxPreset } from '../shared/types'

const bridge: CaptureBoxBridge = {
  onInit: (cb) => {
    ipcRenderer.on(IPC.CAPTURE_BOX_INIT, (_, data: CaptureBoxInitData) => cb(data))
  },
  onSizeChanged: (cb) => {
    ipcRenderer.on(IPC.CAPTURE_BOX_SIZE_CHANGED, (_, data: { width: number; height: number }) =>
      cb(data)
    )
  },
  shoot: () => ipcRenderer.invoke(IPC.CAPTURE_BOX_SHOOT),
  close: () => ipcRenderer.invoke(IPC.CAPTURE_BOX_CLOSE),
  resize: (width, height) => ipcRenderer.invoke(IPC.CAPTURE_BOX_RESIZE, { width, height }),
  getPresets: () => ipcRenderer.invoke(IPC.CAPTURE_BOX_GET_PRESETS),
  setPresets: (presets: CaptureBoxPreset[]) =>
    ipcRenderer.invoke(IPC.CAPTURE_BOX_SET_PRESETS, presets)
}

contextBridge.exposeInMainWorld('captureBox', bridge)
