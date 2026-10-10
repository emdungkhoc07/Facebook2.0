const { app, BrowserWindow, session, ipcMain, nativeImage, clipboard, webContents, shell, net } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const dataManager = require('./data-manager');

// ==========================================================================
// 1. CẤU HÌNH 100% PORTABLE - ÉP TOÀN BỘ DATA LƯU TRONG FOLDER DATA CỦA TOOL
// ==========================================================================
const projectRoot = path.resolve(__dirname, '..', '..');
const dataDir = path.join(projectRoot, 'data');
const dataWebDir = path.join(dataDir, 'dataweb');
const sessionDataDir = path.join(dataWebDir, 'sessionData');

if (!fs.existsSync(sessionDataDir)) {
  fs.mkdirSync(sessionDataDir, { recursive: true });
}

app.setPath('appData', dataDir);
app.setPath('userData', sessionDataDir);
app.setPath('sessionData', sessionDataDir);
app.setPath('logs', path.join(dataWebDir, 'logs'));
app.setPath('crashDumps', path.join(dataWebDir, 'crashDumps'));

dataManager.loadDataTool();

// ==========================================================================
// 2. TỐI ƯU HÓA HIỆU NĂNG & CẤU HÌNH TRÌNH DUYỆT ỔN ĐỊNH
// ==========================================================================
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('disable-logging');
app.commandLine.appendSwitch('disable-features', 'SpellcheckService');
app.commandLine.appendSwitch('max-gum-fps', '60');

// Căn cước định danh chuẩn Chrome 130 ổn định nhất
const STANDARD_CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const STANDARD_ACCEPT_LANGUAGES = "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7";
app.userAgentFallback = STANDARD_CHROME_UA;

app.setAppUserModelId('Automess.Messenger.Pro.Tight.2026');

let mainWindow = null;

function boostProcessPriority() {
  try {
    if (os.constants && os.constants.priority && os.constants.priority.PRIORITY_HIGH !== undefined) {
      os.setPriority(os.constants.priority.PRIORITY_HIGH);
      console.log('[Automess] Đã kích hoạt chế độ ưu tiên tiến trình: HIGH PRIORITY');
    }
  } catch (err) {
    console.warn('[Automess] Không thể gán độ ưu tiên:', err.message);
  }
}

function createWindow() {
  const icoPath = path.join(projectRoot, 'icon.ico');
  const svgPath = path.join(projectRoot, 'mess.svg');
  const appIcon = fs.existsSync(icoPath) ? nativeImage.createFromPath(icoPath) : nativeImage.createFromPath(svgPath);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 850,
    minHeight: 550,
    frame: false,
    backgroundColor: '#ffffff',
    icon: appIcon,
    title: 'Automess',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload-main.js'),
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Cấu hình Session sạch sẽ, gỡ bỏ các header Electron thừa
function configureSessionForAuthenticChrome(sess) {
  if (!sess) return;
  sess.setUserAgent(STANDARD_CHROME_UA, STANDARD_ACCEPT_LANGUAGES);
  sess.setSpellCheckerEnabled(false);

  const filter = { urls: ['*://*/*'] };

  // 1. Loại bỏ các Header đặc trưng của Electron / Webview, bảo đảm danh tính Chrome chuẩn
  sess.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const requestHeaders = Object.assign({}, details.requestHeaders);

    delete requestHeaders['X-Requested-With'];
    delete requestHeaders['x-requested-with'];
    delete requestHeaders['x-electron-version'];
    delete requestHeaders['sec-fetch-user-agent'];

    requestHeaders['User-Agent'] = STANDARD_CHROME_UA;
    requestHeaders['Sec-Ch-Ua'] = '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"';
    requestHeaders['Sec-Ch-Ua-Mobile'] = '?0';
    requestHeaders['Sec-Ch-Ua-Platform'] = '"Windows"';

    if (!requestHeaders['Accept-Language'] && !requestHeaders['accept-language']) {
      requestHeaders['Accept-Language'] = STANDARD_ACCEPT_LANGUAGES;
    }

    callback({ cancel: false, requestHeaders });
  });

  // 2. Bảo toàn header an toàn cho Cloudflare / Turnstile và giải phóng X-Frame-Options / COOP
  sess.webRequest.onHeadersReceived(filter, (details, callback) => {
    const responseHeaders = Object.assign({}, details.responseHeaders);
    const url = (details.url || '').toLowerCase();

    // TUYỆT ĐỐI KHÔNG can thiệp/xóa header của Cloudflare / Turnstile / Google Auth
    const isProtectedAuthOrCaptcha = 
      url.includes('cloudflare') || 
      url.includes('challenges.cloudflare.com') || 
      url.includes('turnstile') || 
      url.includes('recaptcha') || 
      url.includes('hcaptcha') || 
      url.includes('accounts.google.com');

    if (!isProtectedAuthOrCaptcha) {
      delete responseHeaders['x-frame-options'];
      delete responseHeaders['X-Frame-Options'];
      delete responseHeaders['cross-origin-opener-policy'];
      delete responseHeaders['Cross-Origin-Opener-Policy'];
      delete responseHeaders['cross-origin-embedder-policy'];
      delete responseHeaders['Cross-Origin-Embedder-Policy'];
    }

    callback({ cancel: false, responseHeaders });
  });
}

