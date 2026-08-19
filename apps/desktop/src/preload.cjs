const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("meshbotDesktop", {
  platform: process.platform,
  server: {
    settings: () => ipcRenderer.invoke("desktop.server.settings"),
    connect: (origin) => ipcRenderer.invoke("desktop.server.connect", origin),
  },
  botMode: {
    open: () => ipcRenderer.invoke("desktop.botMode.open"),
    snapshot: () => ipcRenderer.invoke("desktop.botMode.snapshot"),
    createBot: (input) => ipcRenderer.invoke("desktop.botMode.createBot", input),
    hideBot: (name, hidden) => ipcRenderer.invoke("desktop.botMode.hideBot", name, hidden),
    setQuery: (query) => ipcRenderer.invoke("desktop.botMode.setQuery", query),
    setShowHidden: (showHidden) => ipcRenderer.invoke("desktop.botMode.setShowHidden", showHidden),
    openChat: (name) => ipcRenderer.invoke("desktop.botMode.openChat", name),
    sendMessage: (text) => ipcRenderer.invoke("desktop.botMode.sendMessage", text),
    openSessions: (name) => ipcRenderer.invoke("desktop.botMode.openSessions", name),
    openSession: (botName, sessionId) =>
      ipcRenderer.invoke("desktop.botMode.openSession", botName, sessionId),
    openMeshVault: () => ipcRenderer.invoke("desktop.botMode.openMeshVault"),
  },
  window: {
    close: () => ipcRenderer.invoke("desktop.window.close"),
    minimize: () => ipcRenderer.invoke("desktop.window.minimize"),
    toggleMaximize: () => ipcRenderer.invoke("desktop.window.toggleMaximize"),
    state: () => ipcRenderer.invoke("desktop.window.state"),
  },
});
