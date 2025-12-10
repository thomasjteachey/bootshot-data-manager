import SettingsPanel from "./SettingsPanel";

export default function SettingsPage() {
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
      <SettingsPanel onClose={() => window.close()} />
    </div>
  );
}
