import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, ipcMain, Menu } from "electron";
import {
  normalizeServerOrigin,
  readSavedServerOrigin,
  resolveStartupOrigin,
  saveServerOrigin,
} from "./server-origin.js";
import { browserWindowOptions } from "./window-options.js";

const CONNECTION_PAGE = path.join(import.meta.dirname, "connect.html");
const CONNECTION_PAGE_URL = pathToFileURL(CONNECTION_PAGE).href;
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
  if (process.platform !== "darwin") return;
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          {
            label: "Change Server…",
            accelerator: "CommandOrControl+,",
            click: () => {
              const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
              if (win) void showConnection(win);
            },
          },
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
    if (typeof value !== "string") throw new Error("Enter the Mesh Bot server address.");
    const win = windowFrom(event);
    if (!win) throw new Error("The Mesh Bot window is unavailable.");
    savedOrigin = await saveServerOrigin(path.join(app.getPath("userData"), "server.json"), value);
    await loadServer(win, savedOrigin);
    return { origin: savedOrigin };
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
