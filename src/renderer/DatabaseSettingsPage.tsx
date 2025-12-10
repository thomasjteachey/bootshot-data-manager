import DatabaseSettingsPanel from "./DatabaseSettingsPanel";

export default function DatabaseSettingsPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f0f",
        color: "white",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <DatabaseSettingsPanel onClose={() => window.close()} />
    </div>
  );
}
