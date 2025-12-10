import { useEffect, useMemo, useState } from "react";

type DbForm = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
};

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<DbForm>({
    host: "localhost",
    port: 3306,
    user: "",
    password: "",
    database: "",
    ssl: false,
  });

  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    window.bootshot?.settings?.getDb?.()
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

  return (
    <div
      style={{
        maxWidth: 480,
        background: "#111",
        border: "1px solid #2a2a2a",
        borderRadius: 10,
        padding: 16,
        boxShadow: "0 10px 40px rgba(0,0,0,0.45)",
      }}
    >
      <div style={{ fontSize: 18, marginBottom: 12 }}>
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

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={!canSave}>
          Save
        </button>
        <button onClick={onClose}>Cancel</button>
      </div>

      <div style={{ marginTop: 10, fontSize: 10, opacity: 0.5 }}>
        Password is stored locally in your app settings file.
      </div>
    </div>
  );
}
