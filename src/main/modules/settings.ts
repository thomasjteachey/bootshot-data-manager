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
};

const store = new Store<SettingsShape>({
  name: "settings",
  defaults,
});

export function getDbSettings(): DbSettings {
  return store.get("db");
}

export function setDbSettings(partial: Partial<DbSettings>): DbSettings {
  const current = store.get("db");
  const next = { ...current, ...partial };
  store.set("db", next);
  return next;
}
