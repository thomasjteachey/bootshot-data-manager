import Store from "electron-store";

export type DbSettings = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
};

type SettingsShape = {
  db: DbSettings;
  meta: {
    dbInitialized: boolean;
  };
};

const defaults: SettingsShape = {
  db: {
    host: "localhost",
    port: 3306,
    user: "",
    password: "",
    database: "",
    ssl: false,
  },
  meta: {
    dbInitialized: false,
  },
};

const store = new Store<SettingsShape>({
  name: "settings",
  defaults,
});

export function getDbSettings(): DbSettings {
  return store.get("db");
}

export function setDbSettings(nextFull: DbSettings): DbSettings {
  store.set("db", nextFull);
  store.set("meta.dbInitialized", true);
  return nextFull;
}

export function isDbInitialized(): boolean {
  return store.get("meta.dbInitialized");
}
