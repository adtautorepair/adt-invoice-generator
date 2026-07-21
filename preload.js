const { contextBridge, ipcRenderer } = require('electron');

// Native bridge available only inside the desktop app.
// The web page checks for window.adtNative / window.adtMail and uses these when present.
contextBridge.exposeInMainWorld('adtNative', {
  isDesktop: true,
  savePdf: (html, defaultName) => ipcRenderer.invoke('invoice:savePdf', { html, defaultName }),
  openPdf: (html, name) => ipcRenderer.invoke('invoice:openPdf', { html, name }),
  print: (html) => ipcRenderer.invoke('invoice:print', { html })
});

contextBridge.exposeInMainWorld('adtMail', {
  send: (opts) => ipcRenderer.invoke('mail:send', opts),
  test: (opts) => ipcRenderer.invoke('mail:test', opts)
});

contextBridge.exposeInMainWorld('adtAI', {
  improve: (opts) => ipcRenderer.invoke('ai:improve', opts),
  onChunk: (cb) => {
    const listener = (e, data) => cb(data);
    ipcRenderer.on('ai:chunk', listener);
    return () => ipcRenderer.removeListener('ai:chunk', listener);
  }
});
