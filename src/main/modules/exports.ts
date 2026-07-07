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
  delimiter?: string;
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

// Minimal delimited-text parser (RFC4180-ish):
// - Configurable single-character delimiter (comma by default)
// - Double quote wrapping; doubled quotes inside quotes
// - Newlines allowed inside quotes
// - Trims trailing \r on line endings
function parseCsv(text: string, delimiter = ","): string[][] {
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

    if (ch === delimiter) {
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

async function getInsertableColumnsFromConnection(conn: any, table: string): Promise<string[]> {
  const s = getDbSettings();
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
}

async function getInsertableColumns(table: string): Promise<string[]> {
  const conn = await createDbConnection();
  try {
    return await getInsertableColumnsFromConnection(conn, table);
  } finally {
    await conn.end();
  }
}

function uniqueNonEmptyHeaders(headers: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const h of headers) {
    const name = h.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

async function addMissingTextColumns(conn: any, table: string, missingColumns: string[]) {
  for (const col of missingColumns) {
    await conn.query(`ALTER TABLE ${qname(table)} ADD COLUMN ${qname(col)} text`);
  }
}

export async function appendCsvToTable(args: AppendCsvArgs): Promise<AppendCsvResult> {
  const { table, csvPath, hasHeader, onProgress } = args;
  const delimiter = args.delimiter ?? ",";

  if (!isDbInitialized()) {
    return { ok: false, message: "Database settings are not configured." };
  }

  if (!table || typeof table !== "string") {
    return { ok: false, message: "No table selected." };
  }

  if (!csvPath || typeof csvPath !== "string") {
    return { ok: false, message: "No CSV selected." };
  }

  if (typeof delimiter !== "string" || delimiter.length !== 1) {
    return { ok: false, message: "Delimiter must be exactly one character." };
  }

  if (delimiter === "\r" || delimiter === "\n" || delimiter === "\"") {
    return { ok: false, message: "Delimiter cannot be a newline or double quote." };
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

  onProgress?.({ phase: "reading", message: "Reading CSV..." });
  const text = fs.readFileSync(absPath, "utf8");

  onProgress?.({ phase: "parsing", message: "Parsing CSV..." });
  const parsedRows = parseCsv(text, delimiter);
  const header = hasHeader && parsedRows.length > 0 ? parsedRows[0] : null;
  let rows = hasHeader && parsedRows.length > 0 ? parsedRows.slice(1) : parsedRows;

  // Filter fully-empty rows
  rows = rows.filter((r) => !isEffectivelyEmptyRow(r));

  const totalParsed = rows.length;
  onProgress?.({ phase: "parsed", rowsParsed: totalParsed });

  const conn = await createDbConnection();
  let inserted = 0;
  let columnsUsed = 0;

  try {
    onProgress?.({ phase: "loading", message: "Loading table schema..." });
    let cols = await getInsertableColumnsFromConnection(conn, table);
    if (cols.length === 0) {
      return { ok: false, message: `Could not load columns for table: ${table}` };
    }

    if (header) {
      const headerColumns = uniqueNonEmptyHeaders(header);
      if (headerColumns.length === 0) {
        return { ok: false, message: "CSV header did not contain any usable column names." };
      }

      const existing = new Set(cols);
      const missing = headerColumns.filter((h) => !existing.has(h));
      if (missing.length > 0) {
        onProgress?.({
          phase: "loading",
          message: `Adding ${missing.length} missing text column(s) to ${table}...`,
        });
        await addMissingTextColumns(conn, table, missing);
        cols = await getInsertableColumnsFromConnection(conn, table);
      }

      cols = headerColumns;
    }

    // Validate + normalize lengths. Headered CSVs are matched by header name, so they can
    // append partial exports and exports with newly added pantry/clinic fields. Headerless
    // CSVs keep the legacy positional behavior.
    const normalized: (string | null)[][] = [];
    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];

      if (!header && r.length > cols.length) {
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
      if (header) {
        for (let c = 0; c < header.length; c++) {
          const name = header[c].trim();
          if (!name) continue;
          const destIdx = cols.indexOf(name);
          if (destIdx >= 0) out[destIdx] = c < r.length ? r[c] : null;
        }
      } else {
        for (let c = 0; c < cols.length; c++) {
          if (c < r.length) out[c] = r[c];
          else out[c] = null;
        }
      }
      normalized.push(out);
    }

    columnsUsed = cols.length;
    const colSql = cols.map(qname).join(", ");
    const insertSql = `INSERT INTO ${qname(table)} (${colSql}) VALUES ?`;
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
      columnsUsed,
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
      columnsUsed,
    };
  } finally {
    await conn.end();
  }
}
