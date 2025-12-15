import { contextBridge, ipcRenderer } from "electron";

export type DbSettings = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
};

export type DbTestResult = {
  ok: boolean;
  message: string;
};

export type ExportProgress = {
  phase: string;
  rowsParsed?: number;
  rowsInserted?: number;
  message?: string;
};

export type MetricsProgress = {
  phase: "querying" | "writing" | "done" | "error";
  message?: string;
  rowsWritten?: number;
};

export type MetricsExportResult = {
  ok: boolean;
  message: string;
  outCsvPath?: string;
  rowsWritten?: number;
};
export type DemographicsProgress = {
  phase: "querying" | "writing" | "done" | "error";
  message?: string;
  rowsWritten?: number;
};

export type DemographicsExportResult = {
  ok: boolean;
  message: string;
  outCsvPath?: string;
  rowsWritten?: number;
  totalPersons?: number;
};

export type DebugQueryResult = {
  ok: boolean;
  message: string;
  columns?: string[];
  rows?: any[];
};


export type AppendCsvResult = {
  ok: boolean;
  message: string;
  table?: string;
  csvPath?: string;
  rowsParsed?: number;
  rowsInserted?: number;
  columnsUsed?: number;
};

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

  ui: {
    onDbSettingsSaved: (fn: () => void) => {
      const handler = () => fn();
      ipcRenderer.on("db:settings-saved", handler);
      return () => ipcRenderer.removeListener("db:settings-saved", handler);
    },
  },

  exports: {
    listExportTables: (): Promise<string[]> => ipcRenderer.invoke("exports:listTables"),
    chooseCsv: (): Promise<{ canceled: boolean; path?: string }> =>
      ipcRenderer.invoke("exports:chooseCsv"),
    appendCsv: (args: { table: string; csvPath: string; hasHeader?: boolean }): Promise<AppendCsvResult> =>
      ipcRenderer.invoke("exports:appendCsv", args),
    onProgress: (fn: (p: ExportProgress) => void) => {
      const handler = (_: any, p: ExportProgress) => fn(p);
      ipcRenderer.on("exports:progress", handler);
      return () => ipcRenderer.removeListener("exports:progress", handler);
    },
  },

  metrics: {
    chooseOutCsv: (): Promise<{ canceled: boolean; path?: string }> =>
      ipcRenderer.invoke("metrics:chooseOutCsv"),
    exportMonthly: (args: { outCsvPath: string }): Promise<MetricsExportResult> =>
      ipcRenderer.invoke("metrics:exportMonthly", args),
    onProgress: (fn: (p: MetricsProgress) => void) => {
      const handler = (_: any, p: MetricsProgress) => fn(p);
      ipcRenderer.on("metrics:progress", handler);
      return () => ipcRenderer.removeListener("metrics:progress", handler);
    },
  },

  demographics: {
    chooseOutCsv: (): Promise<{ canceled: boolean; path?: string }> =>
      ipcRenderer.invoke("demographics:chooseOutCsv"),
    exportAllTime: (args: { outCsvPath: string }): Promise<DemographicsExportResult> =>
      ipcRenderer.invoke("demographics:exportAllTime", args),
    onProgress: (fn: (p: DemographicsProgress) => void) => {
      const handler = (_: any, p: DemographicsProgress) => fn(p);
      ipcRenderer.on("demographics:progress", handler);
      return () => ipcRenderer.removeListener("demographics:progress", handler);
    },
  },

  debug: {
    listTables: (): Promise<string[]> => ipcRenderer.invoke("debug:listTables"),
    selectTable: (args: { table: string; limit?: number }): Promise<DebugQueryResult> =>
      ipcRenderer.invoke("debug:selectTable", args),
    multiDob: (args: { limit?: number }): Promise<DebugQueryResult> =>
      ipcRenderer.invoke("debug:multiDob", args),
    similarFullName: (args: {
      minRatioFirst: number;
      minRatioLast: number;
      sameDob: boolean;
      useSoundex: boolean;
      limit?: number;
    }): Promise<DebugQueryResult> => ipcRenderer.invoke("debug:similarFullName", args),
  },
});
