import AppendExportsPanel from "./AppendExportsPanel";

export default function AppendExportsPage() {
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
      <AppendExportsPanel onClose={() => window.close()} />
    </div>
  );
}
