const { app, BrowserWindow, shell, session } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 850,
    minHeight: 620,
    autoHideMenuBar: true,
    backgroundColor: "#f3f4f6",
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  });

  win.loadFile("index.html");

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders["User-Agent"] = "Mozilla/5.0";
    callback({ requestHeaders: details.requestHeaders });
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
