/// <reference types="vite/client" />

import type { DbSettings } from "../main/modules/settings";

declare global {
  interface Window {
    bootshot: {
      settings: {
        getDb: () => Promise<DbSettings>;
        setDb: (partial: Partial<DbSettings>) => Promise<DbSettings>;
      };
    };
  }
}

export {};
