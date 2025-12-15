import fs from "fs";
import path from "path";
import { createDbConnection } from "./db";
import { isDbInitialized } from "./settings";

export type DemographicsExportProgress = {
  phase: "querying" | "writing" | "done" | "error";
  message?: string;
  rowsWritten?: number;
};

export type DemographicsExportResult = {
  ok: boolean;
  message: string;
  outCsvPath?: string;
  rowsWritten?: number;
  totalPersons?: number;
};

function csvEscape(v: any): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function normalizeBlank(v: any): string {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s.length ? s : "Unknown/Blank";
}

export async function exportDemographicsAllTimeCsv(args: {
  outCsvPath: string;
  onProgress?: (p: DemographicsExportProgress) => void;
}): Promise<DemographicsExportResult> {
  const { outCsvPath, onProgress } = args;

  if (!isDbInitialized()) {
    return { ok: false, message: "Database settings not configured." };
  }

  const absOut = path.resolve(outCsvPath);

  let conn: any = null;
  try {
    onProgress?.({ phase: "querying", message: "Querying total persons..." });
    conn = await createDbConnection();

    // Total persons: count of person records in the system.
    const [trows] = await conn.query(`SELECT COUNT(*) AS total_persons FROM person`);
    const totalPersons = Number((trows as any[])[0]?.total_persons ?? 0);

    // One UNION query returning category/value/count
    // We intentionally include both "grouped" and "raw" variants for fields where the raw values can vary a lot.
    const [rows] = await conn.query(
      `
      SELECT category, value, cnt FROM (
        /* AGE GROUPS */
        SELECT
          'age_group' AS category,
          CASE
            WHEN dob IS NULL THEN 'Unknown/Blank'
            WHEN dob > CURDATE() THEN 'Invalid (DOB in future)'
            WHEN TIMESTAMPDIFF(YEAR, dob, CURDATE()) < 18 THEN 'Under 18'
            WHEN TIMESTAMPDIFF(YEAR, dob, CURDATE()) BETWEEN 18 AND 64 THEN '18-64'
            ELSE '65+'
          END AS value,
          COUNT(*) AS cnt
        FROM person
        GROUP BY value

        UNION ALL

        /* SEX AT BIRTH (ENUM) */
        SELECT
          'sex_at_birth' AS category,
          CASE
            WHEN sex_at_birth IS NULL OR TRIM(sex_at_birth) = '' THEN 'Unknown/Blank'
            WHEN sex_at_birth = 'M' THEN 'M'
            WHEN sex_at_birth = 'F' THEN 'F'
            WHEN sex_at_birth = 'X' THEN 'X'
            WHEN sex_at_birth = 'U' THEN 'U'
            ELSE 'Other/Unmapped'
          END AS value,
          COUNT(*) AS cnt
        FROM person
        GROUP BY value

        UNION ALL

        /* GENDER IDENTITY (GROUPED) */
        SELECT
          'gender_identity_grouped' AS category,
          CASE
            WHEN gender_identity IS NULL OR TRIM(gender_identity) = '' THEN 'Unknown/Blank'
            WHEN LOWER(gender_identity) LIKE '%trans%' THEN 'Transgender'
            WHEN LOWER(gender_identity) LIKE '%nonbinary%' OR LOWER(gender_identity) LIKE '%non-binary%' OR LOWER(gender_identity) LIKE '%genderqueer%' OR LOWER(gender_identity) LIKE '%enby%' THEN 'Non-binary / Genderqueer'
            WHEN LOWER(gender_identity) REGEXP '(^|[^a-z])man([^a-z]|$)' OR LOWER(gender_identity) = 'male' THEN 'Male'
            WHEN LOWER(gender_identity) REGEXP '(^|[^a-z])woman([^a-z]|$)' OR LOWER(gender_identity) = 'female' THEN 'Female'
            ELSE 'Other/Unmapped'
          END AS value,
          COUNT(*) AS cnt
        FROM person
        GROUP BY value

        UNION ALL

        /* GENDER IDENTITY (RAW) */
        SELECT
          'gender_identity_raw' AS category,
          COALESCE(NULLIF(TRIM(gender_identity), ''), 'Unknown/Blank') AS value,
          COUNT(*) AS cnt
        FROM person
        GROUP BY value

        UNION ALL

        /* ETHNICITY (GROUPED: Latino/Hispanic vs Not) */
        SELECT
          'ethnicity_grouped' AS category,
          CASE
            WHEN ethnicity IS NULL OR TRIM(ethnicity) = '' THEN 'Unknown/Blank'
            WHEN LOWER(ethnicity) REGEXP 'hisp|lat' THEN 'Latino/Hispanic'
            ELSE 'Not Latino/Hispanic'
          END AS value,
          COUNT(*) AS cnt
        FROM person
        GROUP BY value

        UNION ALL

        /* ETHNICITY (RAW) */
        SELECT
          'ethnicity_raw' AS category,
          COALESCE(NULLIF(TRIM(ethnicity), ''), 'Unknown/Blank') AS value,
          COUNT(*) AS cnt
        FROM person
        GROUP BY value

        UNION ALL

        /* RACE (GROUPED) */
        SELECT
          'race_grouped' AS category,
          CASE
            WHEN race IS NULL OR TRIM(race) = '' THEN 'Unknown/Blank'
            WHEN LOWER(race) LIKE '%black%' OR LOWER(race) LIKE '%african%' THEN 'Black/African American'
            WHEN LOWER(race) LIKE '%white%' THEN 'White'
            WHEN LOWER(race) LIKE '%asian%' THEN 'Asian'
            WHEN LOWER(race) LIKE '%hawai%' OR LOWER(race) LIKE '%pacific%' THEN 'Native Hawaiian/Pacific Islander'
            WHEN LOWER(race) LIKE '%american indian%' OR LOWER(race) LIKE '%alaska%' OR LOWER(race) LIKE '%native american%' THEN 'American Indian/Alaska Native'
            WHEN LOWER(race) LIKE '%middle eastern%' OR LOWER(race) LIKE '%north african%' OR LOWER(race) LIKE '%mene%' THEN 'Middle Eastern/North African'
            WHEN LOWER(race) LIKE '%multi%' OR LOWER(race) LIKE '%two%' OR LOWER(race) LIKE '%multiple%' THEN 'Multiracial/Two+'
            ELSE 'Other/Unmapped'
          END AS value,
          COUNT(*) AS cnt
        FROM person
        GROUP BY value

        UNION ALL

        /* RACE (RAW) */
        SELECT
          'race_raw' AS category,
          COALESCE(NULLIF(TRIM(race), ''), 'Unknown/Blank') AS value,
          COUNT(*) AS cnt
        FROM person
        GROUP BY value

        UNION ALL

        /* PRIMARY LANGUAGE (RAW) */
        SELECT
          'primary_language' AS category,
          COALESCE(NULLIF(TRIM(primary_language), ''), 'Unknown/Blank') AS value,
          COUNT(*) AS cnt
        FROM person
        GROUP BY value

        UNION ALL

        /* MARITAL STATUS (RAW) */
        SELECT
          'marital_status' AS category,
          COALESCE(NULLIF(TRIM(marital_status), ''), 'Unknown/Blank') AS value,
          COUNT(*) AS cnt
        FROM person
        GROUP BY value

        UNION ALL

        /* DATA COMPLETENESS SNAPSHOT */
        SELECT 'data_quality' AS category, 'Missing DOB' AS value, SUM(CASE WHEN dob IS NULL THEN 1 ELSE 0 END) AS cnt FROM person
        UNION ALL
        SELECT 'data_quality' AS category, 'Missing Race' AS value, SUM(CASE WHEN race IS NULL OR TRIM(race) = '' THEN 1 ELSE 0 END) AS cnt FROM person
        UNION ALL
        SELECT 'data_quality' AS category, 'Missing Ethnicity' AS value, SUM(CASE WHEN ethnicity IS NULL OR TRIM(ethnicity) = '' THEN 1 ELSE 0 END) AS cnt FROM person
        UNION ALL
        SELECT 'data_quality' AS category, 'Missing Gender Identity' AS value, SUM(CASE WHEN gender_identity IS NULL OR TRIM(gender_identity) = '' THEN 1 ELSE 0 END) AS cnt FROM person
        UNION ALL
        SELECT 'data_quality' AS category, 'Missing Sex at Birth' AS value, SUM(CASE WHEN sex_at_birth IS NULL OR TRIM(sex_at_birth) = '' THEN 1 ELSE 0 END) AS cnt FROM person
      ) x
      ORDER BY category, value
      `
    );

    onProgress?.({ phase: "writing", message: "Writing CSV..." });

    const lines: string[] = [];
    lines.push(`total_persons,${totalPersons}`);
    lines.push(""); // blank line
    lines.push(["category", "value", "count", "percent_of_total_persons"].join(","));

    let written = 0;
    for (const r of rows as any[]) {
      const category = normalizeBlank(r.category);
      const value = normalizeBlank(r.value);
      const count = Number(r.cnt ?? 0);
      const pct = totalPersons > 0 ? Math.round((count * 10000) / totalPersons) / 100 : 0; // 2 decimals
      lines.push([csvEscape(category), csvEscape(value), String(count), String(pct)].join(","));
      written++;
      if (written % 250 === 0) onProgress?.({ phase: "writing", rowsWritten: written });
    }

    fs.writeFileSync(absOut, lines.join("\n"), "utf-8");
    onProgress?.({ phase: "done", message: `Wrote ${written} rows`, rowsWritten: written });

    return { ok: true, message: "Demographics export complete.", outCsvPath: absOut, rowsWritten: written, totalPersons };
  } catch (err: any) {
    const msg = err?.message || String(err);
    onProgress?.({ phase: "error", message: msg });
    return { ok: false, message: `Demographics export failed: ${msg}`, outCsvPath: absOut };
  } finally {
    try { if (conn) await conn.end(); } catch {}
  }
}
