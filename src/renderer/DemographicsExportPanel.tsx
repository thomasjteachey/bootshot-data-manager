import { useEffect, useMemo, useState } from "react";

type DemoProgress = {
  phase: "querying" | "writing" | "done" | "error";
  message?: string;
  rowsWritten?: number;
};

type DemoResult = {
  ok: boolean;
  message: string;
  outCsvPath?: string;
  rowsWritten?: number;
  totalPersons?: number;
};

type Result =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; result: DemoResult }
  | { state: "error"; result: DemoResult };

export default function DemographicsExportPanel(props: { onClose: () => void }) {
  const [outPath, setOutPath] = useState("");
  const [progress, setProgress] = useState<DemoProgress | null>(null);
  const [result, setResult] = useState<Result>({ state: "idle" });

  const canRun = useMemo(() => outPath.trim().length > 0 && result.state !== "running", [outPath, result.state]);

  useEffect(() => {
    const off = window.bootshot?.demographics?.onProgress?.((p: DemoProgress) => {
      setProgress(p);
    });
    return () => {
      off?.();
    };
  }, []);

  async function chooseOut() {
    const res = await window.bootshot.demographics.chooseOutCsv();
    if (!res.canceled && res.path) setOutPath(res.path);
  }

  async function runExport() {
    setResult({ state: "running" });
    setProgress({ phase: "querying", message: "Starting..." });

    const r = await window.bootshot.demographics.exportAllTime({ outCsvPath: outPath });
    if (r.ok) setResult({ state: "done", result: r });
    else setResult({ state: "error", result: r });
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
          <div style={{ fontSize: 18, fontWeight: 700 }}>Export Demographics (All Time)</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
            Saves a CSV showing counts and % of total persons for key demographic fields (race/ethnicity/sex at birth/gender identity/age groups,
            language, marital status) plus a quick missing-data snapshot.
          </div>
        </div>

        <button
          onClick={props.onClose}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.06)",
            color: "white",
            cursor: "pointer",
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
              placeholder="Choose where to save demographics-all-time.csv"
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
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.08)",
                color: "white",
                cursor: "pointer",
                whiteSpace: "nowrap",
                boxSizing: "border-box",
              }}
            >
              Browse…
            </button>

            <button
              disabled={!canRun}
              onClick={runExport}
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
                {typeof result.result.totalPersons === "number" ? <div>Total persons: {result.result.totalPersons}</div> : null}
                {result.result.outCsvPath ? <div>Saved: {result.result.outCsvPath}</div> : null}
              </div>
            ) : null}

            {result.state === "error" ? (
              <div style={{ marginTop: 6, opacity: 0.95 }}>❌ {result.result.message}</div>
            ) : null}
          </div>

          <div style={{ marginTop: 10, fontSize: 11, opacity: 0.7, lineHeight: 1.35 }}>
            The CSV begins with <code style={{ color: "#ddd" }}>total_persons,&lt;n&gt;</code> on its own line, then a table:
            <code style={{ color: "#ddd" }}> category,value,count,percent_of_total_persons</code>.
          </div>
        </div>
      </div>
    </div>
  );
}
