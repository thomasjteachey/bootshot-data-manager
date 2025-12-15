import MetricsExportPanel from "./MetricsExportPanel";

export default function MetricsExportPage() {
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
      <MetricsExportPanel onClose={() => window.close()} />
    </div>
  );
}
