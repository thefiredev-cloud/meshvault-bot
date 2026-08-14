const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("meshvaultDesktop", {
  platform: process.platform,
  server: {
    settings: () => ipcRenderer.invoke("desktop.server.settings"),
    connect: (origin) => ipcRenderer.invoke("desktop.server.connect", origin),
  },
  window: {
    close: () => ipcRenderer.invoke("desktop.window.close"),
    minimize: () => ipcRenderer.invoke("desktop.window.minimize"),
    toggleMaximize: () => ipcRenderer.invoke("desktop.window.toggleMaximize"),
    state: () => ipcRenderer.invoke("desktop.window.state"),
  },
});
