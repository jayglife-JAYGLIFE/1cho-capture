import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/constants'
import type { OverlayBridge } from '../shared/bridge'

const bridge: OverlayBridge = {
  onInit: (cb) => {
    ipcRenderer.on(IPC.OVERLAY_INIT, (_, data) => cb(data))
  },
  submit: (sel) => ipcRenderer.invoke(IPC.OVERLAY_SELECT, sel),
  cancel: () => ipcRenderer.invoke(IPC.OVERLAY_CANCEL)
}

contextBridge.exposeInMainWorld('overlay', bridge)
