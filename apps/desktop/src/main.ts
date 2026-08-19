import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MESHVAULT_NAME, MESHVAULT_SELL } from "@meshbot/contracts";
import { app, BrowserWindow, ipcMain, Menu } from "electron";
import { createBotModeRuntime } from "./bot-mode.js";
import {
  normalizeServerOrigin,
  readSavedServerOrigin,
  resolveStartupOrigin,
  saveServerOrigin,
} from "./server-origin.js";
import { browserWindowOptions } from "./window-options.js";

const CONNECTION_PAGE = path.join(import.meta.dirname, "connect.html");
const CONNECTION_PAGE_URL = pathToFileURL(CONNECTION_PAGE).href;
const BOT_MODE_PAGE = path.join(import.meta.dirname, "bots.html");
const BOT_MODE_PAGE_URL = pathToFileURL(BOT_MODE_PAGE).href;
const WEB_URL_OVERRIDE = process.env.MESHBOT_WEB_URL;
let savedOrigin: string | undefined;
let currentOrigin: string | undefined;
let connectionError: string | undefined;

function windowFrom(event: Electron.IpcMainInvokeEvent) {
  return BrowserWindow.fromWebContents(event.sender);
}

function developmentIcon() {
  if (app.isPackaged) return undefined;
  const icon = path.join(app.getAppPath(), "assets", "icon.png");
  return existsSync(icon) ? icon : undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function assertConnectionPage(event: Electron.IpcMainInvokeEvent) {
  if (event.senderFrame?.url !== CONNECTION_PAGE_URL) {
    throw new Error("Server settings are available only from the connection screen.");
  }
}

function assertBotModePage(event: Electron.IpcMainInvokeEvent) {
  const url = event.senderFrame?.url;
  if (url !== BOT_MODE_PAGE_URL && url !== CONNECTION_PAGE_URL) {
    throw new Error("Bot Mode is available only from the desktop Bot Mode screen.");
  }
}

async function showBotMode(win: BrowserWindow) {
  await win.loadFile(BOT_MODE_PAGE);
}

function focusedWindow() {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

async function showConnection(win: BrowserWindow, error?: string) {
  connectionError = error;
  await win.loadFile(CONNECTION_PAGE);
}

async function loadServer(win: BrowserWindow, origin: string) {
  currentOrigin = normalizeServerOrigin(origin);
  connectionError = undefined;
  try {
    await win.loadURL(currentOrigin);
  } catch (error) {
    await showConnection(win, `Could not load ${currentOrigin}: ${errorMessage(error)}`);
    throw error;
  }
}

async function createWindow() {
  const icon = developmentIcon();
  const win = new BrowserWindow({
    ...browserWindowOptions(process.platform),
    title: MESHVAULT_NAME,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  try {
    savedOrigin = await readSavedServerOrigin(path.join(app.getPath("userData"), "server.json"));
    const startupOrigin = resolveStartupOrigin({
      override: WEB_URL_OVERRIDE,
      saved: savedOrigin,
      packaged: app.isPackaged,
    });
    if (startupOrigin) await loadServer(win, startupOrigin);
    else await showConnection(win);
  } catch (error) {
    currentOrigin = WEB_URL_OVERRIDE?.trim() || savedOrigin;
    await showConnection(win, errorMessage(error));
  }
}

function installMenu() {
  const botModeItem = {
    label: "Bot Mode",
    accelerator: "CommandOrControl+B",
    click: () => {
      const win = focusedWindow();
      if (win) void showBotMode(win);
    },
  };
  const changeServerItem = {
    label: "Change Server…",
    accelerator: "CommandOrControl+,",
    click: () => {
      const win = focusedWindow();
      if (win) void showConnection(win);
    },
  };
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: MESHVAULT_NAME,
          submenu: [botModeItem, changeServerItem, { type: "separator" }, { role: "quit" }],
        },
        { role: "editMenu" },
        { role: "viewMenu" },
        { role: "windowMenu" },
      ]),
    );
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          botModeItem,
          changeServerItem,
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
    ]),
  );
}

