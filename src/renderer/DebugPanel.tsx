import { useEffect, useMemo, useState, type ReactNode } from "react";

type DebugQueryResult = {
  ok: boolean;
  message: string;
  columns?: string[];
  rows?: any[];
};

function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(result: DebugQueryResult): string {
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const columns =
    result.columns ??
    (rows.length > 0 ? Object.keys(rows[0]) : []);

  const lines: string[] = [];
  lines.push(columns.map(csvEscape).join(","));

  for (const r of rows) {
    const line = columns.map((c) => csvEscape((r as any)?.[c])).join(",");
    lines.push(line);
  }

  return lines.join("\n");
}

function downloadCsv(filename: string, csvText: string) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Card(props: { title: string; subtitle?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.04)",
        padding: 14,
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{props.title}</div>
          {props.subtitle ? (
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{props.subtitle}</div>
          ) : null}
        </div>
        {props.right}
      </div>

      <div style={{ marginTop: 12 }}>{props.children}</div>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>{children}</div>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        boxSizing: "border-box",
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(0,0,0,0.35)",
        color: "white",
        outline: "none",
        ...(props.style as any),
      }}
    />
  );
}

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "default" }) {
  const kind = props.kind ?? "default";
  return (
    <button
      {...props}
      style={{
        boxSizing: "border-box",
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.18)",
        background: kind === "primary" ? "rgba(120,160,255,0.28)" : "rgba(255,255,255,0.06)",
        color: "white",
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.6 : 1,
        ...(props.style as any),
      }}
    />
  );
}

