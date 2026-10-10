const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  getInitialDataToolConfig: () => ipcRenderer.sendSync('get-initial-datatool-config'),
  loadDataToolConfig: () => ipcRenderer.invoke('load-datatool-config'),
  saveDataToolConfig: (data) => ipcRenderer.invoke('save-datatool-config', data),
  clearTool7WebData: () => ipcRenderer.invoke('tool7-clear-web-data'),
  pasteAndSendImage: (base64Png, targetWcId) => ipcRenderer.send('tool7-paste-and-send-image', base64Png, targetWcId),
  pasteAndSendImageAsync: (base64Png, targetWcId) => ipcRenderer.invoke('tool7-paste-and-send-image-async', base64Png, targetWcId),
  downloadWebImages: (urls, targetCount, pageUrl) => ipcRenderer.invoke('download-web-images', { urls, targetCount, pageUrl }),
  clearSentImagesHistory: () => ipcRenderer.invoke('clear-sent-images-history'),
  fetchImageDataUrl: (url, referer) => ipcRenderer.invoke('tool7-fetch-image-data-url', { url, referer }),
  onTool7ExecuteWebFlow: (callback) => ipcRenderer.on('tool7-execute-web-flow', (event, url) => callback(url)),
  processGeminiMessage: (payload) => ipcRenderer.invoke('tool2-process-gemini-message', payload),
  processGrokMessage: (payload) => ipcRenderer.invoke('tool2-process-gemini-message', payload),
  pasteAndSendText: (text, targetWcId) => ipcRenderer.invoke('tool2-paste-and-send-text', { text, messengerWebContentsId: targetWcId }),
  verifyGeminiApiKey: (apiKey) => ipcRenderer.invoke('tool2-verify-gemini-api-key', apiKey),
  getCommandsConfig: () => ipcRenderer.invoke('get-commands-config'),
  saveCommandsConfig: (data) => ipcRenderer.invoke('save-commands-config', data),
  onTool2StatusUpdate: (callback) => ipcRenderer.on('tool2-status-update', (event, data) => callback(data))
});