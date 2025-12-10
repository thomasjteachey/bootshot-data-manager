import { app, BrowserWindow, Menu, ipcMain } from "electron";
import { join } from "path";
import { getDbSettings, setDbSettings } from "./modules/settings";

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#000000",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
    },
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;

  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  const isMac = process.platform === "darwin";

  settingsWindow = new BrowserWindow({
    title: "Settings",
    width: 520,
    height: 420,
    parent: mainWindow ?? undefined,
    resizable: false,
    minimizable: true,
    maximizable: false,
    backgroundColor: "#111111",

    // ✅ Hide menu bar for this window on Windows/Linux
    autoHideMenuBar: !isMac,

    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
    },
  });

  // ✅ Also force-remove per-window menu on Windows/Linux
  if (!isMac) {
    settingsWindow.setMenu(null);
    settingsWindow.setMenuBarVisibility(false);
  }

  const devUrl = process.env.ELECTRON_RENDERER_URL;

  if (devUrl) {
    settingsWindow.loadURL(`${devUrl}#/settings`);
  } else {
    settingsWindow.loadFile(join(__dirname, "../renderer/index.html"), {
      hash: "settings",
    });
  }

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const isDev = !!process.env.ELECTRON_RENDERER_URL;

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              {
                label: "Settings...",
                accelerator: "Cmd+,",
                click: () => openSettingsWindow(),
              },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),

    {
      label: "File",
      submenu: [
        {
          label: "Settings...",
          accelerator: isMac ? "Cmd+," : "Ctrl+,",
          click: () => openSettingsWindow(),
        },
        { type: "separator" },
        { role: isMac ? "close" : "quit" },
      ],
    },

    {
      label: "View",
      submenu: [
        { role: "reload" },
        ...(isDev ? [{ role: "toggleDevTools" as const }] : []),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },

    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac ? [{ type: "separator" }, { role: "front" as const }] : []),
      ],
    },

    {
      label: "Help",
      submenu: [
        {
          label: "About",
          click: () => openSettingsWindow(),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
  ipcMain.handle("settings:getDb", () => getDbSettings());
  ipcMain.handle("settings:setDb", (_event, partial) => setDbSettings(partial));
}

app.whenReady().then(() => {
  registerIpc();
  createMainWindow();
  buildMenu();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      buildMenu();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
