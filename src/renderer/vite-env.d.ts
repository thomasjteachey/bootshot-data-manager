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
    };
  }
}

export {};
