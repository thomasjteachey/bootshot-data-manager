import { useEffect, useMemo, useState } from "react";

type MetricsProgress = {
  phase: "querying" | "writing" | "done" | "error";
  message?: string;
  rowsWritten?: number;
};

type MetricsExportResult = {
  ok: boolean;
  message: string;
  outCsvPath?: string;
  rowsWritten?: number;
};

type ResultState =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; result: MetricsExportResult }
  | { state: "error"; result: MetricsExportResult };

export default function MetricsExportPanel(props: { onClose: () => void }) {
  const [outPath, setOutPath] = useState<string>("");
  const [progress, setProgress] = useState<MetricsProgress | null>(null);
  const [result, setResult] = useState<ResultState>({ state: "idle" });

  const canRun = useMemo(() => !!outPath && result.state !== "running", [outPath, result.state]);

  useEffect(() => {
    const off = window.bootshot?.metrics?.onProgress?.((p: MetricsProgress) => {
      setProgress(p);
    });
    return () => {
      off?.();
    };
  }, []);

  async function chooseOut() {
    const res = await window.bootshot.metrics.chooseOutCsv();
    if (!res.canceled && res.path) setOutPath(res.path);
  }

  async function runExport() {
    setResult({ state: "running" });
    setProgress({ phase: "querying", message: "Starting..." });

    try {
      const r: MetricsExportResult = await window.bootshot.metrics.exportMonthly({ outCsvPath: outPath });
      if (r.ok) setResult({ state: "done", result: r });
      else setResult({ state: "error", result: r });
    } catch {
      setResult({ state: "error", result: { ok: false, message: "Export failed unexpectedly." } });
    }
  }

  const labelStyle: any = { fontSize: 12, opacity: 0.8, marginBottom: 6 };
  const boxStyle: any = {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: 12,
    background: "rgba(255,255,255,0.04)",
  };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Export Monthly Metrics</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4, lineHeight: 1.35 }}>
            Saves a CSV for the last 12 months (including the current month) plus an ANNUAL rollup row, with absolute counts and %
            of served totals (per system) for cross-program usage (pharmacy/pantry/clinic + household pantry).
          </div>
        </div>

        <button
          onClick={props.onClose}
          disabled={result.state === "running"}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.18)",
            background: result.state === "running" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
            color: "white",
            cursor: result.state === "running" ? "not-allowed" : "pointer",
          }}
        >
          Close
        </button>
      </div>

      <div style={{ height: 14 }} />

      <div style={{ display: "grid", gap: 12 }}>
        <div style={boxStyle}>
          <div style={labelStyle}>Output CSV</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={outPath}
              readOnly
              placeholder="Choose where to save monthly-metrics.csv"
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(0,0,0,0.35)",
                color: "white",
                outline: "none",
                boxSizing: "border-box",
              }}
            />

            <button
              onClick={chooseOut}
              disabled={result.state === "running"}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.18)",
                background: result.state === "running" ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)",
                color: "white",
                cursor: result.state === "running" ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                boxSizing: "border-box",
              }}
            >
              Browse…
            </button>

            <button
              onClick={runExport}
              disabled={!canRun}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.18)",
                background: canRun ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
                color: "white",
                cursor: canRun ? "pointer" : "not-allowed",
                fontWeight: 600,
                whiteSpace: "nowrap",
                boxSizing: "border-box",
              }}
            >
              {result.state === "running" ? "Exporting…" : "Export CSV"}
            </button>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85, lineHeight: 1.4 }}>
            {progress ? (
              <div>
                <b>{progress.phase.toUpperCase()}</b>
                {progress.message ? <> — {progress.message}</> : null}
                {typeof progress.rowsWritten === "number" ? <div>Rows written: {progress.rowsWritten}</div> : null}
              </div>
            ) : (
              <div>Idle</div>
            )}

            {result.state === "done" ? (
              <div style={{ marginTop: 6, opacity: 0.95 }}>
                ✅ {result.result.message}
                {typeof result.result.rowsWritten === "number" ? <div>Rows written: {result.result.rowsWritten}</div> : null}
                {result.result.outCsvPath ? <div>Saved: {result.result.outCsvPath}</div> : null}
              </div>
            ) : null}

            {result.state === "error" ? (
              <div style={{ marginTop: 6, opacity: 0.95 }}>❌ {result.result.message}</div>
            ) : null}
          </div>

          <div style={{ marginTop: 10, fontSize: 11, opacity: 0.7, lineHeight: 1.35 }}>
            Tip: This relies on the <code style={{ color: "#ddd" }}>person</code> and <code style={{ color: "#ddd" }}>household</code> tables
            being populated (run your merge / make-everything flow after importing the export CSVs).
          </div>
        </div>
      </div>
    </div>
  );
}
