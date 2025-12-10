import CanvasApp from "./CanvasApp";
import DatabaseSettingsPage from "./DatabaseSettingsPage";

export default function App() {
  const hash = window.location.hash.toLowerCase();
  const isDbSettings = hash.includes("db-settings");

  return isDbSettings ? <DatabaseSettingsPage /> : <CanvasApp />;
}
