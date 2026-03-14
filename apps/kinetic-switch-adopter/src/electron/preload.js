const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kineticApi", {
  getState: () => ipcRenderer.invoke("state:get"),
  getAmbientWeatherProtocols: () => ipcRenderer.invoke("weather:ambient-protocols"),
  runAnalysis: (payload) => ipcRenderer.invoke("analysis:run", payload),
  runDiscovery: (payload) => ipcRenderer.invoke("discovery:run", payload),
  runWeatherDiscovery: (payload) => ipcRenderer.invoke("discovery:run-weather", payload),
  adoptSwitch: (payload) => ipcRenderer.invoke("adoption:save", payload),
  adoptWeatherSensor: (payload) => ipcRenderer.invoke("adoption:save-weather", payload),
  exportHaBundle: (payload) => ipcRenderer.invoke("ha:export", payload),
  exportWeatherHaBundle: (payload) => ipcRenderer.invoke("ha:export-weather", payload)
});
