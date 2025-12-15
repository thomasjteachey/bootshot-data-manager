/// <reference types="vite/client" />

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

export type AppendCsvResult = {
  ok: boolean;
  message: string;
  table?: string;
  csvPath?: string;
  rowsParsed?: number;
  rowsInserted?: number;
  columnsUsed?: number;
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


declare global {
  interface Window {
    bootshot: {
      settings: {
        getDb: () => Promise<DbSettings>;
        setDb: (nextFull: DbSettings) => Promise<DbSettings>;
        isDbInitialized: () => Promise<boolean>;
      };
      db: {
        testConnection: (settings?: DbSettings) => Promise<DbTestResult>;
        attemptInitialConnection: () => Promise<DbTestResult>;
      };
      ui: {
        onDbSettingsSaved: (fn: () => void) => () => void;
      };
      exports: {
        listExportTables: () => Promise<string[]>;
        chooseCsv: () => Promise<{ canceled: boolean; path?: string }>;
        appendCsv: (args: { table: string; csvPath: string; hasHeader?: boolean }) => Promise<AppendCsvResult>;
        onProgress: (fn: (p: ExportProgress) => void) => () => void;
      };

      metrics: {
        chooseOutCsv: () => Promise<{ canceled: boolean; path?: string }>;
        exportMonthly: (args: { outCsvPath: string }) => Promise<MetricsExportResult>;
        onProgress: (fn: (p: MetricsProgress) => void) => () => void;
      };

      demographics: {
        chooseOutCsv: () => Promise<{ canceled: boolean; path?: string }>;
        exportAllTime: (args: { outCsvPath: string }) => Promise<DemographicsExportResult>;
        onProgress: (fn: (p: DemographicsProgress) => void) => () => void;
      };

      debug: {
        listTables: () => Promise<string[]>;
        selectTable: (args: { table: string; limit?: number }) => Promise<DebugQueryResult>;
        multiDob: (args: { limit?: number }) => Promise<DebugQueryResult>;
        similarFullName: (args: {
          minRatioFirst: number;
          minRatioLast: number;
          sameDob: boolean;
          useSoundex: boolean;
          limit?: number;
        }) => Promise<DebugQueryResult>;
      };
    };
  }
}

export {};
