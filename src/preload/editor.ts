import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/constants'
import type { EditorBridge } from '../shared/bridge'

const bridge: EditorBridge = {
  onInit: (cb) => {
    ipcRenderer.on(IPC.EDITOR_INIT, (_, data) => cb(data))
  },
  save: (dataUrl, format) => ipcRenderer.invoke(IPC.EDITOR_SAVE, { dataUrl, format }),
  copy: (dataUrl) => ipcRenderer.invoke(IPC.EDITOR_COPY, dataUrl),
  close: () => ipcRenderer.invoke(IPC.EDITOR_CLOSE),
  readyToShow: () => ipcRenderer.send('editor:ready-to-show'),
  loadImageBuffer: (filePath) => ipcRenderer.invoke(IPC.EDITOR_LOAD_IMAGE, filePath)
}

contextBridge.exposeInMainWorld('editor', bridge)
