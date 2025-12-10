import { app, BrowserWindow, Menu, ipcMain } from "electron";
import { join } from "path";
import { getDbSettings, setDbSettings, isDbInitialized } from "./modules/settings";
import { testDbConnection } from "./modules/db";

let mainWindow: BrowserWindow | null = null;
let dbSettingsWindow: BrowserWindow | null = null;

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

function openDatabaseSettingsWindow() {
  if (dbSettingsWindow && !dbSettingsWindow.isDestroyed()) {
    dbSettingsWindow.focus();
    return;
  }

  const isMac = process.platform === "darwin";

  dbSettingsWindow = new BrowserWindow({
    title: "Database Settings",
    width: 560,
    height: 520,
    parent: mainWindow ?? undefined,
    resizable: false,
    minimizable: true,
    maximizable: false,
    backgroundColor: "#111111",
    autoHideMenuBar: !isMac,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
    },
  });

  if (!isMac) {
    dbSettingsWindow.setMenu(null);
    dbSettingsWindow.setMenuBarVisibility(false);
  }

  const devUrl = process.env.ELECTRON_RENDERER_URL;

  if (devUrl) {
    dbSettingsWindow.loadURL(`${devUrl}#/db-settings`);
  } else {
    dbSettingsWindow.loadFile(join(__dirname, "../renderer/index.html"), {
      hash: "db-settings",
    });
  }

  dbSettingsWindow.on("closed", () => {
    dbSettingsWindow = null;
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
                label: "Database Settings...",
                accelerator: "Cmd+,",
                click: () => openDatabaseSettingsWindow(),
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
          label: "Database Settings...",
          accelerator: isMac ? "Cmd+," : "Ctrl+,",
          click: () => openDatabaseSettingsWindow(),
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
          click: () => openDatabaseSettingsWindow(),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
  ipcMain.handle("settings:getDb", () => getDbSettings());
  ipcMain.handle("settings:setDb", (_event, nextFull) => setDbSettings(nextFull));
  ipcMain.handle("settings:isDbInitialized", () => isDbInitialized());

  // Test connection without saving
  ipcMain.handle("db:testConnection", async (_event, maybeSettings) => {
    return testDbConnection(maybeSettings);
  });

  // Used by startup flow in the main window
  ipcMain.handle("db:attemptInitialConnection", async () => {
    if (!isDbInitialized()) {
      return { ok: false, message: "Database settings not configured." };
    }
    return testDbConnection();
  });
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
