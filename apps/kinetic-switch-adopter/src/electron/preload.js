import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("kineticApi", {
  getState: () => ipcRenderer.invoke("state:get"),
  runAnalysis: (payload) => ipcRenderer.invoke("analysis:run", payload),
  runDiscovery: (payload) => ipcRenderer.invoke("discovery:run", payload),
  adoptSwitch: (payload) => ipcRenderer.invoke("adoption:save", payload),
  exportHaBundle: (payload) => ipcRenderer.invoke("ha:export", payload)
});
