import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/constants'
import type { SettingsBridge } from '../shared/bridge'

const bridge: SettingsBridge = {
  onInit: (cb) => {
    ipcRenderer.on(IPC.SETTINGS_INIT, (_, data) => cb(data))
  },
  get: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  set: (patch) => ipcRenderer.invoke(IPC.SETTINGS_SET, patch),
  pickFolder: () => ipcRenderer.invoke(IPC.SETTINGS_PICK_FOLDER),
  getVersion: () => ipcRenderer.invoke(IPC.SETTINGS_GET_VERSION)
}

contextBridge.exposeInMainWorld('settings', bridge)