function setupWebSessions() {
  // Áp dụng cho phiên làm việc mặc định
  configureSessionForAuthenticChrome(session.defaultSession);

  // 1. Phân vùng Messenger
  const messengerSes = session.fromPartition('persist:messenger');
  configureSessionForAuthenticChrome(messengerSes);
  
  messengerSes.webRequest.onBeforeRequest({ urls: ['*://*.facebook.com/*'] }, (details, callback) => {
    if (details.resourceType === 'mainFrame') {
      const url = details.url;
      const isAuthPage = url.includes('/login') || url.includes('/checkpoint') || url.includes('/two_factor') || url.includes('/auth') || url.includes('/recover');
      if (!isAuthPage) {
        return callback({ redirectURL: 'https://www.messenger.com/' });
      }
    }
    callback({});
  });

  // 2. Phân vùng Facebook
  const facebookSes = session.fromPartition('persist:facebook');
  configureSessionForAuthenticChrome(facebookSes);

  // 3. Phân vùng TikTok
  const tiktokSes = session.fromPartition('persist:tiktok');
  configureSessionForAuthenticChrome(tiktokSes);

  // 4. Phân vùng Instagram
  const instagramSes = session.fromPartition('persist:instagram');
  configureSessionForAuthenticChrome(instagramSes);

  // 5. Phân vùng Web in Mess (Tool 7 - Lưu trữ vĩnh viễn trong data/dataweb/sessionData/Partitions/web_in_mess)
  const webInMessSes = session.fromPartition('persist:web_in_mess');
  configureSessionForAuthenticChrome(webInMessSes);
}

// Hàm lưu trữ tức thì (flush) toàn bộ cookies của tất cả phân vùng vào ổ đĩa
function flushAllSessions() {
  try {
    const partitions = ['persist:messenger', 'persist:facebook', 'persist:tiktok', 'persist:instagram', 'persist:web_in_mess'];
    partitions.forEach(p => {
      try {
        const s = session.fromPartition(p);
        if (s && s.cookies && s.cookies.flushStore) {
          s.cookies.flushStore().catch(() => {});
        }
      } catch(e) {}
    });
  } catch(e) {}
}

// Tự động lưu flush cookies vào đĩa mỗi 15 giây và khi tắt ứng dụng
setInterval(flushAllSessions, 15000);
app.on('before-quit', flushAllSessions);
app.on('will-quit', flushAllSessions);

// Tự động áp dụng cấu hình Chrome thuần chủng cho bất kỳ phân vùng nào mới sinh ra
app.on('session-created', (sess) => {
  configureSessionForAuthenticChrome(sess);
});

// Cho phép mở popup đăng nhập tài khoản (Google OAuth, Facebook, Apple login popup...) thông suốt
app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler((details) => {
    const url = details.url || '';
    const lower = url.toLowerCase();

    const isAuth = 
      lower.includes('accounts.google.com') || 
      lower.includes('google.com/signin') ||
      lower.includes('google.com/accounts') ||
      lower.includes('google.com/gsi') ||
      lower.includes('apis.google.com') ||
      lower.includes('facebook.com/login') || 
      lower.includes('facebook.com/dialog') ||
      lower.includes('appleid.apple.com') || 
      lower.includes('github.com/login') || 
      lower.includes('twitter.com/oauth') ||
      lower.includes('x.com/oauth') ||
      lower.includes('discord.com/oauth2') ||
      lower.includes('pixiv.net') ||
      lower.includes('pinterest.com') ||
      lower.includes('oauth') || 
      lower.includes('signin') || 
      lower.includes('sign-in') || 
      lower.includes('login') || 
      lower.includes('log-in') || 
      lower.includes('auth') ||
      lower.includes('authorize') ||
      lower.includes('authenticate') ||
      lower.includes('sso');

    if (isAuth) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 540,
          height: 680,
          minWidth: 420,
          minHeight: 520,
          autoHideMenuBar: true,
          backgroundColor: '#18181b',
          show: true,
          webPreferences: {
            partition: 'persist:web_in_mess',
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            userAgent: STANDARD_CHROME_UA
          }
        }
      };
    }

    const config = dataManager.loadDataTool();
    const isBlockPopupsEnabled = config?.sensorSettings?.blockPopups !== false;

    // Nếu từ webview:
    if (contents.getType() === 'webview') {
      // 1. Chặn will-navigate nếu tự ý chuyển hướng sang các domain quảng cáo rác
      contents.on('will-navigate', (navEvent, targetUrl) => {
        const config = dataManager.loadDataTool();
        const isBlockAutoRedirect = config?.sensorSettings?.blockAutoRedirect !== false;
        if (!isBlockAutoRedirect) return;

        const currentUrl = contents.getURL() || '';
        if (!currentUrl || !targetUrl) return;

        const lowerTarget = targetUrl.toLowerCase();
        const isAuth = 
          lowerTarget.includes('accounts.google.com') || 
          lowerTarget.includes('google.com/signin') ||
          lowerTarget.includes('facebook.com/login') ||
          lowerTarget.includes('twitter.com') ||
          lowerTarget.includes('x.com') ||
          lowerTarget.includes('pixiv.net') ||
          lowerTarget.includes('pinterest.com') ||
          lowerTarget.includes('login') ||
          lowerTarget.includes('auth') ||
          lowerTarget.includes('sso');

        if (isAuth) return;

        try {
          const curHost = new URL(currentUrl).hostname.toLowerCase();
          const targetHost = new URL(targetUrl).hostname.toLowerCase();

          const isSameHost = curHost === targetHost || 
                             targetHost.endsWith('.' + curHost) || 
                             curHost.endsWith('.' + targetHost);

          if (!isSameHost && curHost && targetHost) {
            const isAd = 
              lowerTarget.includes('adserver') || 
              lowerTarget.includes('doubleclick') || 
              lowerTarget.includes('popads') || 
              lowerTarget.includes('popcash') || 
              lowerTarget.includes('adcash') || 
              lowerTarget.includes('trafficjunky') || 
              lowerTarget.includes('bet88') || 
              lowerTarget.includes('shopee') || 
              lowerTarget.includes('lazada') || 
              lowerTarget.includes('linkvertise') || 
              lowerTarget.includes('redirect') || 
              lowerTarget.includes('affiliate') || 
              lowerTarget.includes('tracker') ||
              lowerTarget.includes('onclick');

            if (isAd) {
              navEvent.preventDefault();
              console.warn(`[Main App] 🛡️ [Anti-Redirect] Đã chặn đứng will-navigate sang domain quảng cáo: ${targetUrl}`);
            }
          }
        } catch(e) {}
      });

      // 2. Chặn HTTP will-redirect sang domain quảng cáo
      contents.on('will-redirect', (redirEvent, targetUrl) => {
        const config = dataManager.loadDataTool();
        const isBlockAutoRedirect = config?.sensorSettings?.blockAutoRedirect !== false;
        if (!isBlockAutoRedirect) return;

        const lowerTarget = (targetUrl || '').toLowerCase();
        const isAd = 
          lowerTarget.includes('adserver') || 
          lowerTarget.includes('doubleclick') || 
          lowerTarget.includes('popads') || 
          lowerTarget.includes('popcash') || 
          lowerTarget.includes('adcash') || 
          lowerTarget.includes('bet88') || 
          lowerTarget.includes('shopee') || 
          lowerTarget.includes('lazada') || 
          lowerTarget.includes('linkvertise') || 
          lowerTarget.includes('redirect') || 
          lowerTarget.includes('affiliate') || 
          lowerTarget.includes('tracker');

        if (isAd) {
          redirEvent.preventDefault();
          console.warn(`[Main App] 🛡️ [Anti-Redirect] Đã chặn đứng HTTP will-redirect sang domain quảng cáo: ${targetUrl}`);
        }
      });

      if (isBlockPopupsEnabled) {
        console.log('[Main App] 🚫 Đã chặn popup từ webview (Chế độ Chặn Popups: ĐANG BẬT):', url);
        return { action: 'deny' };
      } else {
        // Người dùng đã TẮT chặn popup -> Cho phép mở popup trong cửa sổ riêng biệt
        console.log('[Main App] 🌐 Cho phép mở popup từ webview (Chế độ Chặn Popups: ĐÃ TẮT):', url);
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 1024,
            height: 720,
            minWidth: 480,
            minHeight: 360,
            autoHideMenuBar: true,
            show: true,
            webPreferences: {
              partition: 'persist:web_in_mess',
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: false,
              userAgent: STANDARD_CHROME_UA
            }
          }
        };
      }
    }

    // Các liên kết ngoài thông thường thì mở bằng trình duyệt mặc định của máy
    if (url && url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
});

