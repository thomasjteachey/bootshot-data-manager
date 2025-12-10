import { contextBridge, ipcRenderer } from "electron";
import type { DbSettings } from "../main/modules/settings";

contextBridge.exposeInMainWorld("bootshot", {
  settings: {
    getDb: (): Promise<DbSettings> => ipcRenderer.invoke("settings:getDb"),
    setDb: (partial: Partial<DbSettings>): Promise<DbSettings> =>
      ipcRenderer.invoke("settings:setDb", partial),
  },
});
