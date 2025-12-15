import DemographicsExportPanel from "./DemographicsExportPanel";

export default function DemographicsExportPage() {
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
      <DemographicsExportPanel onClose={() => window.close()} />
    </div>
  );
}