// Đồng bộ trạng thái bảo vệ cảm biến cho Preload Script ngay khi nạp trang
ipcMain.on('get-sensor-protection-sync', (event) => {
  try {
    const config = dataManager.loadDataTool();
    event.returnValue = {
      blockPopups: config?.sensorSettings?.blockPopups !== false,
      blockAutoRedirect: config?.sensorSettings?.blockAutoRedirect !== false
    };
  } catch (err) {
    event.returnValue = { blockPopups: true, blockAutoRedirect: true };
  }
});

// ==========================================================================
// 3. IPC ĐIỀU KHIỂN CỬA SỔ & QUẢN LÝ DỮ LIỆU DATATOOL.JSON
// ==========================================================================
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.on('get-initial-datatool-config', (event) => {
  event.returnValue = dataManager.loadDataTool();
});

ipcMain.handle('load-datatool-config', async () => {
  return dataManager.loadDataTool();
});

ipcMain.handle('save-datatool-config', async (event, data) => {
  return dataManager.saveDataTool(data);
});

ipcMain.handle('tool7-clear-web-data', async () => {
  try {
    const webInMessSes = session.fromPartition('persist:web_in_mess');
    if (webInMessSes) {
      await webInMessSes.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage', 'shadercache', 'appcache']
      });
      await webInMessSes.clearCache();
      await webInMessSes.clearAuthCache();
    }

    // Xóa vật lý thư mục partition của Tool 7
    const partitionDir = path.join(dataWebDir, 'sessionData', 'Partitions', 'web_in_mess');
    if (fs.existsSync(partitionDir)) {
      try {
        fs.rmSync(partitionDir, { recursive: true, force: true });
        fs.mkdirSync(partitionDir, { recursive: true });
      } catch(e) {
        console.warn('[Tool 7] Xóa file partition:', e.message);
      }
    }

    // Xóa thư mục lưu ảnh cào được
    if (fs.existsSync(scrapedMediaDir)) {
      try {
        fs.rmSync(scrapedMediaDir, { recursive: true, force: true });
        fs.mkdirSync(scrapedMediaDir, { recursive: true });
      } catch(e) {}
    }

    // Xóa bộ nhớ cache ảnh đã gửi
    sentImagesHistorySet.clear();
    const historyFile = path.join(dataDir, 'sent_images_history.json');
    if (fs.existsSync(historyFile)) {
      try { fs.unlinkSync(historyFile); } catch(e) {}
    }

    console.log('[Tool 7] 🧹 Đã xóa sạch 100% dữ liệu duyệt web, cookie và cache của Tool 7!');
    return { success: true };
  } catch (err) {
    console.error('[Tool 7] Lỗi xóa dữ liệu web:', err);
    return { success: false, error: err.message };
  }
});

// ==========================================================================
// 4. IPC LÕI TỰ ĐỘNG TOOL 7: ĐÓN LỆNH TỪ PRELOAD & THỰC THI CHỤP DÁN ẢNH SIÊU TỐC
// ==========================================================================
ipcMain.on('tool7-request-web-capture', (event, data) => {
  console.log(`[Tool 7 Lõi] 🎯 Nhận yêu cầu:`, data);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('tool7-execute-web-flow', data);
  }
});

ipcMain.on('tool7-paste-and-send-image', (event, dataUrl, messengerWebContentsId) => {
  try {
    const raw = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(raw, 'base64');
    const image = nativeImage.createFromBuffer(buffer);
    
    // Ghi ảnh ngay vào bộ nhớ tạm Windows Clipboard
    clipboard.writeImage(image);

    let targetWc = null;
    const all = webContents.getAllWebContents();

    if (messengerWebContentsId) {
      targetWc = all.find(wc => wc.id === parseInt(messengerWebContentsId));
    }
    if (!targetWc) {
      targetWc = all.find(wc => wc.getURL().includes('messenger.com'));
    }

    if (targetWc) {
      targetWc.focus();
      targetWc.send('force-focus-message-input');

      // Gửi phím Ctrl+V sau 150ms
      setTimeout(() => {
        targetWc.sendInputEvent({ type: 'keyDown', keyCode: 'v', modifiers: ['control'] });
        targetWc.sendInputEvent({ type: 'keyUp', keyCode: 'v', modifiers: ['control'] });

        // Gửi phím Enter sau 600ms (tối ưu hóa siêu tốc)
        setTimeout(() => {
          targetWc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
          targetWc.sendInputEvent({ type: 'char', keyCode: 'Enter' });
          targetWc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
          console.log('[Tool 7 Web in Mess] ⚡ Đã dán ảnh và nhấn Enter gửi thành công!');
        }, 600);
      }, 150);
    }
  } catch (err) {
    console.error('[Tool 7 Web in Mess] Lỗi dán ảnh:', err);
  }
});

