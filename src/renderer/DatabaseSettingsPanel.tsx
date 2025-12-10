import { useEffect, useMemo, useState } from "react";

type DbForm = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
};

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "result"; ok: boolean; message: string };

export default function DatabaseSettingsPanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const [form, setForm] = useState<DbForm>({
    host: "localhost",
    port: 3306,
    user: "",
    password: "",
    database: "",
    ssl: false,
  });

  const [status, setStatus] = useState<string>("");
  const [testState, setTestState] = useState<TestState>({ kind: "idle" });

  useEffect(() => {
    window.bootshot.settings
      .getDb()
      .then((db) => setForm(db))
      .catch(() => {});
  }, []);

  const update = <K extends keyof DbForm>(key: K, value: DbForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const canSave = useMemo(() => {
    return (
      !!form.host &&
      !!form.user &&
      !!form.database &&
      Number.isFinite(form.port)
    );
  }, [form]);

  const save = async () => {
    setStatus("");
    try {
      await window.bootshot.settings.setDb(form);
      setStatus("Saved.");
      onClose();
    } catch {
      setStatus("Failed to save settings.");
    }
  };

  const testConnection = async () => {
    setStatus("");
    setTestState({ kind: "testing" });

    try {
      const res = await window.bootshot.db.testConnection(form);
      setTestState({
        kind: "result",
        ok: res.ok,
        message: res.ok ? "Connection successful." : res.message || "Connection failed.",
      });
    } catch {
      setTestState({
        kind: "result",
        ok: false,
        message: "Connection failed unexpectedly.",
      });
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

  const testLabel = (() => {
    if (testState.kind === "testing") return "Testing...";
    return "Test Connection";
  })();

  const testColor = (() => {
    if (testState.kind !== "result") return undefined;
    return testState.ok ? "#b9ffb9" : "#ffb9b9";
  })();

  return (
    <div
      style={{
        maxWidth: 520,
        background: "#111",
        border: "1px solid #2a2a2a",
        borderRadius: 10,
        padding: 16,
        boxShadow: "0 10px 40px rgba(0,0,0,0.45)",
      }}
    >
      <div style={{ fontSize: 20, marginBottom: 14 }}>
        Database Settings
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <label>
          <div style={labelStyle}>Host</div>
          <input
            value={form.host}
            onChange={(e) => update("host", e.target.value)}
            style={fieldStyle}
          />
        </label>

        <label>
          <div style={labelStyle}>Port</div>
          <input
            type="number"
            value={form.port}
            onChange={(e) => update("port", Number(e.target.value))}
            style={fieldStyle}
          />
        </label>

        <label>
          <div style={labelStyle}>User</div>
          <input
            value={form.user}
            onChange={(e) => update("user", e.target.value)}
            style={fieldStyle}
          />
        </label>

        <label>
          <div style={labelStyle}>Password</div>
          <input
            type="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            style={fieldStyle}
          />
        </label>

        <label>
          <div style={labelStyle}>Database</div>
          <input
            value={form.database}
            onChange={(e) => update("database", e.target.value)}
            style={fieldStyle}
          />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={form.ssl}
            onChange={(e) => update("ssl", e.target.checked)}
          />
          <span style={{ fontSize: 12, opacity: 0.85 }}>Use SSL</span>
        </label>
      </div>

      {status && (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
          {status}
        </div>
      )}

      {testState.kind === "result" && (
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: testColor,
          }}
        >
          {testState.message}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={save} disabled={!canSave}>
          Save
        </button>
        <button onClick={testConnection} disabled={testState.kind === "testing"}>
          {testLabel}
        </button>
        <button onClick={onClose}>Close</button>
      </div>

      <div style={{ marginTop: 12, fontSize: 10, opacity: 0.5 }}>
        Your credentials are stored locally in your app settings file.
      </div>
    </div>
  );
}
