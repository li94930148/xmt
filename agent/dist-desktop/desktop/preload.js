"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { contextBridge, ipcRenderer } = require('electron');
const api = { getState: () => ipcRenderer.invoke('agent:get-state'), setup: (input) => ipcRenderer.invoke('agent:setup', input), openDouyinLogin: () => ipcRenderer.invoke('agent:login-open'), completeDouyinLogin: () => ipcRenderer.invoke('agent:login-complete'), syncNow: () => ipcRenderer.invoke('agent:sync'), saveSettings: input => ipcRenderer.invoke('agent:settings', input), chooseChrome: () => ipcRenderer.invoke('agent:choose-chrome'), openLogs: () => ipcRenderer.invoke('agent:open-logs'), onState(listener) { const handler = (_event, state) => listener(state); ipcRenderer.on('agent:state', handler); return () => ipcRenderer.removeListener('agent:state', handler); } };
contextBridge.exposeInMainWorld('xmtAgent', api);