app.whenReady().then(() => {
  const botMode = createBotModeRuntime(path.join(app.getPath("userData"), "bot-mode.json"));
  app.setAboutPanelOptions({
    applicationName: MESHVAULT_NAME,
    copyright: "FireDev LLC dba MeshVault",
    credits: MESHVAULT_SELL,
  });
  const icon = developmentIcon();
  if (process.platform === "darwin" && icon) app.dock?.setIcon(icon);
  ipcMain.handle("desktop.platform", () => process.platform);
  ipcMain.handle("desktop.window.close", (event) => {
    windowFrom(event)?.close();
  });
  ipcMain.handle("desktop.window.minimize", (event) => {
    windowFrom(event)?.minimize();
  });
  ipcMain.handle("desktop.window.toggleMaximize", (event) => {
    const win = windowFrom(event);
    if (!win) return;
    if (win.isMaximized() || win.isFullScreen()) {
      win.setFullScreen(false);
      if (win.isMaximized()) win.unmaximize();
    } else {
      win.maximize();
    }
  });
  ipcMain.handle("desktop.window.state", (event) => {
    const win = windowFrom(event);
    return {
      minimized: win?.isMinimized() ?? false,
      maximized: win?.isMaximized() ?? false,
      fullScreen: win?.isFullScreen() ?? false,
    };
  });
  ipcMain.handle("desktop.server.settings", (event) => {
    assertConnectionPage(event);
    return {
      savedOrigin,
      currentOrigin,
      error: connectionError,
      override: Boolean(WEB_URL_OVERRIDE?.trim()),
    };
  });
  ipcMain.handle("desktop.server.connect", async (event, value: unknown) => {
    assertConnectionPage(event);
    if (typeof value !== "string") throw new Error("Enter the MeshVault server address.");
    const win = windowFrom(event);
    if (!win) throw new Error("The MeshVault window is unavailable.");
    savedOrigin = await saveServerOrigin(path.join(app.getPath("userData"), "server.json"), value);
    await loadServer(win, savedOrigin);
    return { origin: savedOrigin };
  });
  ipcMain.handle("desktop.botMode.open", async (event) => {
    assertBotModePage(event);
    const win = windowFrom(event);
    if (!win) throw new Error("The MeshVault window is unavailable.");
    await showBotMode(win);
    return { ok: true };
  });
  ipcMain.handle("desktop.botMode.snapshot", async (event) => {
    if (event.senderFrame?.url !== BOT_MODE_PAGE_URL) {
      throw new Error("Bot Mode is available only from the desktop Bot Mode screen.");
    }
    return botMode.load();
  });
  ipcMain.handle("desktop.botMode.createBot", async (event, input: unknown) => {
    if (event.senderFrame?.url !== BOT_MODE_PAGE_URL) {
      throw new Error("Bot Mode is available only from the desktop Bot Mode screen.");
    }
    return botMode.createBot(
      (input ?? {}) as { name?: string; title?: string; description?: string },
    );
  });
  ipcMain.handle("desktop.botMode.hideBot", async (event, name: unknown, hidden: unknown) => {
    if (event.senderFrame?.url !== BOT_MODE_PAGE_URL) {
      throw new Error("Bot Mode is available only from the desktop Bot Mode screen.");
    }
    if (typeof name !== "string") throw new Error("Unknown bot.");
    return botMode.hideBot(name, Boolean(hidden));
  });
  ipcMain.handle("desktop.botMode.setQuery", async (event, query: unknown) => {
    if (event.senderFrame?.url !== BOT_MODE_PAGE_URL) {
      throw new Error("Bot Mode is available only from the desktop Bot Mode screen.");
    }
    return botMode.setQuery(typeof query === "string" ? query : "");
  });
  ipcMain.handle("desktop.botMode.setShowHidden", async (event, showHidden: unknown) => {
    if (event.senderFrame?.url !== BOT_MODE_PAGE_URL) {
      throw new Error("Bot Mode is available only from the desktop Bot Mode screen.");
    }
    return botMode.setShowHidden(Boolean(showHidden));
  });
  ipcMain.handle("desktop.botMode.openChat", async (event, name: unknown) => {
    if (event.senderFrame?.url !== BOT_MODE_PAGE_URL) {
      throw new Error("Bot Mode is available only from the desktop Bot Mode screen.");
    }
    if (typeof name !== "string") throw new Error("Unknown bot.");
    return botMode.openChat(name);
  });
  ipcMain.handle("desktop.botMode.sendMessage", async (event, text: unknown) => {
    if (event.senderFrame?.url !== BOT_MODE_PAGE_URL) {
      throw new Error("Bot Mode is available only from the desktop Bot Mode screen.");
    }
    if (typeof text !== "string") throw new Error("Enter a message.");
    return botMode.sendMessage(text);
  });
  ipcMain.handle("desktop.botMode.openSessions", async (event, name: unknown) => {
    if (event.senderFrame?.url !== BOT_MODE_PAGE_URL) {
      throw new Error("Bot Mode is available only from the desktop Bot Mode screen.");
    }
    if (typeof name !== "string") throw new Error("Unknown bot.");
    return botMode.openSessions(name);
  });
  ipcMain.handle(
    "desktop.botMode.openSession",
    async (event, botName: unknown, sessionId: unknown) => {
      if (event.senderFrame?.url !== BOT_MODE_PAGE_URL) {
        throw new Error("Bot Mode is available only from the desktop Bot Mode screen.");
      }
      if (typeof botName !== "string" || typeof sessionId !== "string")
        throw new Error("Unknown session.");
      return botMode.openSession(botName, sessionId);
    },
  );
  ipcMain.handle("desktop.botMode.openMeshVault", async (event) => {
    if (event.senderFrame?.url !== BOT_MODE_PAGE_URL) {
      throw new Error("Bot Mode is available only from the desktop Bot Mode screen.");
    }
    const win = windowFrom(event);
    if (!win) throw new Error("The MeshVault window is unavailable.");
    const origin = currentOrigin || savedOrigin || WEB_URL_OVERRIDE?.trim();
    if (!origin) {
      await showConnection(win, "Connect a MeshVault server to open the application.");
      return { origin: null };
    }
    await loadServer(win, origin);
    return { origin };
  });
  installMenu();
  void createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
