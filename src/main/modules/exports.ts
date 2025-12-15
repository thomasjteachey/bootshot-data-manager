import fs from "fs";
import path from "path";
import { createDbConnection } from "./db";
import { getDbSettings, isDbInitialized } from "./settings";

export type ExportProgress = {
  phase: string;
  rowsParsed?: number;
  rowsInserted?: number;
  message?: string;
};

export type AppendCsvArgs = {
  table: string;
  csvPath: string;
  hasHeader: boolean;
  onProgress?: (p: ExportProgress) => void;
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

async function runNonDeleteriousPatching(conn: any, onProgress?: (p: ExportProgress) => void) {
  // This intentionally does NOT call make_everything(), because that truncates person/household.
  const patchProcs = [
    { name: "merge_person_from_exports_with_audit", label: "Merging people..." },
    { name: "merge_households_from_pantry", label: "Updating households..." },
    { name: "sweep_person_flavors_by_recency", label: "Sweeping latest fields..." },
  ];

  for (const p of patchProcs) {
    const exists = await procedureExists(conn, p.name);
    if (!exists) {
      throw new Error(`Required procedure not found: ${p.name}`);
    }
    onProgress?.({ phase: "patching", message: p.label });
    await conn.query(`CALL ${qname(p.name)}()`);
  }
}

function qname(name: string) {
  // Escape identifiers defensively
  return "`" + name.replaceAll("`", "``") + "`";
}

// Minimal CSV parser (RFC4180-ish):
// - Comma delimiter
// - Double quote wrapping; doubled quotes inside quotes
// - Newlines allowed inside quotes
// - Trims trailing \r on line endings
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];

  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  const pushField = () => {
    // Preserve exact bytes/spacing; just strip trailing \r if present.
    if (field.endsWith("\r")) field = field.slice(0, -1);
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }

      field += ch;
      i += 1;
      continue;
    }

    // Not in quotes
    if (ch === '"') {
      // RFC-ish: quote toggles quoted-field mode only if it begins the field.
      if (field.length === 0) {
        inQuotes = true;
        i += 1;
        continue;
      }
      // Otherwise, treat as a literal quote.
      field += ch;
      i += 1;
      continue;
    }

    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }

    if (ch === "\n") {
      pushRow();
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  // Last row (even if text ends without newline)
  if (inQuotes) {
    // If file is malformed, still try to salvage by closing the field.
    inQuotes = false;
  }

  // Avoid creating an extra empty trailing row for a final newline
  const hasAny = field.length > 0 || row.length > 0;
  if (hasAny) {
    pushRow();
  }

  return rows;
}

function isEffectivelyEmptyRow(r: string[]) {
  for (const v of r) {
    if (v !== "" && v != null) return false;
  }
  return true;
}

