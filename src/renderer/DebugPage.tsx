import DebugPanel from "./DebugPanel";

export default function DebugPage() {
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
      <DebugPanel onClose={() => window.close()} />
    </div>
  );
}
