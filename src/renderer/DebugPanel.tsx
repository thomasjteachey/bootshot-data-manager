import { useEffect, useMemo, useState } from "react";

type DebugQueryResult = {
  ok: boolean;
  message: string;
  columns?: string[];
  rows?: any[];
};

function ResultTable(props: { result: DebugQueryResult | null }) {
  const r = props.result;
  if (!r) return <div style={{ fontSize: 12, opacity: 0.75 }}>No results yet.</div>;
  if (!r.ok) return <div style={{ fontSize: 12, opacity: 0.95 }}>❌ {r.message}</div>;

  const columns = r.columns ?? (r.rows && r.rows.length > 0 ? Object.keys(r.rows[0]) : []);
  const rows = Array.isArray(r.rows) ? r.rows : [];

  if (rows.length === 0) {
    return <div style={{ fontSize: 12, opacity: 0.95 }}>✅ {r.message} (0 rows)</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.95, marginBottom: 8 }}>✅ {r.message}</div>
      <div style={{ overflow: "auto", maxHeight: 320, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c}
                  style={{
                    textAlign: "left",
                    padding: "8px 10px",
                    borderBottom: "1px solid rgba(255,255,255,0.12)",
                    position: "sticky",
                    top: 0,
                    background: "rgba(0,0,0,0.65)",
                  }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                {columns.map((c) => (
                  <td
                    key={c}
                    style={{
                      padding: "8px 10px",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                      verticalAlign: "top",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      maxWidth: 340,
                    }}
                  >
                    {row?.[c] === null || row?.[c] === undefined ? "" : String(row?.[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DebugPanel(props: { onClose: () => void }) {
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [tableLimit, setTableLimit] = useState<number>(200);
  const [tableResult, setTableResult] = useState<DebugQueryResult | null>(null);

  const [multiDobLimit, setMultiDobLimit] = useState<number>(200);
  const [multiDobResult, setMultiDobResult] = useState<DebugQueryResult | null>(null);

  const [minRatioFirst, setMinRatioFirst] = useState<number>(0.9);
  const [minRatioLast, setMinRatioLast] = useState<number>(0.9);
  const [sameDob, setSameDob] = useState<boolean>(true);
  const [useSoundex, setUseSoundex] = useState<boolean>(true);
  const [procLimit, setProcLimit] = useState<number>(500);
  const [procResult, setProcResult] = useState<DebugQueryResult | null>(null);

  const labelStyle: any = { fontSize: 12, opacity: 0.8, marginBottom: 6 };
  const boxStyle: any = {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: 12,
    background: "rgba(255,255,255,0.04)",
  };

  const canRunSelectTable = useMemo(() => selectedTable.trim().length > 0, [selectedTable]);

  async function refreshTables() {
    const t = await window.bootshot.debug.listTables();
    setTables(t);
    if (!selectedTable && t.length > 0) setSelectedTable(t[0]);
  }

  useEffect(() => {
    refreshTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSelectTable() {
    setTableResult({ ok: true, message: "Running...", columns: [], rows: [] });
    const r = await window.bootshot.debug.selectTable({ table: selectedTable, limit: tableLimit });
    setTableResult(r);
  }

  async function runMultiDob() {
    setMultiDobResult({ ok: true, message: "Running...", columns: [], rows: [] });
    const r = await window.bootshot.debug.multiDob({ limit: multiDobLimit });
    setMultiDobResult(r);
  }

  async function runProc() {
    setProcResult({ ok: true, message: "Running...", columns: [], rows: [] });
    const r = await window.bootshot.debug.similarFullName({
      minRatioFirst,
      minRatioLast,
      sameDob,
      useSoundex,
      limit: procLimit,
    });
    setProcResult(r);
  }

  const inputStyle: any = {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.35)",
    color: "white",
    outline: "none",
    boxSizing: "border-box",
  };

  const buttonStyle: any = {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxSizing: "border-box",
  };

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Debug Tools</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
            Read-only helpers: view <code style={{ color: "white" }}>person_name_multi_dob_data</code>, browse any table, and run
            <code style={{ color: "white" }}> debug_similar_full_name</code>.
          </div>
        </div>

        <button onClick={props.onClose} style={{ ...buttonStyle, padding: "8px 10px" }}>
          Close
        </button>
      </div>

      <div style={{ height: 14 }} />

      <div style={{ display: "grid", gap: 12 }}>
        {/* 1) multi-dob */}
        <div style={boxStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Multi-DOB name collisions</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                Runs <code style={{ color: "white" }}>SELECT * FROM person_name_multi_dob_data</code>.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Limit</div>
              <input
                type="number"
                value={multiDobLimit}
                onChange={(e) => setMultiDobLimit(Number(e.target.value))}
                style={{ ...inputStyle, width: 110 }}
              />
              <button onClick={runMultiDob} style={buttonStyle}>
                Run
              </button>
            </div>
          </div>

          <div style={{ height: 10 }} />
          <ResultTable result={multiDobResult} />
        </div>

        {/* 2) arbitrary table */}
        <div style={boxStyle}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Browse table</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Select any table and run a limited</div>

          <div style={{ height: 10 }} />

          <div
            style={{
              display: "grid",
              gap: 8,
              alignItems: "end",
              gridTemplateColumns: "minmax(260px, 1fr) 140px auto",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={labelStyle}>Table</div>
              <select value={selectedTable} onChange={(e) => setSelectedTable(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
                {tables.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={labelStyle}>Limit</div>
              <input
                type="number"
                value={tableLimit}
                onChange={(e) => setTableLimit(Number(e.target.value))}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={refreshTables} style={buttonStyle}>
                Refresh tables
              </button>
              <button
                disabled={!canRunSelectTable}
                onClick={runSelectTable}
                style={{ ...buttonStyle, opacity: canRunSelectTable ? 1 : 0.5 }}
              >
                Run
              </button>
            </div>
          </div>

          <div style={{ height: 10 }} />
          <ResultTable result={tableResult} />
        </div>

        {/* 3) proc */}
        <div style={boxStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Similar full name</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                Runs <code style={{ color: "white" }}>CALL debug_similar_full_name(...)</code>.
              </div>
            </div>
            <button onClick={runProc} style={buttonStyle}>
              Run
            </button>
          </div>

          <div style={{ height: 10 }} />

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <div>
              <div style={labelStyle}>Min ratio (first)</div>
              <input
                type="number"
                step="0.01"
                value={minRatioFirst}
                onChange={(e) => setMinRatioFirst(Number(e.target.value))}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div>
              <div style={labelStyle}>Min ratio (last)</div>
              <input
                type="number"
                step="0.01"
                value={minRatioLast}
                onChange={(e) => setMinRatioLast(Number(e.target.value))}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div>
              <div style={labelStyle}>Limit</div>
              <input
                type="number"
                value={procLimit}
                onChange={(e) => setProcLimit(Number(e.target.value))}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div>
              <div style={labelStyle}>Options</div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", paddingTop: 8 }}>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, opacity: 0.95 }}>
                  <input type="checkbox" checked={sameDob} onChange={(e) => setSameDob(e.target.checked)} />
                  Same DOB
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, opacity: 0.95 }}>
                  <input type="checkbox" checked={useSoundex} onChange={(e) => setUseSoundex(e.target.checked)} />
                  SOUNDEX pref
                </label>
              </div>
            </div>
          </div>

          <div style={{ height: 10 }} />
          <ResultTable result={procResult} />
        </div>
      </div>
    </div>
  );
}