// [DEDICATED SCRAPED MEDIA DIRECTORY]: Thư mục lưu trữ ảnh cào được của Tool 7
const scrapedMediaDir = path.join(dataWebDir, 'scraped_media');
const sentImagesHistoryPath = path.join(dataDir, 'sent_images_history.json');
let sentImagesHistorySet = new Set();

// DỌN DẸP SẠCH SẼ BỘ NHỚ CHỐNG TRÙNG LẶP & TOÀN BỘ ẢNH LOCAL CŨ MỖI KHI KHỞI ĐỘNG TOOL
function cleanStartupImageCache() {
  try {
    // 1. Xóa file lịch sử sent_images_history.json và reset Set
    sentImagesHistorySet.clear();
    if (fs.existsSync(sentImagesHistoryPath)) {
      try { fs.unlinkSync(sentImagesHistoryPath); } catch(e) {}
    }

    // 2. Tạo mới / dọn dẹp sạch toàn bộ file ảnh cũ trong data/dataweb/scraped_media/
    if (fs.existsSync(scrapedMediaDir)) {
      const files = fs.readdirSync(scrapedMediaDir);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(scrapedMediaDir, file));
        } catch(e) {}
      }
    } else {
      fs.mkdirSync(scrapedMediaDir, { recursive: true });
    }
    console.log('[Startup Cleaner] 🧹 Đã dọn dẹp xóa sạch 100% bộ nhớ chống trùng lặp ảnh & các ảnh local cũ khi khởi động!');
  } catch (err) {
    console.warn('[Startup Cleaner] Cảnh báo khi dọn dẹp khởi động:', err.message);
  }
}

// Thực thi dọn dẹp ngay khi ứng dụng khởi động
cleanStartupImageCache();

