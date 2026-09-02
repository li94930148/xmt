import {contextBridge,ipcRenderer} from 'electron';
import {createDesktopApi} from './preloadApi.js';

contextBridge.exposeInMainWorld('xmtAgent',createDesktopApi(ipcRenderer));
