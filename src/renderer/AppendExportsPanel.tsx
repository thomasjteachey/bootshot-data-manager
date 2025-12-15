import { useEffect, useMemo, useState } from "react";

type Progress = {
  phase: string;
  rowsParsed?: number;
  rowsInserted?: number;
  message?: string;
};

type Result =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; ok: boolean; message: string };

export default function AppendExportsPanel({ onClose }: { onClose: () => void }) {
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [csvPath, setCsvPath] = useState<string>("");
  const [hasHeader, setHasHeader] = useState<boolean>(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    const off = window.bootshot.exports.onProgress((p) => setProgress(p));
    return () => off();
  }, []);

  const refreshTables = async () => {
    setStatus("");
    try {
      const list = await window.bootshot.exports.listExportTables();
      setTables(list);
      if (!selectedTable && list.length > 0) setSelectedTable(list[0]);
      if (list.length === 0) {
        setStatus(
          "No export tables found. (Expected tables ending with _export in the selected database.)"
        );
      }
    } catch {
      setStatus("Failed to load export tables. Check your database connection settings.");
    }
  };

  useEffect(() => {
    refreshTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canAppend = useMemo(() => {
    return !!selectedTable && !!csvPath && result.kind !== "running";
  }, [selectedTable, csvPath, result.kind]);

  const chooseCsv = async () => {
    setStatus("");
    const res = await window.bootshot.exports.chooseCsv();
    if (!res.canceled && res.path) {
      setCsvPath(res.path);
    }
  };

  const append = async () => {
    setStatus("");
    setResult({ kind: "running" });
    setProgress({ phase: "starting", message: "Starting import..." });

    try {
      const res = await window.bootshot.exports.appendCsv({
        table: selectedTable,
        csvPath,
        hasHeader,
      });

      setResult({ kind: "done", ok: res.ok, message: res.message });
    } catch {
      setResult({ kind: "done", ok: false, message: "Import failed unexpectedly." });
    }
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    background: "#0b0b0b",
    color: "white",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    opacity: 0.75,
    marginBottom: 4,
  };

  const progressText = (() => {
    if (!progress) return "";
    const bits: string[] = [];
    if (progress.message) bits.push(progress.message);
    if (typeof progress.rowsInserted === "number" || typeof progress.rowsParsed === "number") {
      const ins = progress.rowsInserted ?? 0;
      const parsed = progress.rowsParsed ?? 0;
      bits.push(`Inserted ${ins} / Parsed ${parsed}`);
    }
    return bits.join(" — ");
  })();

  const resultColor = result.kind === "done" ? (result.ok ? "#b9ffb9" : "#ffb9b9") : undefined;

  return (
    <div
      style={{
        maxWidth: 720,
        background: "#111",
        border: "1px solid #2a2a2a",
        borderRadius: 10,
        padding: 16,
        boxShadow: "0 10px 40px rgba(0,0,0,0.45)",
      }}
    >
      <div style={{ fontSize: 20, marginBottom: 10 }}>Append Export CSV</div>

      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 14, lineHeight: 1.4 }}>
        This appends rows into one of your <code style={{ color: "#ddd" }}>*_export</code> tables.
        CSV files are expected to match the exact column order of the table (Impact format).
        <br />
        <br />
        After the append completes, the app will also run your non-destructive patch flow (the same
        merge steps as <code style={{ color: "#ddd" }}>make_everything()</code>, but without truncating) so
        new people/household links get created immediately.
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <label>
          <div style={labelStyle}>Export table</div>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              style={fieldStyle}
            >
              {tables.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button onClick={refreshTables} style={{ minWidth: 110 }}>
              Refresh
            </button>
          </div>
        </label>

        <label>
          <div style={labelStyle}>CSV file (no header row by default)</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={csvPath} readOnly placeholder="Choose a CSV..." style={fieldStyle} />
            <button onClick={chooseCsv} style={{ minWidth: 110 }}>
              Browse...
            </button>
          </div>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={hasHeader}
            onChange={(e) => setHasHeader(e.target.checked)}
            disabled={result.kind === "running"}
          />
          <span style={{ fontSize: 12, opacity: 0.85 }}>CSV includes a header row (skip first line)</span>
        </label>
      </div>

      {status && (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>{status}</div>
      )}

      {progressText && result.kind === "running" && (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>{progressText}</div>
      )}

      {result.kind === "done" && (
        <div style={{ marginTop: 10, fontSize: 12, color: resultColor }}>{result.message}</div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={append} disabled={!canAppend}>
          {result.kind === "running" ? "Appending..." : "Append Rows"}
        </button>
        <button onClick={onClose} disabled={result.kind === "running"}>
          Close
        </button>
      </div>

      <div style={{ marginTop: 12, fontSize: 10, opacity: 0.55, lineHeight: 1.4 }}>
        Tip: If you don’t see tables here, verify your Database Settings points at the schema that contains the export tables.
      </div>
    </div>
  );
}
