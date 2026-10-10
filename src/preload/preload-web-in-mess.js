// ==========================================================================
// PRELOAD SCRIPT FOR TOOL 7: WEB IN MESS
// Includes:
// 1. Chrome Stealth Fingerprint (Anti-Bot bypass)
// 2. Cloudflare Turnstile & CAPTCHA Auto-Solver
// 3. Popup Blocker (Ngăn chặn cửa sổ / tab popup bật lên)
// 4. Anti-Redirect & Click-Jacking Protector (Chặn tự đổi URL / gài quảng cáo)
// ==========================================================================

const { ipcRenderer } = require('electron');

(function initTool7SecurityAndStealth() {
  'use strict';

  // Trạng thái cấu hình bảo vệ (khởi tạo đồng bộ ngay khi nạp trang)
  const protectionState = {
    blockPopups: true,
    blockAutoRedirect: true
  };

  try {
    const initProt = ipcRenderer.sendSync('get-sensor-protection-sync');
    if (initProt) {
      if (typeof initProt.blockPopups === 'boolean') {
        protectionState.blockPopups = initProt.blockPopups;
      }
      if (typeof initProt.blockAutoRedirect === 'boolean') {
        protectionState.blockAutoRedirect = initProt.blockAutoRedirect;
      }
    }
  } catch(e) {}

  // Mốc thời gian tương tác người dùng gần nhất (click, phím, chạm)
  let lastUserInteractionTimestamp = Date.now();

  function recordUserInteraction() {
    lastUserInteractionTimestamp = Date.now();
  }

  // Lắng nghe cập nhật cấu hình tức thì từ Renderer / Console Cảm biến
  ipcRenderer.on('sensor-update-protection', (event, config) => {
    if (config) {
      if (typeof config.blockPopups === 'boolean') {
        protectionState.blockPopups = config.blockPopups;
      }
      if (typeof config.blockAutoRedirect === 'boolean') {
        protectionState.blockAutoRedirect = config.blockAutoRedirect;
      }
      console.log('[Tool 7 Preload] ⚙️ Cập nhật chế độ bảo vệ:', protectionState);
    }
  });

  // Ghi nhận tương tác thật của người dùng ở capture phase
  window.addEventListener('mousedown', recordUserInteraction, true);
  window.addEventListener('pointerdown', recordUserInteraction, true);
  window.addEventListener('keydown', recordUserInteraction, true);
  window.addEventListener('touchstart', recordUserInteraction, true);

  // --------------------------------------------------------------------------
  // 1. CHROME STEALTH ANTI-BOT MODULE
  // --------------------------------------------------------------------------
  try {
    // 1.1. Hide navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true
    });
    try {
      if (navigator.__proto__ && 'webdriver' in navigator.__proto__) {
        delete navigator.__proto__.webdriver;
      }
    } catch (e) {}

    // 1.2. Polyfill window.chrome matching authentic Chrome desktop
    if (!window.chrome) {
      window.chrome = {};
    }
    if (!window.chrome.runtime) {
      window.chrome.runtime = {
        PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
        PlatformArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformNaclArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
        RequestUpdateCheckStatus: { THROTTLED: 'throttled', NO_UPDATE: 'no_update', UPDATE_AVAILABLE: 'update_available' },
        OnInstalledReason: { INSTALL: 'install', UPDATE: 'update', CHROME_UPDATE: 'chrome_update', SHARED_MODULE_UPDATE: 'shared_module_update' },
        OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
        connect: function() {},
        sendMessage: function() {}
      };
    }
    if (!window.chrome.app) {
      window.chrome.app = {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getDetails: function() {},
        getIsInstalled: function() { return false; },
        runningState: function() { return 'cannot_run'; }
      };
    }
    if (!window.chrome.csi) {
      window.chrome.csi = function() {
        return {
          startE: Date.now(),
          onloadT: Date.now() + 120,
          pageT: 250.5,
          tran: 15
        };
      };
    }
    if (!window.chrome.loadTimes) {
      window.chrome.loadTimes = function() {
        return {
          requestTime: Date.now() / 1000,
          startLoadTime: Date.now() / 1000,
          commitLoadTime: (Date.now() + 50) / 1000,
          finishDocumentLoadTime: (Date.now() + 100) / 1000,
          firstPaintTime: (Date.now() + 110) / 1000,
          finishLoadTime: (Date.now() + 150) / 1000,
          firstPaintAfterLoadTime: 0,
          navigationType: 'Other',
          wasFetchedViaSpdy: true,
          wasNpnNegotiated: true,
          npnNegotiatedProtocol: 'h2',
          wasAlternateProtocolAvailable: false,
          connectionInfo: 'h2'
        };
      };
    }

    // 1.3. Mock standard Chrome Plugins (5 PDF plugins on Windows)
    try {
      const pluginData = [
        { name: 'PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer', mimeTypes: [{ type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' }, { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' }] },
        { name: 'Chrome PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer', mimeTypes: [{ type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' }] },
        { name: 'Chromium PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer', mimeTypes: [{ type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' }] },
        { name: 'Microsoft Edge PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer', mimeTypes: [{ type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' }] },
        { name: 'WebKit built-in PDF', description: 'Portable Document Format', filename: 'internal-pdf-viewer', mimeTypes: [{ type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' }] }
      ];

      const fakePlugins = Object.create(PluginArray.prototype);
      fakePlugins.length = pluginData.length;

      pluginData.forEach((p, idx) => {
        const fakePlugin = Object.create(Plugin.prototype);
        fakePlugin.name = p.name;
        fakePlugin.description = p.description;
        fakePlugin.filename = p.filename;
        fakePlugin.length = p.mimeTypes.length;

        p.mimeTypes.forEach((m, mIdx) => {
          const fakeMime = Object.create(MimeType.prototype);
          fakeMime.type = m.type;
          fakeMime.suffixes = m.suffixes;
          fakeMime.description = m.description;
          fakeMime.enabledPlugin = fakePlugin;
          fakePlugin[mIdx] = fakeMime;
          fakePlugin[m.type] = fakeMime;
        });

        fakePlugins[idx] = fakePlugin;
        fakePlugins[p.name] = fakePlugin;
      });

      fakePlugins.item = function(index) { return this[index] || null; };
      fakePlugins.namedItem = function(name) { return this[name] || null; };
      fakePlugins.refresh = function() {};

      Object.defineProperty(navigator, 'plugins', {
        get: () => fakePlugins,
        configurable: true
      });
    } catch (e) {}

    // 1.4. Standardize navigator.languages
    try {
      Object.defineProperty(navigator, 'languages', {
        get: () => ['vi-VN', 'vi', 'en-US', 'en'],
        configurable: true
      });
      Object.defineProperty(navigator, 'language', {
        get: () => 'vi-VN',
        configurable: true
      });
    } catch (e) {}

    // 1.5. Fix navigator.permissions.query for notifications
    try {
      const origQuery = navigator.permissions && navigator.permissions.query;
      if (origQuery) {
        navigator.permissions.query = function(params) {
          if (params && params.name === 'notifications') {
            const perm = typeof Notification !== 'undefined' ? Notification.permission : 'default';
            return Promise.resolve({
              state: perm === 'granted' ? 'granted' : (perm === 'denied' ? 'denied' : 'prompt'),
              onchange: null
            });
          }
          return origQuery.apply(this, arguments);
        };
      }
    } catch (e) {}

  } catch (err) {
    console.warn('[Tool 7 Stealth] Init warning:', err);
  }

  // --------------------------------------------------------------------------
  // 2. POPUP BLOCKER MODULE (TÍNH NĂNG 1)
  // --------------------------------------------------------------------------
  try {
    function isAuthOrSafeUrl(url) {
      if (!url || typeof url !== 'string') return false;
      const lower = url.toLowerCase();
      return (
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
        lower.includes('sso')
      );
    }

    const originalWindowOpen = window.open;
    window.open = function(url, target, features) {
      // Luôn cho phép các cửa sổ đăng nhập tài khoản (Google, Facebook, SSO, OAuth...)
      if (isAuthOrSafeUrl(url)) {
        return originalWindowOpen.apply(this, arguments);
      }

      if (protectionState.blockPopups) {
        const elapsed = Date.now() - lastUserInteractionTimestamp;
        // Nếu không có tương tác người dùng trực tiếp trong 2000ms qua -> chặn đứng popup
        if (elapsed > 2000) {
          console.warn('[Tool 7 Popup Blocker] 🚫 Đã chặn window.open tự động:', url);
          return null;
        }

        // Nếu người dùng có click, kiểm tra xem có phải popup quảng cáo rác không
        if (url && typeof url === 'string') {
          const lower = url.toLowerCase();
          if (lower.includes('adserver') || lower.includes('doubleclick') || lower.includes('popads') || lower.includes('bet88') || lower.includes('shopee') || lower.includes('lazada')) {
            console.warn('[Tool 7 Popup Blocker] 🚫 Đã chặn popup quảng cáo rác:', url);
            return null;
          }
        }
      }
      return originalWindowOpen.apply(this, arguments);
    };

    // Chặn các thẻ <a> được click tự động hoặc target="_blank" do quảng cáo gài (ngoại trừ link đăng nhập)
    document.addEventListener('click', (e) => {
      recordUserInteraction();

      const targetLink = e.target && e.target.closest ? e.target.closest('a') : null;
      if (targetLink) {
        const href = targetLink.getAttribute('href') || targetLink.href || '';
        const lowerHref = href.toLowerCase();

        // 1. Nếu là popup quảng cáo rác
        if (protectionState.blockPopups) {
          if (targetLink.target === '_blank' && !isAuthOrSafeUrl(href) && !isAuthOrSafeUrl(targetLink.className)) {
            // Chuyển sang mở trực tiếp trên chính webview thay vì popup cửa sổ mới
            targetLink.target = '_self';
          }
        }

        // 2. Nếu tính năng Chặn Tự Đổi URL (Anti-Redirect) đang BẬT
        if (protectionState.blockAutoRedirect) {
          const isAdLink = 
            lowerHref.includes('adserver') || 
            lowerHref.includes('doubleclick') || 
            lowerHref.includes('popads') || 
            lowerHref.includes('popcash') || 
            lowerHref.includes('adcash') || 
            lowerHref.includes('trafficjunky') || 
            lowerHref.includes('bet88') || 
            lowerHref.includes('shopee') || 
            lowerHref.includes('lazada') || 
            lowerHref.includes('linkvertise') || 
            lowerHref.includes('redirect') || 
            lowerHref.includes('affiliate') || 
            lowerHref.includes('tracker') ||
            lowerHref.includes('onclick');

          if (isAdLink && !isAuthOrSafeUrl(href)) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            console.warn('[Tool 7 Anti-Redirect] 🛡️ Đã triệt tiêu cú click vào link gài quảng cáo:', href);
            return false;
          }
        }
      }
    }, true);

  } catch (err) {
    console.warn('[Tool 7 Popup Blocker] Init warning:', err);
  }

  // --------------------------------------------------------------------------
  // 3. ANTI-REDIRECT & CLICK-JACKING PROTECTOR MODULE (TÍNH NĂNG 2)
  // --------------------------------------------------------------------------
  try {
    // 3.1. Hook location.assign và location.replace
    const originalAssign = window.location.assign ? window.location.assign.bind(window.location) : null;
    const originalReplace = window.location.replace ? window.location.replace.bind(window.location) : null;

    function checkCanRedirect(targetUrl) {
      if (!protectionState.blockAutoRedirect) return true;
      if (!targetUrl || typeof targetUrl !== 'string') return true;
      if (isAuthOrSafeUrl(targetUrl)) return true;

      const elapsed = Date.now() - lastUserInteractionTimestamp;
      let isSameOrigin = false;
      try {
        const targetHost = new URL(targetUrl, window.location.href).hostname;
        const currentHost = window.location.hostname;
        isSameOrigin = !targetHost || targetHost === currentHost || targetHost.endsWith('.' + currentHost) || currentHost.endsWith('.' + targetHost);
      } catch(e) {}

      const lower = targetUrl.toLowerCase();
      const isAd = 
        lower.includes('adserver') || 
        lower.includes('doubleclick') || 
        lower.includes('popads') || 
        lower.includes('popcash') || 
        lower.includes('adcash') || 
        lower.includes('bet88') || 
        lower.includes('shopee') || 
        lower.includes('lazada') || 
        lower.includes('linkvertise') || 
        lower.includes('redirect') || 
        lower.includes('affiliate') || 
        lower.includes('tracker');

      if (isAd || (elapsed > 1500 && !isSameOrigin)) {
        console.warn('[Tool 7 Anti-Redirect] 🛡️ Đã chặn chuyển hướng tự động sang domain lạ:', targetUrl);
        return false;
      }
      return true;
    }

    if (originalAssign) {
      window.location.assign = function(url) {
        if (!checkCanRedirect(url)) return;
        return originalAssign(url);
      };
    }

    if (originalReplace) {
      window.location.replace = function(url) {
        if (!checkCanRedirect(url)) return;
        return originalReplace(url);
      };
    }

    // 3.2. Quét và triệt tiêu các lớp phủ tàng hình (Click-jacking Overlays)
    function sanitizeClickJackingOverlays() {
      if (!protectionState.blockAutoRedirect) return;
      try {
        const elements = document.querySelectorAll('div, a, span, section, iframe');
        const screenArea = window.innerWidth * window.innerHeight;
        
        elements.forEach(el => {
          try {
            const style = window.getComputedStyle(el);
            if (style.position === 'fixed' || style.position === 'absolute') {
              const rect = el.getBoundingClientRect();
              const elArea = rect.width * rect.height;

              // Nếu phần tử phủ > 50% màn hình
              if (elArea > screenArea * 0.5) {
                const isTransparent = parseFloat(style.opacity) < 0.15 || style.backgroundColor === 'rgba(0, 0, 0, 0)' || style.backgroundColor === 'transparent';
                const zIndex = parseInt(style.zIndex, 10) || 0;

                // Nếu là lớp phủ vô hình không có nội dung văn bản hữu ích
                if ((isTransparent || zIndex >= 50) && (!el.innerText || el.innerText.trim().length === 0)) {
                  el.style.pointerEvents = 'none';
                  el.style.display = 'none';
                  console.log('[Tool 7 Anti-Redirect] 🛡️ Đã triệt tiêu lớp bẫy click tàng hình:', el);
                }
              }
            }
          } catch(err) {}
        });
      } catch(e) {}
    }

    // Quét định kỳ các lớp bẫy click
    setInterval(sanitizeClickJackingOverlays, 1000);
    document.addEventListener('DOMContentLoaded', sanitizeClickJackingOverlays);

  } catch (err) {
    console.warn('[Tool 7 Anti-Redirect] Init warning:', err);
  }

  // --------------------------------------------------------------------------
  // 4. CLOUDFLARE TURNSTILE & CAPTCHA AUTO-SOLVER MODULE
  // --------------------------------------------------------------------------
  let lastSolveAttempt = 0;
  let isSolving = false;

  function simulateHumanClick(element, clientX, clientY) {
    if (!element) return;
    try {
      recordUserInteraction();
      const rect = element.getBoundingClientRect();
      const x = clientX !== undefined ? clientX : (rect.left + Math.min(30, rect.width / 2));
      const y = clientY !== undefined ? clientY : (rect.top + rect.height / 2);

      const eventOpts = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        screenX: window.screenX + x,
        screenY: window.screenY + y,
        button: 0,
        buttons: 1
      };

      element.dispatchEvent(new MouseEvent('mouseenter', eventOpts));
      element.dispatchEvent(new MouseEvent('mousemove', eventOpts));
      element.dispatchEvent(new MouseEvent('mouseover', eventOpts));
      element.dispatchEvent(new MouseEvent('mousedown', eventOpts));
      
      setTimeout(() => {
        try {
          element.dispatchEvent(new MouseEvent('mouseup', eventOpts));
          element.dispatchEvent(new MouseEvent('click', eventOpts));
        } catch(e) {}
      }, 50 + Math.floor(Math.random() * 60));
    } catch (e) {
      try { element.click(); } catch(err) {}
    }
  }

  function tryAutoSolveCloudflare() {
    const now = Date.now();
    if (now - lastSolveAttempt < 2500 || isSolving) return;

    // 1. Kiểm tra nếu đang ở trang Cloudflare Challenge độc lập
    const isCloudflarePage = 
      document.title.includes('Just a moment') ||
      document.title.includes('Thực hiện xác minh') ||
      document.title.includes('Checking your browser') ||
      document.title.includes('Cloudflare') ||
      document.getElementById('challenge-stage') ||
      document.getElementById('challenge-form') ||
      document.getElementById('cf-turnstile');

    // 2. Tìm kiếm Turnstile Iframe hoặc Container
    const turnstileIframe = document.querySelector('iframe[src*="challenges.cloudflare.com"], iframe[src*="challenge-platform"], iframe[title*="Cloudflare"], iframe[src*="turnstile"]');
    const challengeStage = document.getElementById('challenge-stage');
    const ctpCheckbox = document.querySelector('.ctp-checkbox-label, input[type="checkbox"][name*="cf"], #cf-stage input, .cf-turnstile-wrapper');

    if (turnstileIframe || ctpCheckbox || (isCloudflarePage && challengeStage)) {
      lastSolveAttempt = now;
      isSolving = true;

      // Độ trễ tự nhiên để widget Turnstile nạp xong crypto script
      setTimeout(() => {
        try {
          if (ctpCheckbox && ctpCheckbox.offsetParent !== null) {
            simulateHumanClick(ctpCheckbox);
          } else if (turnstileIframe && turnstileIframe.offsetParent !== null) {
            const rect = turnstileIframe.getBoundingClientRect();
            // Ô checkbox nằm ở góc trái widget (khoảng x=28, y=32 tính từ góc trên bên trái của iframe)
            const clickX = rect.left + 28;
            const clickY = rect.top + Math.min(32, rect.height / 2);

            simulateHumanClick(turnstileIframe, clickX, clickY);

            // Cũng thử click vào container bao bọc nếu có
            if (turnstileIframe.parentElement) {
              simulateHumanClick(turnstileIframe.parentElement, clickX, clickY);
            }
          } else if (challengeStage) {
            simulateHumanClick(challengeStage);
          }
        } catch (err) {
          console.warn('[Tool 7 AutoSolve] Click error:', err);
        } finally {
          setTimeout(() => { isSolving = false; }, 1500);
        }
      }, 600 + Math.floor(Math.random() * 400));
    }
  }

  // --------------------------------------------------------------------------
  // 5. OBSERVER & LIFECYCLE LISTENERS
  // --------------------------------------------------------------------------
  function setupObservers() {
    tryAutoSolveCloudflare();

    const observer = new MutationObserver(() => {
      tryAutoSolveCloudflare();
    });

    if (document.documentElement) {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true
      });
    }

    // Kiểm tra định kỳ nhẹ nhàng trong 15s đầu
    let pollCount = 0;
    const interval = setInterval(() => {
      pollCount++;
      tryAutoSolveCloudflare();
      if (pollCount >= 30) {
        clearInterval(interval);
      }
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupObservers);
  } else {
    setupObservers();
  }

  window.addEventListener('load', () => {
    setTimeout(tryAutoSolveCloudflare, 300);
    setTimeout(tryAutoSolveCloudflare, 1200);
  });

})();
