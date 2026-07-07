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

function normalizeHeaderName(name: string) {
  let out = name.replace(/^\uFEFF/, "").trim();
  // If a UTF-8 BOM appeared before the opening quote, the CSV parser sees the
  // quote characters as literal text. Normalize that common export shape too.
  if (out.length >= 2 && out.startsWith('"') && out.endsWith('"')) {
    out = out.slice(1, -1).replace(/""/g, '"').trim();
  }
  return out;
}

function buildHeaderIndex(header: string[]): Map<string, number> {
  const index = new Map<string, number>();
  header.forEach((raw, i) => {
    const name = normalizeHeaderName(raw);
    if (name && !index.has(name)) index.set(name, i);
  });
  return index;
}

async function ensurePantryExportCompatibility(conn: any) {
  const s = getDbSettings();
  const expected = Array.from({ length: 10 }, (_, i) => i + 1).flatMap((n) => [
    `HH Mem ${n}- ID`,
    `HH Mem ${n}- Status`,
    `HH Mem ${n}- Last Name`,
    `HH Mem ${n}- First Name`,
    `HH Mem ${n}- Date of Birth`,
    `HH Mem ${n}- Estimated Date of Birth`,
    `HH Mem ${n}- Age`,
    `HH Mem ${n}- Gender Identity-Labels`,
    `HH Mem ${n}- Gender Identity-Parent Types`,
    `HH Mem ${n}- Phone Numbers`,
    `HH Mem ${n}- Ethnicity-Labels`,
    `HH Mem ${n}- Ethnicity-Parent Types`,
    `HH Mem ${n}- Disability`,
    `HH Mem ${n}- Landing Date`,
    `HH Mem ${n}- Self-Identifies As`,
    `HH Mem ${n}- Is Student`,
    `HH Mem ${n}- Employment`,
    `HH Mem ${n}- School Attended`,
    `HH Mem ${n}- School Id`,
    `HH Mem ${n}- Grade Documentation`,
    `HH Mem ${n}- Grade Documentation Expiration`,
    `HH Mem ${n}- Relationship to Main Client`,
    `HH Mem ${n}- Church`,
    `HH Mem ${n}- Full Time Employment`,
    `HH Mem ${n}- No Income`,
    `HH Mem ${n}- Other Income`,
    `HH Mem ${n}- Part Time Employment`,
    `HH Mem ${n}- Pension`,
    `HH Mem ${n}- Public Assistance`,
    `HH Mem ${n}- Social Security Disability (SSI/SSDI)`,
    `HH Mem ${n}- Social Security Retirement`,
    `HH Mem ${n}- Social Security Survivor Benefits`,
    `HH Mem ${n}- Student Loans`,
  ]);

  const [rows] = await conn.query(
    `SELECT column_name AS name
     FROM information_schema.columns
     WHERE table_schema = ?
       AND table_name = 'pantry_export'`,
    [s.database]
  );
  const existing = new Set((rows as any[]).map((r) => r?.name).filter((n) => typeof n === "string"));
  const missing = expected.filter((name) => !existing.has(name));
  if (missing.length === 0) return;

  const alterSql = `ALTER TABLE ${qname("pantry_export")} ${missing
    .map((name) => `ADD COLUMN ${qname(name)} text`)
    .join(", ")}`;
  await conn.query(alterSql);
}

async function getInsertableColumnsForConnection(conn: any, table: string): Promise<string[]> {
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
    if (typeof extra === "string" && extra.toLowerCase().includes("auto_increment")) continue;
    cols.push(name);
  }
  return cols;
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

  const schemaConn = await createDbConnection();
  let cols: string[];
  try {
    onProgress?.({ phase: "loading", message: "Loading table schema..." });
    if (table === "pantry_export") await ensurePantryExportCompatibility(schemaConn);
    cols = await getInsertableColumnsForConnection(schemaConn, table);
  } finally {
    await schemaConn.end();
  }
  if (cols.length === 0) {
    return { ok: false, message: `Could not load columns for table: ${table}` };
  }

  onProgress?.({ phase: "reading", message: "Reading CSV..." });
  const text = fs.readFileSync(absPath, "utf8").replace(/^\uFEFF/, "");

  onProgress?.({ phase: "parsing", message: "Parsing CSV..." });
  let parsedRows = parseCsv(text, delimiter);
  const firstRow = parsedRows.length > 0 ? parsedRows[0].map(normalizeHeaderName).filter(Boolean) : [];
  const knownColumnCount = firstRow.filter((name) => cols.includes(name)).length;
  const inferredHeader = !hasHeader && firstRow.length > 0 && knownColumnCount === firstRow.length;
  const header = (hasHeader || inferredHeader) && parsedRows.length > 0 ? parsedRows[0] : null;
  let rows = header ? parsedRows.slice(1) : parsedRows;

  // Filter fully-empty rows
  rows = rows.filter((r) => !isEffectivelyEmptyRow(r));

  const totalParsed = rows.length;
  onProgress?.({ phase: "parsed", rowsParsed: totalParsed });

  // Validate + normalize lengths. Headered CSVs are matched by column name so
  // Impact exports with a reduced or reordered column set still load correctly.
  const normalized: (string | null)[][] = [];
  const headerIndex = header ? buildHeaderIndex(header) : null;
  const unknownHeaders = header
    ? header.map(normalizeHeaderName).filter((name) => name && !cols.includes(name))
    : [];
  if (unknownHeaders.length > 0) {
    return {
      ok: false,
      message: `CSV header contains column(s) not found in table ${table}: ${unknownHeaders.join(", ")}.`,
      table,
      csvPath: absPath,
      rowsParsed: totalParsed,
      columnsUsed: cols.length,
    };
  }

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];

    if (!headerIndex && r.length > cols.length) {
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
      const sourceIndex = headerIndex ? headerIndex.get(cols[c]) : c;
      if (sourceIndex != null && sourceIndex < r.length) out[c] = r[sourceIndex];
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
