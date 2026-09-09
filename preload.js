const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("treinosAPI", {
  getLatestTrainings: () => ipcRenderer.invoke("get-latest-trainings")
});
