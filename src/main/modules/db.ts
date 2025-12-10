import mysql from "mysql2/promise";
import type { DbSettings } from "./settings";
import { getDbSettings } from "./settings";

export type DbTestResult = {
  ok: boolean;
  message: string;
};

function toConnectionOptions(s: DbSettings) {
  const base: any = {
    host: s.host,
    port: s.port,
    user: s.user,
    password: s.password,
    database: s.database,
    connectTimeout: 5000,
  };

  if (s.ssl) {
    // For internal tools, this is a practical default.
    // You can tighten this later with proper CA certs.
    base.ssl = { rejectUnauthorized: false };
  }

  return base;
}

export async function testDbConnection(settingsOverride?: DbSettings): Promise<DbTestResult> {
  const s = settingsOverride ?? getDbSettings();

  try {
    const conn = await mysql.createConnection(toConnectionOptions(s));
    try {
      await conn.ping();
    } finally {
      await conn.end();
    }

    return { ok: true, message: "Connection successful." };
  } catch (err: any) {
    const msg =
      err?.message ||
      (typeof err === "string" ? err : "Connection failed.");
    return { ok: false, message: msg };
  }
}
