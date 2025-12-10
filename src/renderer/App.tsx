import CanvasApp from "./CanvasApp";
import SettingsPage from "./SettingsPage";

export default function App() {
  const hash = window.location.hash.toLowerCase();
  const isSettings = hash.includes("settings");

  return isSettings ? <SettingsPage /> : <CanvasApp />;
}
