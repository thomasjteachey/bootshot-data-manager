import CanvasApp from "./CanvasApp";
import DatabaseSettingsPage from "./DatabaseSettingsPage";
import AppendExportsPage from "./AppendExportsPage";
import MetricsExportPage from "./MetricsExportPage";
import DemographicsExportPage from "./DemographicsExportPage";
import DebugPage from "./DebugPage";

export default function App() {
  const hash = window.location.hash.toLowerCase();
  const isDbSettings = hash.includes("db-settings");
  const isAppendExports = hash.includes("append-exports");
  const isMetricsExport = hash.includes("metrics-export");
  const isDemographicsExport = hash.includes("demographics-export");
  const isDebug = hash.includes("debug");

  if (isDbSettings) return <DatabaseSettingsPage />;
  if (isAppendExports) return <AppendExportsPage />;
  if (isMetricsExport) return <MetricsExportPage />;
  if (isDemographicsExport) return <DemographicsExportPage />;
  if (isDebug) return <DebugPage />;
  return <CanvasApp />;
}