function persistSentImagesHistory() {
  try {
    const dir = path.dirname(sentImagesHistoryPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(sentImagesHistoryPath, JSON.stringify(Array.from(sentImagesHistorySet)), 'utf8');
  } catch (e) {}
}

ipcMain.handle('clear-sent-images-history', () => {
  cleanStartupImageCache();
  console.log('[Sent Images History] Đã xóa sạch lịch sử ảnh đã gửi!');
  return { success: true };
});

// [WEB IMAGE DOWNLOADER]: Tải ảnh độ phân giải cao nhất, khử trùng lặp vĩnh viễn, lưu vào data/dataweb/scraped_media và chuyển Base64
ipcMain.handle('download-web-images', async (event, { urls, targetCount, pageUrl }) => {
  const downloadedList = [];
  const maxCount = Math.min(Math.max(parseInt(targetCount || 1, 10), 1), 50);

  if (!urls || !Array.isArray(urls)) return [];

  if (!fs.existsSync(scrapedMediaDir)) {
    try { fs.mkdirSync(scrapedMediaDir, { recursive: true }); } catch(e) {}
  }

  const webInMessSes = session.fromPartition('persist:web_in_mess');
  console.log(`[Web Image Downloader] Đang xử lý ${urls.length} ứng viên ảnh, mục tiêu lấy ${maxCount} ảnh mới (Page URL: ${pageUrl || 'N/A'})...`);

  const currentBatchHashes = new Set();

  for (let item of urls) {
    if (downloadedList.length >= maxCount) break;
    if (!item) continue;

    let rawUrl = '';
    let directDataUrl = '';

    if (typeof item === 'string') {
      if (item.startsWith('data:image/')) {
        directDataUrl = item;
      } else {
        rawUrl = item.trim();
      }
    } else if (typeof item === 'object') {
      rawUrl = (item.url || '').trim();
      directDataUrl = item.dataUrl || '';
    }

    if (rawUrl.startsWith('//')) rawUrl = 'https:' + rawUrl;

    // 1. NẾU ỨNG VIÊN ĐÃ ĐƯỢC CHUYỂN THÀNH DATA URL
    if (directDataUrl && directDataUrl.startsWith('data:image/')) {
      try {
        const raw = directDataUrl.replace(/^data:image\/\w+;base64,/, '');
        const buf = Buffer.from(raw, 'base64');
        if (buf.length >= 1000) {
          const md5 = crypto.createHash('md5').update(buf).digest('hex');
          if (sentImagesHistorySet.has(md5)) {
            console.log(`[Web Image Downloader] ⏩ Bỏ qua ảnh trùng mã MD5 đã gửi trước đó: ${md5}`);
            continue;
          }

          const pinMatch = rawUrl.match(/([a-f0-9]{16,})\.(?:jpg|jpeg|png|webp)/i);
          const urlKey = pinMatch ? pinMatch[1].toLowerCase() : (rawUrl ? rawUrl.split('?')[0].toLowerCase() : md5);
          if (rawUrl && sentImagesHistorySet.has(urlKey)) {
            console.log(`[Web Image Downloader] ⏩ Bỏ qua URL đã gửi trước đó: ${urlKey}`);
            continue;
          }

          if (currentBatchHashes.has(md5) || (urlKey && currentBatchHashes.has(urlKey))) {
            continue;
          }
          currentBatchHashes.add(md5);
          if (urlKey) currentBatchHashes.add(urlKey);

          // Chuyển đổi chuẩn xác sang JPEG chất lượng cao
          let savedBuf = buf;
          let outDataUrl = directDataUrl;
          try {
            const dec = nativeImage.createFromBuffer(buf);
            if (!dec.isEmpty()) {
              savedBuf = dec.toJPEG(95);
              outDataUrl = `data:image/jpeg;base64,${savedBuf.toString('base64')}`;
            }
          } catch(e) {}

          // Lưu ảnh vào thư mục riêng data/dataweb/scraped_media
          try {
            const saveName = `scraped_${Date.now()}_${downloadedList.length + 1}.jpg`;
            fs.writeFileSync(path.join(scrapedMediaDir, saveName), savedBuf);
          } catch(errSave) {}

          sentImagesHistorySet.add(md5);
          if (urlKey) sentImagesHistorySet.add(urlKey);
          persistSentImagesHistory();

          downloadedList.push(outDataUrl);
          console.log(`[Web Image Downloader] ✅ Đã lưu & lấy ảnh MỚI #${downloadedList.length}/${maxCount} (${Math.round(savedBuf.length / 1024)} KB)`);
          continue;
        }
      } catch(e) {}
    }

    if (!rawUrl) continue;

    // 2. KIỂM TRA URL HASH XEM ĐÃ TỪNG GỬI TRƯỚC ĐÂY CHƯA
    const pinMatch = rawUrl.match(/([a-f0-9]{16,})\.(?:jpg|jpeg|png|webp)/i);
    const urlKey = pinMatch ? pinMatch[1].toLowerCase() : rawUrl.split('?')[0].toLowerCase();
    if (sentImagesHistorySet.has(urlKey)) {
      console.log(`[Web Image Downloader] ⏩ Bỏ qua URL đã từng gửi trước đó: ${urlKey}`);
      continue;
    }
    if (currentBatchHashes.has(urlKey)) {
      continue;
    }
    currentBatchHashes.add(urlKey);

    // Nâng cấp các phiên bản ảnh phân giải cao nhất
    const candidateUrls = [];
    if (rawUrl.includes('pinimg.com/')) {
      candidateUrls.push(rawUrl.replace(/\/(?:236x|474x|564x|600x)\//, '/736x/'));
      candidateUrls.push(rawUrl.replace(/\/(?:236x|474x|564x|600x|736x)\//, '/originals/'));
      candidateUrls.push(rawUrl);
    } else if (rawUrl.includes('pximg.net')) {
      candidateUrls.push(rawUrl);
    } else if (rawUrl.includes('unsplash.com/')) {
      candidateUrls.push(rawUrl.replace(/w=\d+/, 'w=1920').replace(/q=\d+/, 'q=95'));
      candidateUrls.push(rawUrl);
    } else if (rawUrl.includes('googleusercontent.com') || rawUrl.includes('gstatic.com')) {
      candidateUrls.push(rawUrl.replace(/=w\d+-h\d+.*$/, '=s1920').replace(/=s\d+.*$/, '=s1920'));
      candidateUrls.push(rawUrl);
    } else if (rawUrl.includes('freepik.com/')) {
      candidateUrls.push(rawUrl.replace(/preview/, 'full'));
      candidateUrls.push(rawUrl);
    } else if (rawUrl.includes('pixabay.com/')) {
      candidateUrls.push(rawUrl.replace(/_640\./, '_1280.'));
      candidateUrls.push(rawUrl);
    } else {
      candidateUrls.push(rawUrl);
    }

    let successBuffer = null;
    let successMime = 'image/jpeg';

    for (const candUrl of candidateUrls) {
      try {
        let referer = pageUrl || 'https://www.google.com/';
        try {
          if (candUrl.includes('pinimg.com') || candUrl.includes('pinterest')) referer = 'https://www.pinterest.com/';
          else if (candUrl.includes('pximg.net') || candUrl.includes('pixiv')) referer = 'https://www.pixiv.net/';
          else if (candUrl.includes('twimg.com') || candUrl.includes('twitter') || candUrl.includes('x.com')) referer = 'https://twitter.com/';
          else if (pageUrl) referer = pageUrl;
          else referer = new URL(candUrl).origin + '/';
        } catch (e) {}

        const headers = {
          'User-Agent': STANDARD_CHROME_UA,
          'Referer': referer,
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        };

        let res = null;
        // 1. Thử dùng Fetch chuẩn của Node.js trước (Gửi đúng Referer không bị Chromium can thiệp)
        try {
          res = await fetch(candUrl, { headers: headers });
        } catch(nodeErr) {}

        // 2. Dự phòng: Dùng Session Fetch của Electron nếu Node fetch lỗi hoặc không thành công
        if (!res || !res.ok) {
          try {
            res = await webInMessSes.fetch(candUrl, { headers: headers });
          } catch(sesErr) {}
        }

        if (res && (res.ok || res.status === 200)) {
          const arrayBuffer = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          if (buffer.length >= 1000) {
            successBuffer = buffer;
            successMime = (res.headers && res.headers.get ? res.headers.get('content-type') : null) || 'image/jpeg';
            break;
          }
        }
      } catch (e) {}
    }

    if (successBuffer) {
      const md5 = crypto.createHash('md5').update(successBuffer).digest('hex');
      if (sentImagesHistorySet.has(md5)) {
        console.log(`[Web Image Downloader] ⏩ Bỏ qua ảnh trùng mã MD5 đã gửi: ${md5}`);
        continue;
      }
      if (currentBatchHashes.has(md5)) {
        continue;
      }
      currentBatchHashes.add(md5);

      // Ghi nhớ mã ảnh
      sentImagesHistorySet.add(md5);
      sentImagesHistorySet.add(urlKey);
      persistSentImagesHistory();

      // Giải mã WebP/PNG/JPEG và chuyển đổi đồng bộ sang JPEG chất lượng cao
      let finalB64 = '';
      let fileToSave = successBuffer;
      try {
        const decodedImg = nativeImage.createFromBuffer(successBuffer);
        if (!decodedImg.isEmpty()) {
          const jpegBuf = decodedImg.toJPEG(95);
          fileToSave = jpegBuf;
          finalB64 = `data:image/jpeg;base64,${jpegBuf.toString('base64')}`;
        }
      } catch(e) {}

      // Lưu ảnh vào thư mục riêng data/dataweb/scraped_media
      try {
        const saveName = `scraped_${Date.now()}_${downloadedList.length + 1}.jpg`;
        fs.writeFileSync(path.join(scrapedMediaDir, saveName), fileToSave);
      } catch(errSave) {}

      if (!finalB64) {
        finalB64 = `data:${successMime};base64,${successBuffer.toString('base64')}`;
      }

      downloadedList.push(finalB64);
      console.log(`[Web Image Downloader] ✅ Đã lưu & lấy ảnh MỚI #${downloadedList.length}/${maxCount} (${Math.round(fileToSave.length / 1024)} KB)`);
    }
  }

  console.log(`[Web Image Downloader] Hoàn tất! Đã chuẩn bị ${downloadedList.length}/${maxCount} ảnh mới.`);
  return downloadedList;
});

// Xử lý gửi ảnh tuần tự (Async) cho chuỗi n ảnh vào Messenger
ipcMain.handle('tool7-paste-and-send-image-async', async (event, dataUrl, messengerWebContentsId) => {
  return new Promise((resolve) => {
    try {
      if (!dataUrl) return resolve(false);
      const raw = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(raw, 'base64');
      const image = nativeImage.createFromBuffer(buffer);

      if (image.isEmpty()) {
        console.warn('[Tool 7 Web in Mess] NativeImage is empty!');
        return resolve(false);
      }

      clipboard.writeImage(image);

      let targetWc = null;
      const all = webContents.getAllWebContents();

      if (messengerWebContentsId) {
        targetWc = all.find(wc => wc.id === parseInt(messengerWebContentsId));
      }
      if (!targetWc) {
        targetWc = all.find(wc => wc.getURL().includes('messenger.com'));
      }

      if (targetWc) {
        targetWc.focus();
        targetWc.send('force-focus-message-input');

        setTimeout(() => {
          targetWc.sendInputEvent({ type: 'keyDown', keyCode: 'v', modifiers: ['control'] });
          targetWc.sendInputEvent({ type: 'keyUp', keyCode: 'v', modifiers: ['control'] });

          // Đợi Messenger tải ảnh vào khung chat trước khi nhấn Enter
          setTimeout(() => {
            targetWc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
            targetWc.sendInputEvent({ type: 'char', keyCode: 'Enter' });
            targetWc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
            console.log('[Tool 7 Web in Mess] ⚡ Đã dán và nhấn Enter gửi ảnh thành công!');
            setTimeout(() => resolve(true), 800);
          }, 1400);
        }, 250);
      } else {
        resolve(false);
      }
    } catch (err) {
      console.error('[Tool 7 Web in Mess] Lỗi dán ảnh async:', err);
      resolve(false);
    }
  });
});

// ==========================================================================
// 4.1. LÕI TỰ ĐỘNG TOOL 2: AI AUTO REPLY VỚI GOOGLE GEMINI API
// ==========================================================================
const geminiConversationHistories = new Map(); // threadId -> [ { role: 'user'|'model', content } ]
const autoReadThreadsSet = new Set(); // Set các threadId đang bật chế độ /star

// Nạp cấu hình các thread bật autoRead từ datatool.json
try {
  const initialCfg = dataManager.loadDataTool();
  if (initialCfg && initialCfg.aiAutoReply && Array.isArray(initialCfg.aiAutoReply.autoReadThreads)) {
    initialCfg.aiAutoReply.autoReadThreads.forEach(t => autoReadThreadsSet.add(t));
  }
} catch(e) {}

function saveAutoReadThreads() {
  try {
    const cfg = dataManager.loadDataTool() || {};
    if (!cfg.aiAutoReply) cfg.aiAutoReply = {};
    cfg.aiAutoReply.autoReadThreads = Array.from(autoReadThreadsSet);
    dataManager.saveDataTool(cfg);
  } catch(e) {}
}

// IPC xác minh tính hợp lệ của API Key và lấy danh sách Model Google Gemini
async function handleVerifyGeminiApiKey(apiKey) {
  try {
    const key = (apiKey || '').trim();
    if (!key) {
      return { success: false, error: 'API Key trống! Vui lòng nhập API Key Google Gemini.' };
    }

    // Truy vấn danh sách Model từ Google Gemini API
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
    const modelsResponse = await fetch(url, {
      method: 'GET'
    });

    if (modelsResponse.ok) {
      const data = await modelsResponse.json();
      let models = [];
      if (data && Array.isArray(data.models)) {
        models = data.models
          .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
          .map(m => (m.name || '').replace(/^models\//, ''))
          .filter(name => {
            const clean = (name || '').toLowerCase().trim();
            if (!clean.startsWith('gemini-')) return false;

            // Loại bỏ các model phụ, chuyên dụng, công cụ, ảnh, âm thanh
            if (
              clean.includes('customtools') ||
              clean.includes('image') ||
              clean.includes('banana') ||
              clean.includes('imagen') ||
              clean.includes('clip') ||
              clean.includes('tts') ||
              clean.includes('transcribe') ||
              clean.includes('audio') ||
              clean.includes('computer-use') ||
              clean.includes('embedding') ||
              clean.includes('robotics') ||
              clean.includes('omni')
            ) {
              return false;
            }

            // Chỉ giữ lại duy nhất 3 loại model: Pro, Flash, Flash-Lite
            const isPro = clean.includes('pro');
            const isFlash = clean.includes('flash');
            const isFlashLite = clean.includes('flash-lite');
            if (!isPro && !isFlash && !isFlashLite) {
              return false;
            }

            const verNum = parseFloat(clean.replace('gemini-', ''));
            return !isNaN(verNum) && verNum >= 3.0;
          });
      }
      return { success: true, models, count: models.length };
    }

    const errText = await modelsResponse.text();
    let errMsg = errText;
    try {
      const errJson = JSON.parse(errText);
      if (errJson && errJson.error && errJson.error.message) {
        errMsg = errJson.error.message;
      }
    } catch(e) {}

    return {
      success: false,
      status: modelsResponse.status,
      rawError: errText,
      error: `Google Gemini API (${modelsResponse.status}): ${errMsg}`
    };
  } catch(err) {
    return { success: false, error: err.message };
  }
}

ipcMain.handle('tool2-verify-gemini-api-key', async (event, apiKey) => {
  return handleVerifyGeminiApiKey(apiKey);
});
ipcMain.handle('tool2-verify-xai-api-key', async (event, apiKey) => {
  return handleVerifyGeminiApiKey(apiKey);
});

// IPC lấy và lưu cấu hình toàn bộ lệnh
ipcMain.handle('get-commands-config', () => {
  return dataManager.loadCommandsConfig();
});

ipcMain.handle('save-commands-config', (event, data) => {
  return dataManager.saveCommandsConfig(data);
});

async function callGeminiChatApi({ apiKey, model, messages, systemPrompt }) {
  if (!apiKey) {
    throw new Error("Chưa cấu hình API Key của Google Gemini! Vui lòng mở Console Tool 2 và nhập API Key.");
  }
  const targetModel = model || 'gemini-3.1-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  // Chuẩn hóa contents theo chuẩn Google Gemini API
  const contents = [];
  for (const msg of messages) {
    if (!msg || !msg.content) continue;
    if (msg.role === 'system') continue;

    const role = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += `\n\n${msg.content}`;
    } else {
      contents.push({
        role: role,
        parts: [{ text: msg.content }]
      });
    }
  }

  // Đảm bảo lượt đầu tiên là user nếu có dữ liệu
  if (contents.length > 0 && contents[0].role === 'model') {
    contents.unshift({
      role: 'user',
      parts: [{ text: 'Bắt đầu cuộc trò chuyện' }]
    });
  }

  const payload = {
    contents: contents,
    generationConfig: {
      temperature: 0.7
    }
  };

  if (systemPrompt && systemPrompt.trim()) {
    payload.systemInstruction = {
      parts: [{ text: systemPrompt.trim() }]
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsedErr = errorText;
    try {
      const errJson = JSON.parse(errorText);
      if (errJson && errJson.error && errJson.error.message) {
        parsedErr = errJson.error.message;
      }
    } catch(e) {}
    throw new Error(`Google Gemini API (${response.status}): ${parsedErr}`);
  }

  const data = await response.json();
  if (data && data.candidates && data.candidates[0] && data.candidates[0].content && Array.isArray(data.candidates[0].content.parts)) {
    const replyText = data.candidates[0].content.parts.map(p => p.text || '').join('');
    if (replyText) return replyText.trim();
  }

  if (data && data.promptFeedback && data.promptFeedback.blockReason) {
    throw new Error(`Google Gemini đã chặn phản hồi do: ${data.promptFeedback.blockReason}`);
  }

  throw new Error("Không nhận được câu trả lời từ Google Gemini API.");
}

const DEFAULT_TOOL2_HELP_TEXT = `📋 [DANH SÁCH LỆNH AI AUTO REPLY]:
• /help : Xem lại bảng danh sách các lệnh
• /ai [nội dung] : Nhắn nội dung này cho AI đọc và trả lời
• /model [tên_model] : Tùy chỉnh chuyển sang model AI khác
• /delete : Xóa sạch ngữ cảnh đoạn chat với AI
• /start hoặc /star : Bật chế độ cho AI tự động đọc và trả lời tin nhắn không cần lệnh /ai
• /stop : Tắt chế độ tự động đọc tin nhắn`;

function broadcastTool2Status(text, level = 'info') {
  if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tool2-status-update', { text, level });
  }
}

ipcMain.on('tool2-status-update', (event, data) => {
  if (data && data.text) {
    broadcastTool2Status(data.text, data.level || 'info');
  }
});

ipcMain.handle('is-thread-auto-read', (event, threadId) => {
  if (!threadId) return false;
  return autoReadThreadsSet.has(threadId) || autoReadThreadsSet.has('all');
});

ipcMain.handle('get-auto-read-threads', () => {
  return Array.from(autoReadThreadsSet);
});

ipcMain.handle('get-tool2-blacklist', () => {
  const config = dataManager.loadDataTool() || {};
  return (config.aiAutoReply && config.aiAutoReply.blacklist) || '';
});

async function handleProcessGeminiMessage(payload) {
  const { command, text, threadId } = payload || {};
  const config = dataManager.loadDataTool() || {};
  const cmdConfig = dataManager.loadCommandsConfig() || {};
  const aiConfig = config.aiAutoReply || {};
  const notifs = (cmdConfig.tool2_ai_auto_reply && cmdConfig.tool2_ai_auto_reply.notifications) || {};

  const apiKey = (aiConfig.apiKey || '').trim();
  const whoami = (aiConfig.whoami || '').trim();
  const discipline = (aiConfig.discipline || '').trim();
  let currentModel = aiConfig.currentModel || 'gemini-3.1-flash-lite';

  const threadKey = threadId || 'default_thread';

  console.log(`[Tool 2 Gemini] 📩 Xử lý yêu cầu lệnh: /${command} cho thread: ${threadKey}`);

  // 1. Lệnh /help
  if (command === 'help') {
    broadcastTool2Status(`📖 Đã phản hồi bảng hướng dẫn lệnh /help`, 'success');
    const helpMsg = notifs.help_text || DEFAULT_TOOL2_HELP_TEXT;
    return { success: true, type: 'text', reply: helpMsg };
  }

  // 2. Lệnh /model [tên]
  if (command === 'model') {
    const newModel = (text || '').trim();
    if (newModel) {
      aiConfig.currentModel = newModel;
      config.aiAutoReply = aiConfig;
      dataManager.saveDataTool(config);
      broadcastTool2Status(`✅ Đã chuyển model AI sang: ${newModel}`, 'success');
      const succMsg = (notifs.model_success || '✅ Đã đổi model sang: {model}').replace('{model}', newModel);
      return { success: true, type: 'text', reply: succMsg };
    } else {
      broadcastTool2Status(`ℹ️ Model hiện tại: ${currentModel}`, 'info');
      const infoMsg = (notifs.model_info || 'ℹ️ Model hiện tại: {model}. Cú pháp: /model <tên_model>').replace('{model}', currentModel);
      return { success: true, type: 'text', reply: infoMsg };
    }
  }

  // 3. Lệnh /delete (Xóa lịch sử chat với AI)
  if (command === 'delete') {
    geminiConversationHistories.delete(threadKey);
    broadcastTool2Status(`🧹 Đã xóa sạch ngữ cảnh hội thoại AI của đoạn chat!`, 'success');
    const delMsg = notifs.delete_success || '🧹 Đã xóa sạch ngữ cảnh đoạn chat!';
    return { success: true, type: 'text', reply: delMsg };
  }

  // 4. Lệnh /star hoặc /start (Bật chế độ Auto đọc tin nhắn không cần lệnh cho tất cả)
  if (command === 'star') {
    autoReadThreadsSet.add('all');
    if (threadKey) autoReadThreadsSet.add(threadKey);
    saveAutoReadThreads();
    broadcastTool2Status(`⭐ Đã BẬT tự động trả lời tin nhắn mới từ mọi người.`, 'success');
    const starMsg = notifs.star_success || '⭐ Đã BẬT tự động trả lời tin nhắn mới cho tất cả mọi người. Mọi tin nhắn mới chưa đọc sẽ được AI tự động tiếp nhận và phản hồi.';
    return { success: true, type: 'text', reply: starMsg };
  }

  // 5. Lệnh /stop (Tắt chế độ Auto)
  if (command === 'stop') {
    autoReadThreadsSet.clear();
    saveAutoReadThreads();
    broadcastTool2Status(`🛑 Đã TẮT chế độ tự động trả lời tin nhắn.`, 'info');
    const stopMsg = notifs.stop_success || '🛑 Đã TẮT chế độ tự động trả lời tin nhắn.';
    return { success: true, type: 'text', reply: stopMsg };
  }

  // 6. Lệnh /ai hoặc Chế độ Auto
  const userContent = (text || '').trim();
  if (!userContent) return { success: false, reply: '' };

  broadcastTool2Status(`🔄 Đang kết nối Google Gemini (${currentModel}) để trả lời...`, 'processing');

  try {
    // Xây dựng System Prompt kết hợp "Tôi là ai" + "Kỉ luật"
    let systemPromptContent = '';
    if (whoami) {
      systemPromptContent += `[DANH TÍNH CỦA BẠN - TÔI LÀ AI]:\n${whoami}\n\n`;
    }
    if (discipline) {
      systemPromptContent += `[KỈ LUẬT & NGUYÊN TẮC BẮT BUỘC]:\n${discipline}\n\n`;
    }
    if (!systemPromptContent) {
      systemPromptContent = 'Bạn là trợ lý AI thông minh, thân thiện và hữu ích của Google Gemini.';
    }

    // Lấy lịch sử hội thoại
    let history = geminiConversationHistories.get(threadKey) || [];
    const messages = [
      ...history,
      { role: 'user', content: userContent }
    ];

    const aiReply = await callGeminiChatApi({
      apiKey,
      model: currentModel,
      systemPrompt: systemPromptContent,
      messages
    });

    // Cập nhật lịch sử (lưu tối đa 16 tin nhắn gần nhất)
    history.push({ role: 'user', content: userContent });
    history.push({ role: 'model', content: aiReply });
    if (history.length > 16) {
      history = history.slice(-16);
    }
    geminiConversationHistories.set(threadKey, history);

    broadcastTool2Status(`✨ Gemini đã phản hồi xong! Đang gửi tin nhắn...`, 'success');
    return { success: true, type: 'text', reply: aiReply };
  } catch(err) {
    console.error('[Tool 2 Gemini Error]:', err);
    broadcastTool2Status(`❌ Lỗi Gemini AI: ${err.message}`, 'error');
    const errPrefix = (notifs.ai_error || '❌ Lỗi Gemini AI: {error}').replace('{error}', err.message);
    return { success: false, type: 'text', reply: errPrefix };
  }
}

ipcMain.handle('tool2-process-gemini-message', async (event, payload) => {
  return handleProcessGeminiMessage(payload);
});
ipcMain.handle('tool2-process-grok-message', async (event, payload) => {
  return handleProcessGeminiMessage(payload);
});

// Gửi tin nhắn văn bản vào Messenger
ipcMain.handle('tool2-paste-and-send-text', async (event, { text, messengerWebContentsId }) => {
  return new Promise((resolve) => {
    try {
      if (!text) return resolve(false);

      let targetWc = null;
      const all = webContents.getAllWebContents();
      if (messengerWebContentsId) {
        targetWc = all.find(wc => wc.id === parseInt(messengerWebContentsId));
      }
      if (!targetWc) {
        targetWc = all.find(wc => wc.getURL().includes('messenger.com'));
      }

      if (targetWc) {
        clipboard.writeText(text);
        targetWc.focus();
        targetWc.send('force-focus-message-input');

        setTimeout(() => {
          targetWc.sendInputEvent({ type: 'keyDown', keyCode: 'v', modifiers: ['control'] });
          targetWc.sendInputEvent({ type: 'keyUp', keyCode: 'v', modifiers: ['control'] });

          setTimeout(() => {
            targetWc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
            targetWc.sendInputEvent({ type: 'char', keyCode: 'Enter' });
            targetWc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
            console.log('[Tool 2 Grok] ⚡ Đã dán câu trả lời và nhấn Enter gửi thành công!');
            setTimeout(() => resolve(true), 400);
          }, 350);
        }, 150);
      } else {
        resolve(false);
      }
    } catch(err) {
      console.error('[Tool 2] Lỗi dán gửi văn bản:', err);
      resolve(false);
    }
  });
});

app.whenReady().then(() => {
  boostProcessPriority();
  setupWebSessions();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});