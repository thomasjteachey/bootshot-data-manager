import { app, BrowserWindow } from "electron";
import { join } from "path";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#000000",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
    },
  });

  // electron-vite dev URL
  const devUrl = process.env.ELECTRON_RENDERER_URL;

  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
