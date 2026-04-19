import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/constants'
import type { ToolbarBridge, ToolbarCaptureMode } from '../shared/bridge'

const bridge: ToolbarBridge = {
  capture: (mode: ToolbarCaptureMode) => ipcRenderer.invoke(IPC.TOOLBAR_CAPTURE, mode),
  hide: () => ipcRenderer.invoke(IPC.TOOLBAR_HIDE),
  settings: () => ipcRenderer.invoke(IPC.TOOLBAR_SETTINGS),
  savePosition: (pos) => ipcRenderer.invoke(IPC.TOOLBAR_SAVE_POSITION, pos)
}

contextBridge.exposeInMainWorld('toolbarApi', bridge)
