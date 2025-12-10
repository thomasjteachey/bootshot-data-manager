import { contextBridge, ipcRenderer } from "electron";
import type { DbSettings } from "../main/modules/settings";
import type { DbTestResult } from "../main/modules/db";

contextBridge.exposeInMainWorld("bootshot", {
  settings: {
    getDb: (): Promise<DbSettings> => ipcRenderer.invoke("settings:getDb"),
    setDb: (nextFull: DbSettings): Promise<DbSettings> =>
      ipcRenderer.invoke("settings:setDb", nextFull),
    isDbInitialized: (): Promise<boolean> =>
      ipcRenderer.invoke("settings:isDbInitialized"),
  },

  db: {
    testConnection: (settings?: DbSettings): Promise<DbTestResult> =>
      ipcRenderer.invoke("db:testConnection", settings),
    attemptInitialConnection: (): Promise<DbTestResult> =>
      ipcRenderer.invoke("db:attemptInitialConnection"),
  },
});