export async function listExportTables(): Promise<string[]> {
  if (!isDbInitialized()) return [];

  const s = getDbSettings();
  const conn = await createDbConnection();
  try {
    const [rows] = await conn.query(
      `SELECT table_name AS name
       FROM information_schema.tables
       WHERE table_schema = ?
         AND table_name LIKE ?
       ORDER BY table_name ASC`,
      [s.database, "%\\_export"]
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

async function getInsertableColumns(table: string): Promise<string[]> {
  const s = getDbSettings();
  const conn = await createDbConnection();
  try {
    const [rows] = await conn.query(
      `SELECT column_name AS name, extra AS extra
       FROM information_schema.columns
       WHERE table_schema = ?
         AND table_name = ?
       ORDER BY ordinal_position ASC`,
      [s.database, table]
    );

    const cols: string[] = [];
    for (const r of rows as any[]) {
      const name = r?.name;
      const extra = (r?.extra ?? "") as string;
      if (!name || typeof name !== "string") continue;
      if (typeof extra === "string" && extra.toLowerCase().includes("auto_increment")) {
        continue;
      }
      cols.push(name);
    }
    return cols;
  } finally {
    await conn.end();
  }
}

export async function appendCsvToTable(args: AppendCsvArgs): Promise<AppendCsvResult> {
  const { table, csvPath, hasHeader, onProgress } = args;

  if (!isDbInitialized()) {
    return { ok: false, message: "Database settings are not configured." };
  }

  if (!table || typeof table !== "string") {
    return { ok: false, message: "No table selected." };
  }

  if (!csvPath || typeof csvPath !== "string") {
    return { ok: false, message: "No CSV selected." };
  }

  const absPath = path.resolve(csvPath);
  if (!fs.existsSync(absPath)) {
    return { ok: false, message: `CSV file not found: ${absPath}` };
  }

  const stat = fs.statSync(absPath);
  if (!stat.isFile()) {
    return { ok: false, message: `Not a file: ${absPath}` };
  }

  if (stat.size > 256 * 1024 * 1024) {
    return {
      ok: false,
      message: "CSV is larger than 256MB; streaming import is not implemented yet.",
    };
  }

  onProgress?.({ phase: "loading", message: "Loading table schema..." });
  const cols = await getInsertableColumns(table);
  if (cols.length === 0) {
    return { ok: false, message: `Could not load columns for table: ${table}` };
  }

  onProgress?.({ phase: "reading", message: "Reading CSV..." });
  const text = fs.readFileSync(absPath, "utf8");

  onProgress?.({ phase: "parsing", message: "Parsing CSV..." });
  let rows = parseCsv(text);
  if (hasHeader && rows.length > 0) rows = rows.slice(1);

  // Filter fully-empty rows
  rows = rows.filter((r) => !isEffectivelyEmptyRow(r));

  const totalParsed = rows.length;
  onProgress?.({ phase: "parsed", rowsParsed: totalParsed });

  // Validate + normalize lengths
  const normalized: (string | null)[][] = [];
  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];

    if (r.length > cols.length) {
      return {
        ok: false,
        message: `Row ${idx + 1} has ${r.length} columns, but table ${table} has ${cols.length}.`,
        table,
        csvPath: absPath,
        rowsParsed: totalParsed,
        columnsUsed: cols.length,
      };
    }

    const out: (string | null)[] = new Array(cols.length).fill(null);
    for (let c = 0; c < cols.length; c++) {
      if (c < r.length) out[c] = r[c];
      else out[c] = null;
    }
    normalized.push(out);
  }

  const colSql = cols.map(qname).join(", ");
  const insertSql = `INSERT INTO ${qname(table)} (${colSql}) VALUES ?`;

  const conn = await createDbConnection();
  let inserted = 0;

  try {
    onProgress?.({ phase: "inserting", rowsParsed: totalParsed, rowsInserted: 0 });

    const batchSize = 250;
    for (let i = 0; i < normalized.length; i += batchSize) {
      const batch = normalized.slice(i, i + batchSize);
      // mysql2 supports bulk insert with VALUES ?
      await conn.query(insertSql, [batch]);
      inserted += batch.length;
      onProgress?.({ phase: "inserting", rowsParsed: totalParsed, rowsInserted: inserted });
    }

    // After appending raw export rows, run the same patch/merge flow as make_everything()
    // BUT in a non-destructive way (no truncation). This updates person/household incrementally.
    onProgress?.({ phase: "patching", message: "Running merge/patch procedures..." });
    await runNonDeleteriousPatching(conn, onProgress);

    return {
      ok: true,
      message: `Inserted ${inserted} row(s) into ${table}. Patched person/household tables successfully.`,
      table,
      csvPath: absPath,
      rowsParsed: totalParsed,
      rowsInserted: inserted,
      columnsUsed: cols.length,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    return {
      ok: false,
      message: `Append/patch failed: ${msg} (Note: rows may have been appended before this error.)`,
      table,
      csvPath: absPath,
      rowsParsed: totalParsed,
      rowsInserted: inserted,
      columnsUsed: cols.length,
    };
  } finally {
    await conn.end();
  }
}
