import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain } from "electron";
import {
  analyzeSignal,
  discoverSwitches,
  getPersistedState
} from "../core/discovery-service.js";
import {
  adoptSwitch,
  exportHomeAssistantBundle
} from "../core/adoption-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  win.loadFile(path.join(__dirname, "index.html"));
}

ipcMain.handle("state:get", () => getPersistedState());
ipcMain.handle("analysis:run", (_, payload) => analyzeSignal(payload));
ipcMain.handle("discovery:run", (_, payload) => discoverSwitches(payload));
ipcMain.handle("adoption:save", (_, payload) => adoptSwitch(payload));
ipcMain.handle("ha:export", (_, payload) => exportHomeAssistantBundle(payload));

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
