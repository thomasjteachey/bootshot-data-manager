import fs from "fs";
import path from "path";
import { createDbConnection } from "./db";
import { isDbInitialized } from "./settings";

export type MetricsExportProgress = {
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

// Safe-ish CSV encoder.
function csvEscape(v: any): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

// Requirement:
// - Per month, for the last 12 months (including current month), plus an annual total row.
// - Metrics:
//   c) pharmacy AND pantry (same person)
//   d) pharmacy AND household pantry (any household member pantry visit)
//   e) clinic AND household pantry (any household member pantry visit)
//   f) clinic AND pharmacy (same person)
//
// Notes:
// - We count DISTINCT people per month.
// - Dates in exports are text; we parse common formats.
// - Household logic uses the `household` table produced by merge_households_from_pantry.
const SQL_MONTHLY_METRICS = `
WITH RECURSIVE
  params AS (
    SELECT
      /* first day of the month, 11 months ago */
      STR_TO_DATE(DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 11 MONTH), '%Y-%m-01'), '%Y-%m-%d') AS start_d,
      /* first day of next month */
      DATE_ADD(STR_TO_DATE(DATE_FORMAT(CURDATE(), '%Y-%m-01'), '%Y-%m-%d'), INTERVAL 1 MONTH) AS end_excl_d,
      /* first day of this month */
      STR_TO_DATE(DATE_FORMAT(CURDATE(), '%Y-%m-01'), '%Y-%m-%d') AS this_month_d
  ),

  months AS (
    SELECT (SELECT start_d FROM params) AS month_start
    UNION ALL
    SELECT DATE_ADD(month_start, INTERVAL 1 MONTH)
    FROM months
    WHERE month_start < (SELECT this_month_d FROM params)
  ),

  pantry_events AS (
    SELECT
      p.person_id,
      STR_TO_DATE(DATE_FORMAT(pe_d, '%Y-%m-01'), '%Y-%m-%d') AS month_start
    FROM (
      SELECT
        CAST(TRIM(pe.\`Client ID\`) AS UNSIGNED) AS client_id_u,
        COALESCE(
          CASE
            WHEN pe.\`Visit Date\` IS NULL OR TRIM(pe.\`Visit Date\`) = '' THEN NULL
            WHEN TRIM(pe.\`Visit Date\`) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(TRIM(pe.\`Visit Date\`), '%Y-%m-%d')
            WHEN TRIM(pe.\`Visit Date\`) REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN COALESCE(
              STR_TO_DATE(TRIM(pe.\`Visit Date\`), '%m/%d/%Y'),
              STR_TO_DATE(TRIM(pe.\`Visit Date\`), '%m/%d/%y')
            )
            ELSE NULL
          END,
          NULL
        ) AS pe_d
      FROM pantry_export pe
      WHERE TRIM(pe.\`Client ID\`) REGEXP '^[0-9]+$'
    ) x
    JOIN person p ON p.pantry_client_id = x.client_id_u
    JOIN params r ON 1=1
    WHERE x.pe_d IS NOT NULL
      AND x.pe_d >= r.start_d
      AND x.pe_d <  r.end_excl_d
    GROUP BY p.person_id, STR_TO_DATE(DATE_FORMAT(x.pe_d, '%Y-%m-01'), '%Y-%m-%d')
  ),

  pharmacy_events AS (
    SELECT
      p.person_id,
      STR_TO_DATE(DATE_FORMAT(px_d, '%Y-%m-01'), '%Y-%m-%d') AS month_start
    FROM (
      SELECT
        CAST(TRIM(px.\`PAT KEY\`) AS UNSIGNED) AS pat_key_u,
        COALESCE(
          CASE
            WHEN px.\`RX PICKED UP\` IS NULL OR TRIM(px.\`RX PICKED UP\`) = '' THEN NULL
            WHEN TRIM(px.\`RX PICKED UP\`) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(TRIM(px.\`RX PICKED UP\`), '%Y-%m-%d')
            WHEN TRIM(px.\`RX PICKED UP\`) REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN COALESCE(
              STR_TO_DATE(TRIM(px.\`RX PICKED UP\`), '%m/%d/%Y'),
              STR_TO_DATE(TRIM(px.\`RX PICKED UP\`), '%m/%d/%y')
            )
            ELSE NULL
          END,
          CASE
            WHEN px.\`RX DATE\` IS NULL OR TRIM(px.\`RX DATE\`) = '' THEN NULL
            WHEN TRIM(px.\`RX DATE\`) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(TRIM(px.\`RX DATE\`), '%Y-%m-%d')
            WHEN TRIM(px.\`RX DATE\`) REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN COALESCE(
              STR_TO_DATE(TRIM(px.\`RX DATE\`), '%m/%d/%Y'),
              STR_TO_DATE(TRIM(px.\`RX DATE\`), '%m/%d/%y')
            )
            ELSE NULL
          END
        ) AS px_d
      FROM pharmacy_pickup_date_export px
      WHERE TRIM(px.\`PAT KEY\`) REGEXP '^[0-9]+$'
    ) x
    JOIN person p ON p.pharmacy_pat_key = x.pat_key_u
    JOIN params r ON 1=1
    WHERE x.px_d IS NOT NULL
      AND x.px_d >= r.start_d
      AND x.px_d <  r.end_excl_d
    GROUP BY p.person_id, STR_TO_DATE(DATE_FORMAT(x.px_d, '%Y-%m-01'), '%Y-%m-%d')
  ),

  clinic_events AS (
    SELECT
      p.person_id,
      STR_TO_DATE(DATE_FORMAT(cx_d, '%Y-%m-01'), '%Y-%m-%d') AS month_start
    FROM (
      SELECT
        CAST(TRIM(cd.patientid) AS UNSIGNED) AS patientid_u,
        CASE
          WHEN cd.apptdate IS NULL OR TRIM(cd.apptdate) = '' THEN NULL
          WHEN TRIM(cd.apptdate) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(TRIM(cd.apptdate), '%Y-%m-%d')
          WHEN TRIM(cd.apptdate) REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN COALESCE(
            STR_TO_DATE(TRIM(cd.apptdate), '%m/%d/%Y'),
            STR_TO_DATE(TRIM(cd.apptdate), '%m/%d/%y')
          )
          ELSE NULL
        END AS cx_d
      FROM clinic_dob_export cd
      WHERE TRIM(cd.patientid) REGEXP '^[0-9]+$'
    ) x
    JOIN person p ON p.clinic_patientid = x.patientid_u
    JOIN params r ON 1=1
    WHERE x.cx_d IS NOT NULL
      AND x.cx_d >= r.start_d
      AND x.cx_d <  r.end_excl_d
    GROUP BY p.person_id, STR_TO_DATE(DATE_FORMAT(x.cx_d, '%Y-%m-01'), '%Y-%m-%d')
  ),

  pantry_household_month AS (
    /* any pantry pickup in a month, mapped to the household(s) of the picker */
    SELECT
      h.household_id,
      STR_TO_DATE(DATE_FORMAT(pe_d, '%Y-%m-01'), '%Y-%m-%d') AS month_start
    FROM (
      SELECT
        CAST(TRIM(pe.\`Client ID\`) AS UNSIGNED) AS client_id_u,
        COALESCE(
          CASE
            WHEN pe.\`Visit Date\` IS NULL OR TRIM(pe.\`Visit Date\`) = '' THEN NULL
            WHEN TRIM(pe.\`Visit Date\`) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(TRIM(pe.\`Visit Date\`), '%Y-%m-%d')
            WHEN TRIM(pe.\`Visit Date\`) REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN COALESCE(
              STR_TO_DATE(TRIM(pe.\`Visit Date\`), '%m/%d/%Y'),
              STR_TO_DATE(TRIM(pe.\`Visit Date\`), '%m/%d/%y')
            )
            ELSE NULL
          END,
          NULL
        ) AS pe_d
      FROM pantry_export pe
      WHERE TRIM(pe.\`Client ID\`) REGEXP '^[0-9]+$'
    ) x
    JOIN person picker ON picker.pantry_client_id = x.client_id_u
    JOIN household h ON h.person_id = picker.person_id
    JOIN params r ON 1=1
    WHERE x.pe_d IS NOT NULL
      AND x.pe_d >= r.start_d
      AND x.pe_d <  r.end_excl_d
    GROUP BY h.household_id, STR_TO_DATE(DATE_FORMAT(x.pe_d, '%Y-%m-01'), '%Y-%m-%d')
  ),

  person_household_pantry_month AS (
    /* people whose household had a pantry pickup that month */
    SELECT DISTINCT h.person_id, phm.month_start
    FROM household h
    JOIN pantry_household_month phm ON phm.household_id = h.household_id
  ),

  monthly AS (
    SELECT
      DATE_FORMAT(m.month_start, '%Y-%m') AS period,
      (SELECT COUNT(*) FROM person) AS total_persons,
      /* c */
      (
        SELECT COUNT(DISTINCT ph.person_id)
        FROM pharmacy_events ph
        JOIN pantry_events pa
          ON pa.person_id = ph.person_id
         AND pa.month_start = m.month_start
        WHERE ph.month_start = m.month_start
      ) AS pharmacy_and_pantry,
      /* d */
      (
        SELECT COUNT(DISTINCT ph.person_id)
        FROM pharmacy_events ph
        JOIN person_household_pantry_month hm
          ON hm.person_id = ph.person_id
         AND hm.month_start = m.month_start
        WHERE ph.month_start = m.month_start
      ) AS pharmacy_and_household_pantry,
      /* e */
      (
        SELECT COUNT(DISTINCT ce.person_id)
        FROM clinic_events ce
        JOIN person_household_pantry_month hm
          ON hm.person_id = ce.person_id
         AND hm.month_start = m.month_start
        WHERE ce.month_start = m.month_start
      ) AS clinic_and_household_pantry,
      /* f */
      (
        SELECT COUNT(DISTINCT ce.person_id)
        FROM clinic_events ce
        JOIN pharmacy_events ph
          ON ph.person_id = ce.person_id
         AND ph.month_start = m.month_start
        WHERE ce.month_start = m.month_start
      ) AS clinic_and_pharmacy
    FROM months m
    ORDER BY m.month_start ASC
  ),

  totals AS (
    SELECT
      'ANNUAL' AS period,
      (SELECT COUNT(*) FROM person) AS total_persons,
      /* c: distinct people with ANY pharmacy event and ANY pantry event in the window */
      (
        SELECT COUNT(DISTINCT ph.person_id)
        FROM (SELECT DISTINCT person_id FROM pharmacy_events) ph
        JOIN (SELECT DISTINCT person_id FROM pantry_events) pa
          ON pa.person_id = ph.person_id
      ) AS pharmacy_and_pantry,
      /* d */
      (
        SELECT COUNT(DISTINCT ph.person_id)
        FROM (SELECT DISTINCT person_id FROM pharmacy_events) ph
        JOIN household h ON h.person_id = ph.person_id
        JOIN (SELECT DISTINCT household_id FROM pantry_household_month) hh
          ON hh.household_id = h.household_id
      ) AS pharmacy_and_household_pantry,
      /* e */
      (
        SELECT COUNT(DISTINCT ce.person_id)
        FROM (SELECT DISTINCT person_id FROM clinic_events) ce
        JOIN household h ON h.person_id = ce.person_id
        JOIN (SELECT DISTINCT household_id FROM pantry_household_month) hh
          ON hh.household_id = h.household_id
      ) AS clinic_and_household_pantry,
      /* f */
      (
        SELECT COUNT(DISTINCT ce.person_id)
        FROM (SELECT DISTINCT person_id FROM clinic_events) ce
        JOIN (SELECT DISTINCT person_id FROM pharmacy_events) ph
          ON ph.person_id = ce.person_id
      ) AS clinic_and_pharmacy
  )

SELECT * FROM monthly
UNION ALL
SELECT * FROM totals;
`;

export async function exportCrossServiceMonthlyMetricsCsv(args: {
  outCsvPath: string;
  onProgress?: (p: MetricsExportProgress) => void;
}): Promise<MetricsExportResult> {
  const { outCsvPath, onProgress } = args;

  if (!isDbInitialized()) {
    return { ok: false, message: "Database settings are not configured." };
  }

  if (!outCsvPath || typeof outCsvPath !== "string") {
    return { ok: false, message: "No output path was provided." };
  }

  const absPath = path.resolve(outCsvPath);
  const dir = path.dirname(absPath);

  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }

  const conn = await createDbConnection();
  try {
    onProgress?.({ phase: "querying", message: "Calculating monthly metrics..." });
    const [rows] = await conn.query(SQL_MONTHLY_METRICS);

    const r = (rows as any[]) ?? [];
    onProgress?.({ phase: "writing", message: "Writing CSV..." });

    const header = [
      "period",
      "pharmacy_and_pantry",
      "pharmacy_and_pantry_pct",
      "pharmacy_and_household_pantry",
      "pharmacy_and_household_pantry_pct",
      "clinic_and_household_pantry",
      "clinic_and_household_pantry_pct",
      "clinic_and_pharmacy",
      "clinic_and_pharmacy_pct",
    ];

    const overallTotalPersons = r.length > 0 ? Number(r[0].total_persons ?? 0) : 0;

    const lines: string[] = [];
    // metadata lines (requested): total persons as a standalone field
    lines.push(["total_persons", csvEscape(overallTotalPersons)].join(","));
    lines.push(""); // blank separator line

    lines.push(header.join(","));

    for (const row of r) {
      const totalPersons = overallTotalPersons;
      const pct = (n: any) => {
        const v = Number(n ?? 0);
        if (!Number.isFinite(v) || totalPersons <= 0) return 0;
        return (v * 100) / totalPersons;
      };

      const line = [
        csvEscape(row.period),
        csvEscape(row.pharmacy_and_pantry ?? 0),
        csvEscape(pct(row.pharmacy_and_pantry)),
        csvEscape(row.pharmacy_and_household_pantry ?? 0),
        csvEscape(pct(row.pharmacy_and_household_pantry)),
        csvEscape(row.clinic_and_household_pantry ?? 0),
        csvEscape(pct(row.clinic_and_household_pantry)),
        csvEscape(row.clinic_and_pharmacy ?? 0),
        csvEscape(pct(row.clinic_and_pharmacy)),
      ].join(",");
      lines.push(line);
    }

    fs.writeFileSync(absPath, lines.join("\n"), "utf8");
    onProgress?.({ phase: "done", message: "Export complete.", rowsWritten: r.length });

    return {
      ok: true,
      message: `Wrote ${r.length} row(s) to ${absPath}.`,
      outCsvPath: absPath,
      rowsWritten: r.length,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    onProgress?.({ phase: "error", message: msg });
    return { ok: false, message: `Export failed: ${msg}` };
  } finally {
    await conn.end();
  }
}
