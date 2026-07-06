import { contextBridge, ipcRenderer } from 'electron'

const bridge = {
  onCount: (cb: (n: number) => void): void => {
    ipcRenderer.on('delay:count', (_, n: number) => cb(n))
  },
  cancel: (): void => {
    ipcRenderer.send('delay:cancel')
  }
}

contextBridge.exposeInMainWorld('delayApi', bridge)
