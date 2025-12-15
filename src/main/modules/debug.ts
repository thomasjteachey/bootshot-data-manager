import { createDbConnection } from "./db";
import { getDbSettings, isDbInitialized } from "./settings";

export type DebugQueryResult = {
  ok: boolean;
  message: string;
  columns?: string[];
  rows?: any[];
};

function qid(name: string) {
  return "`" + String(name).replaceAll("`", "``") + "`";
}

async function tableExists(conn: any, tableName: string): Promise<boolean> {
  const s = getDbSettings();
  const [rows] = await conn.query(
    `SELECT 1 AS ok
     FROM information_schema.tables
     WHERE table_schema = ? AND table_name = ?
     LIMIT 1`,
    [s.database, tableName]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function procedureExists(conn: any, routineName: string): Promise<boolean> {
  const s = getDbSettings();
  const [rows] = await conn.query(
    `SELECT 1 AS ok
     FROM information_schema.routines
     WHERE routine_schema = ?
       AND routine_type = 'PROCEDURE'
       AND routine_name = ?
     LIMIT 1`,
    [s.database, routineName]
  );
  return Array.isArray(rows) && rows.length > 0;
}

function clampLimit(v: any, def = 200) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(1, Math.min(2000, Math.floor(n)));
}

export async function debugListTables(): Promise<string[]> {
  if (!isDbInitialized()) return [];

  const s = getDbSettings();
  const conn = await createDbConnection();
  try {
    const [rows] = await conn.query(
      `SELECT table_name AS name
       FROM information_schema.tables
       WHERE table_schema = ?
       ORDER BY table_name ASC`,
      [s.database]
    );
    const out: string[] = [];
    for (const r of rows as any[]) {
      if (r?.name && typeof r.name === "string") out.push(r.name);
    }
    return out;
  } finally {
    await conn.end();
  }
}

export async function debugSelectTable(args: { table: string; limit?: number }): Promise<DebugQueryResult> {
  if (!isDbInitialized()) {
    return { ok: false, message: "Database settings are not configured." };
  }

  const table = String(args.table || "").trim();
  if (!table) return { ok: false, message: "No table selected." };

  const limit = clampLimit(args.limit, 200);

  const conn = await createDbConnection();
  try {
    const exists = await tableExists(conn, table);
    if (!exists) return { ok: false, message: `Table not found: ${table}` };

    const [rows, fields] = await conn.query({ sql: `SELECT * FROM ${qid(table)} LIMIT ?`, values: [limit] });
    const columns = Array.isArray(fields) ? fields.map((f: any) => f.name).filter(Boolean) : [];
    return {
      ok: true,
      message: `OK (${Array.isArray(rows) ? rows.length : 0} rows)`,
      columns,
      rows: Array.isArray(rows) ? rows : [],
    };
  } catch (err: any) {
    return { ok: false, message: err?.message || String(err) };
  } finally {
    await conn.end();
  }
}

export async function debugSelectPersonNameMultiDobData(args: { limit?: number }): Promise<DebugQueryResult> {
  return debugSelectTable({ table: "person_name_multi_dob_data", limit: args.limit ?? 200 });
}

export async function debugSimilarFullName(args: {
  minRatioFirst: number;
  minRatioLast: number;
  sameDob: boolean;
  useSoundex: boolean;
  limit?: number;
}): Promise<DebugQueryResult> {
  if (!isDbInitialized()) {
    return { ok: false, message: "Database settings are not configured." };
  }

  const minRatioFirst = Number(args.minRatioFirst);
  const minRatioLast = Number(args.minRatioLast);
  const sameDob = args.sameDob ? 1 : 0;
  const useSoundex = args.useSoundex ? 1 : 0;
  const limit = clampLimit(args.limit, 500);

  if (!Number.isFinite(minRatioFirst) || !Number.isFinite(minRatioLast)) {
    return { ok: false, message: "Invalid ratio inputs." };
  }

  const conn = await createDbConnection();
  try {
    const exists = await procedureExists(conn, "debug_similar_full_name");
    if (!exists) {
      return { ok: false, message: "Procedure not found: debug_similar_full_name" };
    }

    const [resultSets]: any = await conn.query(
      "CALL debug_similar_full_name(?,?,?,?,?)",
      [minRatioFirst, minRatioLast, sameDob, useSoundex, limit]
    );

    // mysql2 returns [[rows], OkPacket] for CALL.
    const rows = Array.isArray(resultSets) && Array.isArray(resultSets[0]) ? resultSets[0] : resultSets;
    const columns = rows && rows.length > 0 ? Object.keys(rows[0]) : [];

    return {
      ok: true,
      message: `OK (${Array.isArray(rows) ? rows.length : 0} rows)`,
      columns,
      rows: Array.isArray(rows) ? rows : [],
    };
  } catch (err: any) {
    return { ok: false, message: err?.message || String(err) };
  } finally {
    await conn.end();
  }
}
