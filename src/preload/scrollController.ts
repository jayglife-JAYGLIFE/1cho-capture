import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/constants'
import type { ScrollControllerBridge, ScrollControllerStatus } from '../shared/bridge'

const bridge: ScrollControllerBridge = {
  onStatus: (cb) => {
    ipcRenderer.on(IPC.SCROLL_CONTROLLER_STATUS, (_, s: ScrollControllerStatus) => cb(s))
  },
  finish: () => ipcRenderer.invoke(IPC.SCROLL_CONTROLLER_FINISH),
  cancel: () => ipcRenderer.invoke(IPC.SCROLL_CONTROLLER_CANCEL)
}

contextBridge.exposeInMainWorld('scrollApi', bridge)
