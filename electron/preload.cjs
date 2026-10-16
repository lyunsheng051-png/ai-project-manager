const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  request: async (action, payload) => {
    const result = await ipcRenderer.invoke('pm:request', { action, payload });
    if (!result.ok) throw new Error(result.error);
    return result.value;
  },
  subscribe: (listener) => {
    const handler = (_event, value) => listener(value);
    ipcRenderer.on('pm:event', handler);
    return () => ipcRenderer.removeListener('pm:event', handler);
  },
});