export default function DebugPanel({ onClose }: { onClose: () => void }) {
  const [tables, setTables] = useState<string[]>([]);
  const [table, setTable] = useState<string>("");
  const [limitA, setLimitA] = useState<number>(200);
  const [limitB, setLimitB] = useState<number>(200);
  const [minFirst, setMinFirst] = useState<number>(0.9);
  const [minLast, setMinLast] = useState<number>(0.9);
  const [limitC, setLimitC] = useState<number>(500);
  const [sameDob, setSameDob] = useState<boolean>(true);
  const [useSoundex, setUseSoundex] = useState<boolean>(true);

  const [statusA, setStatusA] = useState<string>("No export yet.");
  const [statusB, setStatusB] = useState<string>("No export yet.");
  const [statusC, setStatusC] = useState<string>("No export yet.");

  const [busyA, setBusyA] = useState(false);
  const [busyB, setBusyB] = useState(false);
  const [busyC, setBusyC] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const t = await window.bootshot.debug.listTables();
        setTables(t);
        if (!table && t.length > 0) setTable(t[0]);
      } catch {
        // ignore; debug window will show export errors on click
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tableOptions = useMemo(() => tables, [tables]);

  async function exportMultiDob() {
    setBusyA(true);
    setStatusA("Exporting...");
    try {
      const r: DebugQueryResult = await window.bootshot.debug.multiDob({ limit: limitA });
      if (!r.ok) {
        setStatusA(`❌ ${r.message}`);
        return;
      }
      const csv = toCsv(r);
      downloadCsv("person_name_multi_dob_data.csv", csv);
      const n = Array.isArray(r.rows) ? r.rows.length : 0;
      setStatusA(`✅ Exported ${n} row(s) to CSV (Downloads).`);
    } catch (err: any) {
      setStatusA(`❌ ${err?.message || String(err)}`);
    } finally {
      setBusyA(false);
    }
  }

  async function refreshTables() {
    setStatusB("Refreshing table list...");
    try {
      const t = await window.bootshot.debug.listTables();
      setTables(t);
      if (!t.includes(table)) setTable(t[0] ?? "");
      setStatusB(`✅ Loaded ${t.length} table(s).`);
    } catch (err: any) {
      setStatusB(`❌ ${err?.message || String(err)}`);
    }
  }

  async function exportTable() {
    if (!table) {
      setStatusB("❌ Select a table first.");
      return;
    }
    setBusyB(true);
    setStatusB("Exporting...");
    try {
      const r: DebugQueryResult = await window.bootshot.debug.selectTable({ table, limit: limitB });
      if (!r.ok) {
        setStatusB(`❌ ${r.message}`);
        return;
      }
      const csv = toCsv(r);
      downloadCsv(`${table}.csv`, csv);
      const n = Array.isArray(r.rows) ? r.rows.length : 0;
      setStatusB(`✅ Exported ${n} row(s) to CSV (Downloads).`);
    } catch (err: any) {
      setStatusB(`❌ ${err?.message || String(err)}`);
    } finally {
      setBusyB(false);
    }
  }

  async function exportSimilarFullName() {
    setBusyC(true);
    setStatusC("Exporting...");
    try {
      const r: DebugQueryResult = await window.bootshot.debug.similarFullName({
        minFirst,
        minLast,
        sameDob,
        useSoundex,
        limit: limitC,
      });
      if (!r.ok) {
        setStatusC(`❌ ${r.message}`);
        return;
      }
      const csv = toCsv(r);
      downloadCsv("debug_similar_full_name.csv", csv);
      const n = Array.isArray(r.rows) ? r.rows.length : 0;
      setStatusC(`✅ Exported ${n} row(s) to CSV (Downloads).`);
    } catch (err: any) {
      setStatusC(`❌ ${err?.message || String(err)}`);
    } finally {
      setBusyC(false);
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800 }}>Debug Tools</div>
          <div style={{ opacity: 0.75, marginTop: 6, fontSize: 13 }}>
            Read-only helpers. This screen exports CSV files (no on-screen tables).
          </div>
        </div>
        <Button onClick={onClose}>Close</Button>
      </div>

      <Card
        title="Multi-DOB name collisions"
        subtitle="Exports SELECT * FROM person_name_multi_dob_data."
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 220 }}>
              <Label>Limit</Label>
              <Input
                type="number"
                min={1}
                max={200000}
                value={limitA}
                onChange={(e) => setLimitA(Number(e.target.value))}
              />
            </div>
            <Button kind="primary" onClick={exportMultiDob} disabled={busyA}>
              Export CSV
            </Button>
          </div>
        }
      >
        <div style={{ fontSize: 12, opacity: 0.9 }}>{statusA}</div>
      </Card>

      <Card
        title="Browse table"
        subtitle="Exports SELECT * FROM a table/view in the current database."
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Button onClick={refreshTables} disabled={busyB}>
              Refresh tables
            </Button>
            <Button kind="primary" onClick={exportTable} disabled={busyB || !table}>
              Export CSV
            </Button>
          </div>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 12, alignItems: "end" }}>
          <div>
            <Label>Table</Label>
            <select
              value={table}
              onChange={(e) => setTable(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(0,0,0,0.35)",
                color: "white",
                outline: "none",
              }}
            >
              {tableOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Limit</Label>
            <Input
              type="number"
              min={1}
              max={200000}
              value={limitB}
              onChange={(e) => setLimitB(Number(e.target.value))}
            />
          </div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 10 }}>{statusB}</div>
      </Card>

      <Card
        title="Similar full name"
        subtitle="Exports CALL debug_similar_full_name(...)."
        right={
          <Button kind="primary" onClick={exportSimilarFullName} disabled={busyC}>
            Export CSV
          </Button>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "240px 240px 220px 1fr", gap: 12, alignItems: "end" }}>
          <div>
            <Label>Min ratio (first)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              max={1}
              value={minFirst}
              onChange={(e) => setMinFirst(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Min ratio (last)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              max={1}
              value={minLast}
              onChange={(e) => setMinLast(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Limit</Label>
            <Input
              type="number"
              min={1}
              max={200000}
              value={limitC}
              onChange={(e) => setLimitC(Number(e.target.value))}
            />
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", paddingTop: 18 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
              <input type="checkbox" checked={sameDob} onChange={(e) => setSameDob(e.target.checked)} />
              Same DOB
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
              <input type="checkbox" checked={useSoundex} onChange={(e) => setUseSoundex(e.target.checked)} />
              SOUNDEX pref
            </label>
          </div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 10 }}>{statusC}</div>
      </Card>

      <div style={{ fontSize: 12, opacity: 0.6 }}>
        Note: CSVs are downloaded via the embedded browser (typically to your Downloads folder).
      </div>
    </div>
  );
}
