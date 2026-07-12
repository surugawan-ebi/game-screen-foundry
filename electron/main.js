"use strict";

const { app, BrowserWindow, Menu, dialog, screen, shell } = require("electron");
const { createServer } = require("../server");

const HOST = "127.0.0.1";
const DEFAULT_WINDOW_WIDTH = 1720;
const DEFAULT_WINDOW_HEIGHT = 1080;
const MIN_WINDOW_WIDTH = 1080;
const MIN_WINDOW_HEIGHT = 720;
const requestedPort = Number(process.env.GAME_SCREEN_FOUNDRY_DESKTOP_PORT || 0);

let server = null;
let serverUrl = "";
let mainWindow = null;

app.setName("Game Screen Foundry");

function listen(serverInstance, port) {
  return new Promise((resolve, reject) => {
    serverInstance.once("error", reject);
    serverInstance.listen(port, HOST, () => {
      serverInstance.off("error", reject);
      resolve(serverInstance.address());
    });
  });
}

async function startLocalServer() {
  server = createServer();
  const address = await listen(server, requestedPort);
  serverUrl = `http://${HOST}:${address.port}`;
  return serverUrl;
}

function isAppUrl(candidateUrl) {
  try {
    return new URL(candidateUrl).origin === new URL(serverUrl).origin;
  } catch (error) {
    return false;
  }
}

function buildAppUrl(params = {}) {
  const url = new URL(serverUrl);
  if (params.folderPath) {
    url.searchParams.set("folder", params.folderPath);
  }
  if (params.screenId) {
    url.searchParams.set("screen", params.screenId);
  }
  return url.toString();
}

async function openProjectFolder() {
  if (!mainWindow) {
    return;
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Open Game Screen Foundry Project",
    properties: ["openDirectory"]
  });
  if (result.canceled || !result.filePaths.length) {
    return;
  }
  try {
    await mainWindow.loadURL(buildAppUrl({ folderPath: result.filePaths[0] }));
  } catch (error) {
    if (error && (error.code === "ERR_ABORTED" || error.errno === -3)) {
      return;
    }
    throw error;
  }
}

function openDemo() {
  if (!mainWindow) {
    return;
  }
  mainWindow.webContents.executeJavaScript("document.getElementById('loadDemoButton')?.click();");
}

function createApplicationMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" }
          ]
        }]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Open Project Folder...",
          accelerator: "CmdOrCtrl+O",
          click: openProjectFolder
        },
        {
          label: "Open Demo",
          click: openDemo
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function getInitialWindowBounds() {
  const { workAreaSize } = screen.getPrimaryDisplay();
  return {
    width: Math.min(DEFAULT_WINDOW_WIDTH, Math.max(MIN_WINDOW_WIDTH, workAreaSize.width)),
    height: Math.min(DEFAULT_WINDOW_HEIGHT, Math.max(MIN_WINDOW_HEIGHT, workAreaSize.height))
  };
}

function createMainWindow() {
  const initialBounds = getInitialWindowBounds();
  mainWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: "Game Screen Foundry",
    backgroundColor: "#090d12",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAppUrl(url)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.loadURL(buildAppUrl());
  if (process.argv.includes("--devtools")) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

async function boot() {
  try {
    await startLocalServer();
    createApplicationMenu();
    createMainWindow();
  } catch (error) {
    dialog.showErrorBox("Game Screen Foundry failed to start", error.stack || error.message);
    app.quit();
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });

  app.whenReady().then(boot);
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverUrl) {
    createMainWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (server) {
    server.close();
    server = null;
  }
});
