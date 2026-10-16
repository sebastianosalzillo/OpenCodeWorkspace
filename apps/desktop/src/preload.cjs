'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const methods = ['status', 'save-settings', 'pair', 'start', 'stop', 'disconnect', 'choose-directory', 'set-autostart'];
const api = Object.fromEntries(methods.map(name => [name, (data) => ipcRenderer.invoke(`workspace:${name}`, data)]));
api.onStatus = (fn) => {
  const listener = (_, status) => fn(status);
  ipcRenderer.on('workspace:status', listener);
  return () => ipcRenderer.removeListener('workspace:status', listener);
};
contextBridge.exposeInMainWorld('workspace', api);
