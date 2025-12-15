import { app, BrowserWindow, Menu, ipcMain, dialog } from "electron";
import { join } from "path";
import { getDbSettings, setDbSettings, isDbInitialized } from "./modules/settings";
import { testDbConnection } from "./modules/db";
import { listExportTables, appendCsvToTable } from "./modules/exports";
import { exportCrossServiceMonthlyMetricsCsv } from "./modules/metrics";
import { exportDemographicsAllTimeCsv } from "./modules/demographics";
import {
  debugListTables,
  debugSelectTable,
  debugSelectPersonNameMultiDobData,
  debugSimilarFullName,
} from "./modules/debug";

let mainWindow: BrowserWindow | null = null;
let dbSettingsWindow: BrowserWindow | null = null;
let appendExportsWindow: BrowserWindow | null = null;
let metricsExportWindow: BrowserWindow | null = null;
let demographicsExportWindow: BrowserWindow | null = null;
let debugWindow: BrowserWindow | null = null;

const isMac = process.platform === "darwin";

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

function openAppendExportsWindow() {
  if (appendExportsWindow && !appendExportsWindow.isDestroyed()) {
    appendExportsWindow.focus();
    return;
  }

  appendExportsWindow = new BrowserWindow({
    title: "Append Export CSV",
    width: 760,
    height: 620,
    parent: mainWindow ?? undefined,
    resizable: true,
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
    appendExportsWindow.setMenu(null);
    appendExportsWindow.setMenuBarVisibility(false);
  }

  const devUrl = process.env.ELECTRON_RENDERER_URL;

  if (devUrl) {
    appendExportsWindow.loadURL(`${devUrl}#/append-exports`);
  } else {
    appendExportsWindow.loadFile(join(__dirname, "../renderer/index.html"), {
      hash: "append-exports",
    });
  }

  appendExportsWindow.on("closed", () => {
    appendExportsWindow = null;
  });
}

function openMetricsExportWindow() {
  if (metricsExportWindow && !metricsExportWindow.isDestroyed()) {
    metricsExportWindow.focus();
    return;
  }

  metricsExportWindow = new BrowserWindow({
    title: "Export Monthly Metrics",
    width: 980,
    height: 720,
    parent: mainWindow ?? undefined,
    resizable: true,
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
    metricsExportWindow.setMenu(null);
    metricsExportWindow.setMenuBarVisibility(false);
  }

  const devUrl = process.env.ELECTRON_RENDERER_URL;

  if (devUrl) {
    metricsExportWindow.loadURL(`${devUrl}#/metrics-export`);
  } else {
    metricsExportWindow.loadFile(join(__dirname, "../renderer/index.html"), {
      hash: "metrics-export",
    });
  }

  metricsExportWindow.on("closed", () => {
    metricsExportWindow = null;
  });
}

function openDemographicsExportWindow() {
  if (demographicsExportWindow && !demographicsExportWindow.isDestroyed()) {
    demographicsExportWindow.focus();
    return;
  }

  demographicsExportWindow = new BrowserWindow({
    title: "Export Demographics",
    width: 980,
    height: 720,
    parent: mainWindow ?? undefined,
    resizable: true,
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
    demographicsExportWindow.setMenu(null);
    demographicsExportWindow.setMenuBarVisibility(false);
  }

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    demographicsExportWindow.loadURL(`${devUrl}#/demographics-export`);
  } else {
    demographicsExportWindow.loadFile(join(__dirname, "../renderer/index.html"), {
      hash: "demographics-export",
    });
  }

  demographicsExportWindow.on("closed", () => {
    demographicsExportWindow = null;
  });
}

function openDebugWindow() {
  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.focus();
    return;
  }

  debugWindow = new BrowserWindow({
    title: "Debug Tools",
    width: 1100,
    height: 760,
    parent: mainWindow ?? undefined,
    resizable: true,
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
    debugWindow.setMenu(null);
    debugWindow.setMenuBarVisibility(false);
  }

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    debugWindow.loadURL(`${devUrl}#/debug`);
  } else {
    debugWindow.loadFile(join(__dirname, "../renderer/index.html"), {
      hash: "debug",
    });
  }

  debugWindow.on("closed", () => {
    debugWindow = null;
  });
}


function buildMenu() {
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
              {
                label: "Append Export CSV...",
                accelerator: "Cmd+Shift+I",
                click: () => openAppendExportsWindow(),
              },
              {
                label: "Export Monthly Metrics...",
                accelerator: "Cmd+Shift+E",
                click: () => openMetricsExportWindow(),
              },
              {
                label: "Export Demographics...",
                accelerator: "Cmd+Shift+D",
                click: () => openDemographicsExportWindow(),
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
        {
          label: "Append Export CSV...",
          accelerator: isMac ? "Cmd+Shift+I" : "Ctrl+Shift+I",
          click: () => openAppendExportsWindow(),
        },
        {
          label: "Export Monthly Metrics...",
          accelerator: isMac ? "Cmd+Shift+E" : "Ctrl+Shift+E",
          click: () => openMetricsExportWindow(),
        },
        {
          label: "Export Demographics...",
          accelerator: isMac ? "Cmd+Shift+D" : "Ctrl+Shift+D",
          click: () => openDemographicsExportWindow(),
        },
        { type: "separator" },
        { role: isMac ? "close" : "quit" },
      ],
    },

    {
      label: "Debug",
      submenu: [
        {
          label: "Open Debug Tools...",
          accelerator: isMac ? "Cmd+Shift+B" : "Ctrl+Shift+B",
          click: () => openDebugWindow(),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
  ipcMain.handle("settings:getDb", () => getDbSettings());

  ipcMain.handle("settings:setDb", (_event, nextFull) => {
    const saved = setDbSettings(nextFull);

    // Notify the main window to rerun the startup-style connection flow
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("db:settings-saved");
    }

    return saved;
  });

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

  // Export CSV appenders
  ipcMain.handle("exports:listTables", async () => {
    return listExportTables();
  });

  ipcMain.handle("exports:chooseCsv", async (_event) => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
    const res = await dialog.showOpenDialog(win ?? undefined, {
      title: "Choose CSV file",
      properties: ["openFile"],
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (res.canceled || res.filePaths.length === 0) return { canceled: true };
    return { canceled: false, path: res.filePaths[0] };
  });

  ipcMain.handle(
    "exports:appendCsv",
    async (event, args: { table: string; csvPath: string; hasHeader?: boolean }) => {
      const sender = event.sender;
      const onProgress = (p: { phase: string; rowsParsed?: number; rowsInserted?: number; message?: string }) => {
        sender.send("exports:progress", p);
      };
      return appendCsvToTable({
        table: args.table,
        csvPath: args.csvPath,
        hasHeader: !!args.hasHeader,
        onProgress,
      });
    }
  );

  // Metrics export
  
  ipcMain.handle("demographics:chooseOutCsv", async (_event) => {
    const win = BrowserWindow.getFocusedWindow() ?? demographicsExportWindow ?? mainWindow;
    const res = await dialog.showSaveDialog(win ?? undefined, {
      title: "Save demographics CSV",
      defaultPath: "demographics-all-time.csv",
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (res.canceled || !res.filePath) return { canceled: true };
    return { canceled: false, path: res.filePath };
  });

  ipcMain.handle(
    "demographics:exportAllTime",
    async (event, args: { outCsvPath: string }) => {
      const sender = event.sender;
      const onProgress = (p: { phase: string; message?: string; rowsWritten?: number }) => {
        sender.send("demographics:progress", p);
      };
      return exportDemographicsAllTimeCsv({ outCsvPath: args.outCsvPath, onProgress });
    }
  );

  ipcMain.handle("metrics:chooseOutCsv", async () => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
    const res = await dialog.showSaveDialog(win ?? undefined, {
      title: "Save metrics CSV",
      defaultPath: "monthly-metrics.csv",
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (res.canceled || !res.filePath) return { canceled: true };
    return { canceled: false, path: res.filePath };
  });

  ipcMain.handle(
    "metrics:exportMonthly",
    async (event, args: { outCsvPath: string }) => {
      const sender = event.sender;
      const onProgress = (p: { phase: string; message?: string; rowsWritten?: number }) => {
        sender.send("metrics:progress", p);
      };
      return exportCrossServiceMonthlyMetricsCsv({ outCsvPath: args.outCsvPath, onProgress });
    }
  );

  // Debug tools (read-only)
  ipcMain.handle("debug:listTables", async () => {
    return debugListTables();
  });

  ipcMain.handle("debug:selectTable", async (_event, args: { table: string; limit?: number }) => {
    return debugSelectTable({ table: args.table, limit: args.limit });
  });

  ipcMain.handle("debug:multiDob", async (_event, args: { limit?: number }) => {
    return debugSelectPersonNameMultiDobData({ limit: args.limit });
  });

  ipcMain.handle(
    "debug:similarFullName",
    async (
      _event,
      args: {
        minRatioFirst: number;
        minRatioLast: number;
        sameDob: boolean;
        useSoundex: boolean;
        limit?: number;
      }
    ) => {
      return debugSimilarFullName({
        minRatioFirst: args.minRatioFirst,
        minRatioLast: args.minRatioLast,
        sameDob: args.sameDob,
        useSoundex: args.useSoundex,
        limit: args.limit,
      });
    }
  );
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
