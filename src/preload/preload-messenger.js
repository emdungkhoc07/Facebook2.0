const { webFrame, ipcRenderer } = require('electron');

// 2. Khóa cứng ở messenger.com (Nếu bị Facebook chuyển hướng sau khi đăng nhập thì kéo về messenger.com)
if (window.location.hostname.includes('facebook.com')) {
  const path = window.location.pathname.toLowerCase();
  const isAuth = path.includes('login') || path.includes('checkpoint') || path.includes('two_factor') || path.includes('auth') || path.includes('recover');
  if (!isAuth) {
    window.location.replace('https://www.messenger.com/');
  }
}

// ==========================================================================
// 3. CẢM BIẾN ĐỊNH VỊ 7 THẺ DANH BẠ & THANH NHẬP TIN NHẮN (OVERLAY NỔI)
// ==========================================================================

let overlayRoot = null;
const pillElements = [];
const TOTAL_PILLS = 8; // 7 thẻ danh bạ (0..6) + 1 thanh nhập tin nhắn (7)
let isSensorOverlayVisible = true;
let contactSensorLimit = 7; // Giới hạn số thẻ danh bạ cho phép cảm biến quét (0 - 7)

ipcRenderer.on('sensor-toggle-overlay', (event, enabled) => {
  isSensorOverlayVisible = enabled;
  if (overlayRoot) {
    overlayRoot.style.display = isSensorOverlayVisible ? 'block' : 'none';
  }
  console.log(`[Sensor Overlay] Hiển thị viền xanh neon: ${enabled ? 'BẬT' : 'TẮT'}`);
});

ipcRenderer.on('sensor-update-limit', (event, limit) => {
  if (typeof limit === 'number') {
    contactSensorLimit = Math.max(0, Math.min(7, limit));
    console.log(`[Sensor Preload] Cập nhật giới hạn thẻ danh bạ: ${contactSensorLimit}`);
    renderNeonPills();
  }
});

try {
  ipcRenderer.invoke('load-datatool-config').then(cfg => {
    if (cfg && cfg.sensorSettings && typeof cfg.sensorSettings.contactLimit === 'number') {
      contactSensorLimit = Math.max(0, Math.min(7, cfg.sensorSettings.contactLimit));
      console.log(`[Sensor Preload] Khởi tạo giới hạn thẻ danh bạ: ${contactSensorLimit}`);
      renderNeonPills();
    }
  }).catch(() => {});
} catch(e) {}

function ensureOverlayLayer() {
  if (!window.location.hostname.includes('messenger.com')) return false;

  if (!overlayRoot || !document.documentElement.contains(overlayRoot)) {
    overlayRoot = document.getElementById('automess-neon-overlay-root');
    if (!overlayRoot) {
      overlayRoot = document.createElement('div');
      overlayRoot.id = 'automess-neon-overlay-root';
      overlayRoot.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 2147483647; overflow: hidden; display: ${isSensorOverlayVisible ? 'block' : 'none'};`;
      document.documentElement.appendChild(overlayRoot);
    }
  }

  if (pillElements.length === 0 || !overlayRoot.contains(pillElements[0])) {
    overlayRoot.innerHTML = '';
    pillElements.length = 0;
    for (let i = 0; i < TOTAL_PILLS; i++) {
      const pill = document.createElement('div');
      pill.id = `automess-neon-pill-${i}`;
      pill.style.cssText = `
        position: fixed;
        display: none;
        box-sizing: border-box;
        pointer-events: none;
        border: 3px solid #00ff66 !important;
        border-radius: 9999px !important;
        background-color: rgba(0, 255, 102, 0.04) !important;
        box-shadow: 0 0 12px #00ff66, 0 0 24px rgba(0, 255, 102, 0.6), inset 0 0 8px rgba(0, 255, 102, 0.35) !important;
        transition: top 0.05s ease-out, left 0.05s ease-out, width 0.05s ease-out, height 0.05s ease-out;
        z-index: 2147483647;
      `;
      overlayRoot.appendChild(pill);
      pillElements.push(pill);
    }
  }
  return true;
}

// --------------------------------------------------------------------------
// CẢM BIẾN 1: ĐỊNH VỊ 7 THẺ DANH BẠ ĐẦU TIÊN
// --------------------------------------------------------------------------
function scanTop7ContactCards() {
  if (contactSensorLimit <= 0) return [];

  const candidateList = [];

  const rows = document.querySelectorAll(
    '[role="navigation"] [role="row"], ' +
    '[role="grid"] [role="row"], ' +
    '[aria-label*="chat" i] [role="row"], ' +
    '[aria-label*="đoạn chat" i] [role="row"], ' +
    'a[href*="/t/"], ' +
    'a[href*="messages/t/"], ' +
    '[role="navigation"] [role="listitem"], ' +
    '[role="navigation"] [role="gridcell"]'
  );

  for (const el of rows) {
    if (!el || typeof el.getBoundingClientRect !== 'function') continue;
    const r = el.getBoundingClientRect();
    if (r.left >= 0 && r.left < window.innerWidth * 0.45 &&
        r.width >= 120 && r.width <= window.innerWidth * 0.48 &&
        r.height >= 35 && r.height <= 110 &&
        r.top >= 40 && r.bottom <= window.innerHeight + 50) {
      candidateList.push({ el, rect: r });
    }
  }

  if (candidateList.length < 7) {
    const avatars = document.querySelectorAll('img[src*="scontent"], img[alt], svg image');
    for (const av of avatars) {
      const ar = av.getBoundingClientRect();
      if (ar.left >= 0 && ar.left < 100 && ar.top >= 40 && ar.top < window.innerHeight - 30 && ar.width >= 24 && ar.width <= 75) {
        const row = av.closest('a') || av.closest('[role="row"]') || av.parentElement?.parentElement?.parentElement;
        if (row && typeof row.getBoundingClientRect === 'function') {
          const rr = row.getBoundingClientRect();
          if (rr.width >= 120 && rr.height >= 35 && rr.height <= 110) {
            candidateList.push({ el: row, rect: rr });
          }
        }
      }
    }
  }

  candidateList.sort((a, b) => a.rect.top - b.rect.top);

  const filtered = [];
  for (const item of candidateList) {
    const isDuplicate = filtered.some(existing => Math.abs(existing.top - item.rect.top) < 22);
    if (!isDuplicate) {
      filtered.push({
        el: item.el,
        top: item.rect.top + 1,
        left: item.rect.left + 4,
        width: item.rect.width - 8,
        height: item.rect.height - 2
      });
    }
    if (filtered.length >= contactSensorLimit) break;
  }

  return filtered;
}

// --------------------------------------------------------------------------
// CẢM BIẾN 2: ĐỊNH VỊ CHỐNG NHIỄU THANH NHẬP TIN NHẮN
// --------------------------------------------------------------------------
function scanMessageInputRect() {
  const editors = document.querySelectorAll(
    'div[role="main"] footer [contenteditable="true"], ' +
    'div[role="main"] form [contenteditable="true"], ' +
    'div[role="main"] [contenteditable="true"][role="textbox"], ' +
    '[contenteditable="true"][role="textbox"], ' +
    'div[aria-label="Tin nhắn" i], ' +
    'div[aria-label="Message" i], ' +
    'div[aria-label="Aa" i], ' +
    'div[role="main"] [contenteditable="true"]'
  );

  for (const ed of editors) {
    if (!ed || typeof ed.getBoundingClientRect !== 'function') continue;
    if (ed.closest('[role="row"]') || ed.closest('[data-testid*="message"]') || ed.closest('[aria-label*="Xem thêm" i]')) {
      continue;
    }

    const r = ed.getBoundingClientRect();
    if (r.left > 160 && r.top > window.innerHeight - 130 && r.height >= 18 && r.height <= 85 && r.width >= 100) {
      let wrapper = ed;
      let p = ed.parentElement;

      while (p && p !== document.body) {
        const pr = p.getBoundingClientRect();
        if (pr.bottom >= window.innerHeight - 100 && pr.height >= 30 && pr.height <= 75 && pr.width >= r.width) {
          wrapper = p;
          const style = window.getComputedStyle(p);
          if (style.borderRadius !== '0px' || p.tagName === 'FORM' || p.getAttribute('role') === 'presentation') {
            break;
          }
        }
        p = p.parentElement;
      }

      const wr = wrapper.getBoundingClientRect();
      return {
        top: wr.top + 1,
        left: wr.left + 2,
        width: wr.width - 4,
        height: wr.height - 2
      };
    }
  }
  return null;
}

// --------------------------------------------------------------------------
// CẬP NHẬT TỌA ĐỘ VÀ VẼ LỚP OVERLAY NỔI
// --------------------------------------------------------------------------
function renderNeonPills() {
  if (!ensureOverlayLayer()) return;

  if (overlayRoot) {
    overlayRoot.style.display = isSensorOverlayVisible ? 'block' : 'none';
  }

  const contactRects = scanTop7ContactCards();
  const inputRect = scanMessageInputRect();

  for (let i = 0; i < 7; i++) {
    const pill = pillElements[i];
    const rect = contactRects[i];

    if (i < contactSensorLimit && rect && pill) {
      pill.style.display = 'block';
      pill.style.top = `${rect.top}px`;
      pill.style.left = `${rect.left}px`;
      pill.style.width = `${rect.width}px`;
      pill.style.height = `${rect.height}px`;
    } else if (pill) {
      pill.style.display = 'none';
    }
  }

  const inputPill = pillElements[7];
  if (inputRect && inputPill) {
    inputPill.style.display = 'block';
    inputPill.style.top = `${inputRect.top}px`;
    inputPill.style.left = `${inputRect.left}px`;
    inputPill.style.width = `${inputRect.width}px`;
    inputPill.style.height = `${inputRect.height}px`;
  } else if (inputPill) {
    inputPill.style.display = 'none';
  }
}

// ==========================================================================
// 4. LÕI TỰ ĐỘNG TOOL 7: BỘ LỆNH ĐIỀU KHIỂN DUYỆT WEB TƯƠNG TÁC ĐẦY ĐỦ
//    - /web:<url>          : Mở trang web mới
//    - /<c1>-<c2>          : Lướt / cuộn trang web từ c1 đến c2 (VD: /a2-w2)
//    - /<coord>            : Click chuột vào tọa độ (VD: /a2, /k22)
//    - /[<văn bản>]        : Gõ văn bản vào ô tìm kiếm/nhập liệu
//    - /![delete]x<N>      : Nhấn nút xóa lùi (Backspace) N lần (VD: /![delete]x5)
//    - /![enter]           : Nhấn phím Enter
//    - /cap                : Chụp ảnh kèm lưới caro
//    - /!cap               : Chụp ảnh web sạch (không lưới)
//    - /web!reset          : F5 tải lại trang web
//    - /web!<              : Quay lại trang trước
//    - /web!>              : Đi tới trang tiếp theo
// ==========================================================================

let isTool7Enabled = true;
const processedCommandsHistory = new Set();

ipcRenderer.on('tool7-toggle-state', (event, enabled) => {
  isTool7Enabled = enabled;
  console.log(`[Tool 7 Preload] Cảm biến quét lệnh: ${enabled ? 'BẬT' : 'TẮT'}`);
});

ipcRenderer.on('force-focus-message-input', () => {
  const editors = document.querySelectorAll(
    'div[role="main"] footer [contenteditable="true"], ' +
    'div[role="main"] form [contenteditable="true"], ' +
    'div[role="main"] [contenteditable="true"][role="textbox"], ' +
    '[contenteditable="true"][role="textbox"], ' +
    'div[aria-label="Tin nhắn" i], ' +
    'div[aria-label="Message" i], ' +
    'div[aria-label="Aa" i], ' +
    'div[role="main"] [contenteditable="true"], ' +
    '[contenteditable="true"]'
  );
  for (const ed of editors) {
    if (ed.closest('[role="row"]') || ed.closest('[data-testid*="message"]')) continue;
    const r = ed.getBoundingClientRect();
    if (r.height >= 12 && r.width >= 40) {
      ed.focus();
      ed.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      ed.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      ed.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      try {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(ed);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch(e) {}
      break;
    }
  }
});

function extractBestUrlFromRow(row) {
  if (!row) return null;

  const candidates = [];
  if (row.textContent) candidates.push(row.textContent);
  if (row.innerText) candidates.push(row.innerText);

  const children = row.querySelectorAll ? row.querySelectorAll('span, a, div, p') : [];
  for (const c of children) {
    if (c.textContent) candidates.push(c.textContent);
    if (c.getAttribute) {
      const a = c.getAttribute('aria-label');
      if (a) candidates.push(a);
      const t = c.getAttribute('title');
      if (t) candidates.push(t);
    }
  }

  let bestFullUrl = '';
  let fallbackShortUrl = '';

  for (const raw of candidates) {
    if (!raw || !raw.includes('/web:')) continue;

    const regex = /\/web:\s*([^\s\n\r·•\u00A0\t]+)/gi;
    let match;
    while ((match = regex.exec(raw)) !== null) {
      let u = match[1].replace(/[·•\s]+.*$/, '').trim();
      const isTruncated = /\.{2,}$/.test(u) || /…$/.test(u);
      u = u.replace(/\.{2,}$/, '').replace(/…$/, '').trim();

      if (u.length >= 3) {
        if (!isTruncated) {
          if (u.length > bestFullUrl.length) {
            bestFullUrl = u;
          }
        } else {
          if (u.length > fallbackShortUrl.length) {
            fallbackShortUrl = u;
          }
        }
      }
    }
  }

  return bestFullUrl || fallbackShortUrl || null;
}

const COORD_REGEX_STR = '[a-yA-Y](?:[1-9]|[1-4][0-9]|5[0-4])';

function parseCommandSequence(rawText, row) {
  if (!rawText) return [];
  const text = rawText.trim();
  
  const steps = [];
  let remaining = text;

  while (remaining.length > 0) {
    remaining = remaining.trim();
    if (!remaining.startsWith('/') && !remaining.startsWith('@!#') && !remaining.startsWith('@#') && !remaining.startsWith('#')) {
      const nextIdx = remaining.search(/(?:\/|@!#|@#)/);
      if (nextIdx === -1) break;
      remaining = remaining.substring(nextIdx);
    }

    // 0. Lệnh Xóa toàn bộ dữ liệu web & cookie Tool 7 (/!webdelete, /webdelete, /web!delete)
    const webDeleteMatch = remaining.match(/^\/(?:!webdelete|webdelete|web!delete)\b/i);
    if (webDeleteMatch) {
      steps.push({ action: 'delete_web_data' });
      remaining = remaining.substring(webDeleteMatch[0].length);
      continue;
    }

    // 1. Enter: /![enter] or /[enter]
    const enterMatch = remaining.match(/^\/(?:!|)\[enter\]/i);
    if (enterMatch) {
      steps.push({ action: 'press_enter' });
      remaining = remaining.substring(enterMatch[0].length);
      continue;
    }

    // 2. Backspace: /![delete]xN or /[delete]xN or /![delete] or /[delete]
    const backspaceMatch = remaining.match(/^\/(?:!|)\[delete\](?:x(\d+))?/i);
    if (backspaceMatch) {
      const count = backspaceMatch[1] ? parseInt(backspaceMatch[1], 10) : 1;
      steps.push({ action: 'press_backspace', count: Math.max(1, Math.min(100, count)) });
      remaining = remaining.substring(backspaceMatch[0].length);
      continue;
    }

    // 3. Type text: /[...]
    const typeMatch = remaining.match(/^\/\[([^\]]+)\]/);
    if (typeMatch) {
      steps.push({ action: 'type_text', text: typeMatch[1] });
      remaining = remaining.substring(typeMatch[0].length);
      continue;
    }

    // 4. Find input: /find, /!find, /tim
    const findMatch = remaining.match(/^\/(?:!|)(?:find|tim)\b/i);
    if (findMatch) {
      steps.push({ action: 'find_input' });
      remaining = remaining.substring(findMatch[0].length);
      continue;
    }

    // 5. Clean Capture: /!cap
    const cleanCapMatch = remaining.match(/^\/!cap\b/i);
    if (cleanCapMatch) {
      steps.push({ action: 'capture_clean' });
      remaining = remaining.substring(cleanCapMatch[0].length);
      continue;
    }

    // 6. Grid Capture: /cap
    const capMatch = remaining.match(/^\/cap\b/i);
    if (capMatch) {
      steps.push({ action: 'capture_only' });
      remaining = remaining.substring(capMatch[0].length);
      continue;
    }

    // 7. Extract images / clear cache: /#clear, /##n (web tĩnh), /#n (web bảo mật/dynamic)
    const clearMatch = remaining.match(/^(?:\/|@!|@)?#(?:clear)\b/i);
    if (clearMatch) {
      steps.push({ action: 'clear_image_history' });
      remaining = remaining.substring(clearMatch[0].length);
      continue;
    }

    // 7.1. Lệnh mới: /##n cho web tĩnh đơn giản (lấy ảnh trực tiếp từ thẻ DOM)
    const extractStaticMatch = remaining.match(/^(?:\/|@!|@)##(\d+)?/i) || remaining.match(/^\/(?:staticimg|anh2|img2|staticimage):\s*(\d+)/i);
    if (extractStaticMatch) {
      const count = extractStaticMatch[1] ? parseInt(extractStaticMatch[1], 10) : 5;
      steps.push({ action: 'extract_static_images', count: Math.max(1, Math.min(50, count)) });
      remaining = remaining.substring(extractStaticMatch[0].length);
      continue;
    }

    // 7.2. Lệnh hiện tại: /#n cho web bảo mật tầm trung (Pixiv, truyện tranh, dynamic, lazyload)
    const extractMatch = remaining.match(/^(?:\/|@!|@)#(\d+)?/i) || remaining.match(/^\/(?:anh|img|image):\s*(\d+)/i) || remaining.match(/^\/(?:anh|img|image)\s*x?(\d+)/i);
    if (extractMatch) {
      const count = extractMatch[1] ? parseInt(extractMatch[1], 10) : 5;
      steps.push({ action: 'extract_images', count: Math.max(1, Math.min(50, count)) });
      remaining = remaining.substring(extractMatch[0].length);
      continue;
    }

    // 8. Scroll drag: /a2-w2
    const dragRegex = new RegExp(`^\\/(${COORD_REGEX_STR})\\s*-\\s*(${COORD_REGEX_STR})\\b`, 'i');
    const dragMatch = remaining.match(dragRegex);
    if (dragMatch) {
      steps.push({ action: 'scroll_drag', from: dragMatch[1].toUpperCase(), to: dragMatch[2].toUpperCase() });
      remaining = remaining.substring(dragMatch[0].length);
      continue;
    }

    // 9. Click coord: /a2, /k22
    const clickRegex = new RegExp(`^\\/(${COORD_REGEX_STR})\\b`, 'i');
    const clickMatch = remaining.match(clickRegex);
    if (clickMatch && !/^(cap|web|ai|help|model|image|delete|star|stop|find|tim)$/i.test(clickMatch[1])) {
      steps.push({ action: 'click_coord', coord: clickMatch[1].toUpperCase() });
      remaining = remaining.substring(clickMatch[0].length);
      continue;
    }

    // 10. Web control: /web!reset, /web!<, /web!>
    const webResetMatch = remaining.match(/^\/web!reset\b/i);
    if (webResetMatch) {
      steps.push({ action: 'reset' });
      remaining = remaining.substring(webResetMatch[0].length);
      continue;
    }
    const webBackMatch = remaining.match(/^\/web!</i);
    if (webBackMatch) {
      steps.push({ action: 'back' });
      remaining = remaining.substring(webBackMatch[0].length);
      continue;
    }
    const webForwardMatch = remaining.match(/^\/web!>/i);
    if (webForwardMatch) {
      steps.push({ action: 'forward' });
      remaining = remaining.substring(webForwardMatch[0].length);
      continue;
    }

    // 11. Open URL: /web:<url>, /!web:<url>, /url:<url>
    const webUrlMatch = remaining.match(/^\/(?:!web:|web:|url:)\s*([^\r\n]+)/i);
    if (webUrlMatch) {
      let rawUrl = webUrlMatch[1];
      const nextCmdRegex = /\/(?:find|tim|\[|!\[|#|\d+|cap|!cap|[a-yA-Y]\d+|web!)/i;
      let searchOffset = 0;
      if (/^https?:\/\//i.test(rawUrl)) {
        searchOffset = rawUrl.indexOf('://') + 3;
      }
      const subIdx = rawUrl.substring(searchOffset).search(nextCmdRegex);
      const subCmdIdx = subIdx >= 0 ? searchOffset + subIdx : -1;
      
      let finalUrl = rawUrl;
      let consumedLen = webUrlMatch[0].length;
      
      if (subCmdIdx > 0) {
        finalUrl = rawUrl.substring(0, subCmdIdx).trim();
        consumedLen = webUrlMatch[0].length - (rawUrl.length - subCmdIdx);
      } else {
        finalUrl = rawUrl.trim();
      }

      // Xóa các ký tự thừa từ Messenger (như dấu chấm thời gian · 5 phút, v.v.)
      finalUrl = finalUrl.replace(/[·•].*$/, '').replace(/(?:\r?\n|\s)+(?:Đã gửi|Sent|\d{1,2}:\d{2})$/i, '').trim();
      finalUrl = finalUrl.replace(/\.{2,}$/, '').replace(/…$/, '').trim();

      if (finalUrl === 'reset' || finalUrl === '!reset') {
        steps.push({ action: 'reset' });
      } else if (finalUrl === '<' || finalUrl === '!<') {
        steps.push({ action: 'back' });
      } else if (finalUrl === '>' || finalUrl === '!>') {
        steps.push({ action: 'forward' });
      } else if (finalUrl.length > 0) {
        // Nhập y nguyên nội dung, KHÔNG tự ý thêm https://
        steps.push({ action: 'open_url', url: finalUrl });
      }

      remaining = remaining.substring(consumedLen);
      continue;
    }

    remaining = remaining.substring(1);
  }

  return steps;
}

function parseCommandFromText(rawText, row) {
  const steps = parseCommandSequence(rawText, row);
  if (!steps || steps.length === 0) return null;
  return { steps, ...steps[0] };
}

function scanAndExecuteWebInMessCommands() {
  if (!isTool7Enabled || contactSensorLimit <= 0) return;

  const topCards = scanTop7ContactCards();
  if (!topCards || topCards.length === 0) return;

  for (let cIdx = 0; cIdx < topCards.length; cIdx++) {
    const row = topCards[cIdx].el;
    if (!row || typeof row.getBoundingClientRect !== 'function') continue;

    // BƯỚC 1: PHÂN BIỆT TIN NHẮN MỚI VS TIN NHẮN CŨ
    // NẾU LÀ TIN NHẮN CŨ (NÉT THƯỜNG, MÀU CHỮ XÁM KHÔNG ĐEN ĐẶC) -> LOẠI BỎ NGAY 100%
    if (!isSidebarRowUnread(row)) {
      continue;
    }

    // BƯỚC 2: QUA ẢI -> ĐƯA ĐẾN LUỒNG CHECK ĐIỀU KIỆN TIẾP THEO
    const fullRowText = (row.textContent || row.innerText || '') + ' ' + (row.getAttribute('aria-label') || '');
    if (!fullRowText) continue;

    const detectedSteps = parseCommandSequence(fullRowText, row);

    if (detectedSteps && detectedSteps.length > 0) {
      const cmdKey = detectedSteps.map(s => `${s.action}:${s.url || s.coord || s.from || s.to || s.text || s.count || ''}`).join('->');
      if (processedCommandsHistory.has(cmdKey)) continue;

      processedCommandsHistory.add(cmdKey);
      setTimeout(() => processedCommandsHistory.delete(cmdKey), 10000); // 10s cooldown tuyệt đối

      console.log(`[Tool 7 Preload] 🎯 TÌM THẤY CHUỖI ${detectedSteps.length} LỆNH TỪ TIN NHẮN MỚI:`, detectedSteps);

      // Click chuột thật vào hàng danh bạ để chuyển đúng cuộc trò chuyện
      const clickTarget = row.querySelector('a') || row;
      try {
        clickTarget.click();
        clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      } catch(e) {}

      // Gửi IPC chuỗi lệnh tới Main Process trực tiếp từ Thẻ Danh Bạ
      const payload = {
        steps: detectedSteps,
        ...detectedSteps[0]
      };
      ipcRenderer.send('tool7-request-web-capture', payload);

      break;
    }
  }
}

// ==========================================================================
// 5. LÕI TỰ ĐỘNG TOOL 2: CẢM BIẾN QUÉT LỆNH AI AUTO REPLY (GOOGLE GEMINI)
//    - /help        : Xem lại các lệnh
//    - /ai <text>   : Nhắn nội dung cho AI đọc và trả lời
//    - /model <name>: Đổi model AI
//    - /image <desc>: Tạo ảnh bằng AI
//    - /delete      : Xóa ngữ cảnh chat với AI
//    - /star        : Bật tự động đọc tin nhắn không cần lệnh
//    - /stop        : Tắt tự động đọc tin nhắn
// ==========================================================================
// 5. LÕI TỰ ĐỘNG TOOL 2: CẢM BIẾN QUÉT LỆNH AI AUTO REPLY (GOOGLE GEMINI)
//    - /help        : Xem lại các lệnh
//    - /ai <text>   : Nhắn nội dung cho AI đọc và trả lời
//    - /model <name>: Đổi model AI
//    - /image <desc>: Tạo ảnh bằng AI
//    - /delete      : Xóa ngữ cảnh chat với AI
//    - /star        : Bật tự động đọc tin nhắn không cần lệnh
//    - /stop        : Tắt tự động đọc tin nhắn
// ==========================================================================
let isTool2Enabled = false;
const processedTool2CommandsMap = new Map(); // canonicalKey -> timestamp (ms)
let isProcessingTool2 = false;
let dynamicCommandsConfig = null;

function getTool2CanonicalKey(threadId, command, text) {
  const cleanThread = (threadId || 'active').trim();
  const cleanCmd = (command || '').trim().toLowerCase();
  const cleanText = (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `t2:${cleanThread}:${cleanCmd}:${cleanText}`;
}

function isTool2CommandProcessed(threadId, command, text, maxAgeMs = 25000) {
  const cleanCmd = (command || '').trim().toLowerCase();
  const cleanText = (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const now = Date.now();

  // 1. Kiểm tra theo Thread ID
  const key = `t2:${(threadId || 'active').trim()}:${cleanCmd}:${cleanText}`;
  if (processedTool2CommandsMap.has(key)) {
    const lastTime = processedTool2CommandsMap.get(key);
    if (now - lastTime < maxAgeMs) {
      return true;
    }
  }

  // 2. Kiểm tra theo nội dung tin nhắn toàn cục (chống việc sidebar quét lại cùng 1 tin nhắn)
  const globalKey = `t2_global:${cleanCmd}:${cleanText}`;
  if (processedTool2CommandsMap.has(globalKey)) {
    const lastTime = processedTool2CommandsMap.get(globalKey);
    if (now - lastTime < 15000) {
      return true;
    }
  }

  return false;
}

function markTool2CommandProcessed(threadId, command, text) {
  const cleanCmd = (command || '').trim().toLowerCase();
  const cleanText = (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const key = `t2:${(threadId || 'active').trim()}:${cleanCmd}:${cleanText}`;
  const globalKey = `t2_global:${cleanCmd}:${cleanText}`;
  const now = Date.now();

  processedTool2CommandsMap.set(key, now);
  processedTool2CommandsMap.set(globalKey, now);

  if (processedTool2CommandsMap.size > 200) {
    for (const [k, time] of processedTool2CommandsMap.entries()) {
      if (now - time > 60000) processedTool2CommandsMap.delete(k);
    }
  }
}

let tool2BlacklistConfig = '';

async function refreshTool2Blacklist() {
  try {
    tool2BlacklistConfig = (await ipcRenderer.invoke('get-tool2-blacklist')) || '';
  } catch(e) {}
}
refreshTool2Blacklist();
setInterval(refreshTool2Blacklist, 3000);

async function refreshCommandsConfig() {
  try {
    dynamicCommandsConfig = await ipcRenderer.invoke('get-commands-config');
  } catch(e) {}
}
refreshCommandsConfig();
setInterval(refreshCommandsConfig, 5000);

// Khởi tạo trạng thái Bật/Tắt từ datatool.json
try {
  ipcRenderer.invoke('load-datatool-config').then(cfg => {
    if (cfg && cfg.subtoolsState && cfg.subtoolsState['subtool-2'] !== undefined) {
      isTool2Enabled = !!cfg.subtoolsState['subtool-2'];
      console.log(`[Tool 2 Preload] Khởi tạo cảm biến Tool 2: ${isTool2Enabled ? 'BẬT' : 'TẮT'}`);
    }
  }).catch(() => {});
} catch(e) {}

ipcRenderer.on('tool2-toggle-state', (event, enabled) => {
  isTool2Enabled = !!enabled;
  console.log(`[Tool 2 Preload] Cảm biến AI Auto Reply: ${enabled ? 'BẬT' : 'TẮT'}`);
});

function isTool7CommandText(rawText) {
  if (!rawText) return false;
  const clean = rawText.trim();
  if (!clean) return false;

  // 1. Kiểm tra qua parser tuần tự của Tool 7
  try {
    const steps = parseCommandSequence(clean);
    if (steps && steps.length > 0) return true;
  } catch(e) {}

  // 2. Nhận diện các mẫu lệnh của Tool 7 (Web-in-Mess)
  const tool7Patterns = [
    /^\s*\/(?:!web:|web:|url:|web!|webdelete|!webdelete|web!delete)/i,
    /^\s*\/(?:!|)(?:cap|find|tim)\b/i,
    /^\s*\/(?:!|)\[(?:enter|delete)(?:x\d+)?\]/i,
    /^\s*\/\[[^\]]+\]/,
    /^\s*(?:\/|@!|@)?#(?:clear|\d+)\b/i,
    /^\s*\/(?:anh|img|image)(?::|\s*x?)\s*\d+/i,
    /^\s*\/[a-yA-Y](?:[1-9]|[1-4][0-9]|5[0-4])(?:\s*-\s*[a-yA-Y](?:[1-9]|[1-4][0-9]|5[0-4]))?\b/i
  ];

  for (const pattern of tool7Patterns) {
    if (pattern.test(clean)) return true;
  }

  // 3. Nếu trong chuỗi tin nhắn có chứa bất kỳ cú pháp lệnh Tool 7 nào
  if (/(?:\/!web:|\/web:|\/url:|\/web!|\/webdelete|\/cap\b|\/!cap\b|\/find\b|\/!find\b|\/tim\b|\/!tim\b|@!#|@#|\/##[a-zA-Z0-9_-]*|\/#[a-zA-Z0-9_-]+|\/\[[^\]]+\]|\/\[enter\]|\/\[delete\])/i.test(clean)) {
    return true;
  }

  return false;
}

function parseTool2CommandFromText(rawText) {
  if (!rawText) return null;
  const text = rawText.trim();

  // NẾU LÀ LỆNH CỦA TOOL 7 (WEB) -> TUYỆT ĐỐI BỎ QUA 100%, KHÔNG COI LÀ LỆNH TOOL 2
  if (isTool7CommandText(text)) return null;

  const t2Cmds = (dynamicCommandsConfig && dynamicCommandsConfig.tool2_ai_auto_reply && dynamicCommandsConfig.tool2_ai_auto_reply.commands) || {
    help: ["/help", "/!help"],
    ai: ["/ai", "/!ai"],
    model: ["/model", "/!model"],
    delete: ["/delete", "/!delete", "/xoa", "/!xoa"],
    star: ["/star", "/!star", "/start", "/!start", "/bat", "/!bat", "/on", "/!on"],
    stop: ["/stop", "/!stop", "/tat", "/!tat", "/off", "/!off"]
  };

  const matchPrefix = (aliases) => {
    for (const alias of aliases) {
      if (!alias) continue;
      const clean = alias.trim();
      const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Cho phép lệnh xuất hiện ở đầu dòng, sau dấu cách, sau dấu xuống dòng, sau (Tên) hoặc sau tiền tố "Bạn:" / tên người gửi
      const regex = new RegExp(`(?:^|[\\r\\n\\s:：]|\\([^)]+\\)|(?:Bạn|You|Người gửi)[\\s:：]*)${escaped}(?:[\\s\\r\\n]+([\\s\\S]*)|$)`, 'i');
      const m = text.match(regex);
      if (m) {
        let content = (m[1] || '').trim();
        // Cắt bỏ phần timestamp hoặc trạng thái "Đã gửi" nếu dính vào cuối chuỗi
        content = content.replace(/(?:\r?\n|\s)+(?:Đã gửi|Sent|\d{1,2}:\d{2})$/i, '').trim();
        return { matched: true, content };
      }
    }
    return { matched: false, content: '' };
  };

  for (const cmdKey of ['help', 'model', 'delete', 'star', 'stop', 'ai']) {
    const aliases = t2Cmds[cmdKey] || [];
    const res = matchPrefix(aliases);
    if (res.matched) {
      return { command: cmdKey, text: res.content };
    }
  }

  return null;
}

function isOutgoingSidebarText(text) {
  if (!text) return false;
  const clean = text.trim();

  // 1. Bắt triệt để mọi biến thể "Bạn :", "bạn :", "Bạn:", "bạn:", "You:", "you:", "You :"
  if (/(?:^|[\r\n\s(]|(?:^|\s)[(\[{])(?:bạn|you)\s*[:：]/i.test(clean) || /(?:bạn|you)\s*[:：]/i.test(clean)) {
    return true;
  }

  // 2. Bắt các trạng thái đang gửi / gửi thất bại / đã gửi
  if (/(?:đang\s*gửi|sending\b|đã\s*gửi|sent\b)/i.test(clean)) {
    return true;
  }

  // 3. Bắt các tiền tố gửi đi của Facebook / Messenger
  if (/(?:bạn\s+đã\s+gửi|you\s+sent|bạn\s+đã\s+chia\s+sẻ|you\s+shared|bạn\s+đã\s+bày\s+tỏ|you\s+reacted|bạn\s+đã\s+trả\s+lời|you\s+replied)/i.test(clean)) {
    return true;
  }

  // 4. BỘ LỌC BỎ QUA TOÀN BỘ CÁC LỆNH CỦA TOOL 7 (WEB IN MESS)
  if (isTool7CommandText(clean)) {
    return true;
  }

  return false;
}

function isMessageOutgoingByGeometry(el) {
  try {
    if (!el) return false;
    const main = document.querySelector('div[role="main"]') || document.body;
    const mainRect = main.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    if (mainRect.width > 0 && elRect.width > 0) {
      const mainCenterX = mainRect.left + (mainRect.width / 2);
      const elCenterX = elRect.left + (elRect.width / 2);

      // Nếu tâm phần tử nằm ở nửa bên phải của khung chat chính -> Tin nhắn gửi đi
      if (elCenterX > mainCenterX) {
        return true;
      }

      // Nếu mép phải của phần tử nằm sát mép phải khung chat (< 30% width)
      if ((mainRect.right - elRect.right) < (mainRect.width * 0.3)) {
        return true;
      }
    }
  } catch(e) {}
  return false;
}

function isOutgoingMessageElement(el) {
  if (!el) return false;
  try {
    const raw = (el.textContent || '').trim();

    // 1. Kiểm tra trực tiếp nội dung chữ có chứa từ khóa gửi đi
    if (isOutgoingSidebarText(raw)) return true;

    // 2. Kiểm tra thuộc tính aria-label của phần tử hoặc cha
    const aria = (el.getAttribute('aria-label') || '') + ' ' + (el.closest('[aria-label]')?.getAttribute('aria-label') || '');
    if (isOutgoingSidebarText(aria)) return true;

    // 3. Kiểm tra hình học vị trí (Bong bóng nằm ở nửa bên phải màn hình chat)
    if (isMessageOutgoingByGeometry(el)) return true;

    // 4. Kiểm tra các style căn phải flexbox
    const row = el.closest('[role="row"]') || el.closest('[data-testid]') || el.parentElement;
    if (row) {
      const ariaRow = row.getAttribute('aria-label') || '';
      if (isOutgoingSidebarText(ariaRow)) return true;
      const rowStyle = window.getComputedStyle(row);
      if (rowStyle.justifyContent === 'flex-end' || rowStyle.alignItems === 'flex-end' || rowStyle.flexDirection === 'row-reverse') {
        return true;
      }
    }
  } catch(e) {}
  return false;
}

function getActiveSenderName(el) {
  try {
    // 1. Thử lấy từ aria-label của hàng tin nhắn (ví dụ: "Nguyễn Tuấn đã gửi: ...")
    const parentRow = el?.closest('[role="row"]') || el?.closest('[data-message-id]');
    if (parentRow) {
      const aria = parentRow.getAttribute('aria-label') || '';
      const ariaMatch = aria.match(/^([^:,\n\r]+?)(?:\s+đã gửi|\s+sent|:)/i);
      if (ariaMatch && ariaMatch[1]) {
        const candidate = ariaMatch[1].trim();
        if (candidate && candidate.length < 40 && !isOutgoingSidebarText(candidate)) {
          return candidate;
        }
      }
    }

    // 2. Thử lấy từ Header của khung chat đang mở
    const headerEl = document.querySelector(
      'div[role="main"] h1, ' +
      'div[role="main"] h2, ' +
      'div[role="main"] [role="heading"], ' +
      'div[role="main"] header [dir="auto"], ' +
      '[data-testid="mw_chat_header"] [dir="auto"]'
    );
    if (headerEl) {
      const headerText = (headerEl.textContent || '').trim();
      if (headerText && headerText.length < 40 && !/(?:đang hoạt động|hoạt động|messenger|tin nhắn)/i.test(headerText)) {
        return headerText;
      }
    }

    // 3. Thử lấy từ tiêu đề trang (document.title e.g. "Nguyễn Tuấn | Messenger")
    if (document.title) {
      const titleClean = document.title
        .replace(/\s*\|\s*Messenger.*$/i, '')
        .replace(/^\(\d+\)\s*/, '')
        .trim();
      if (titleClean && titleClean.length < 40 && !/(?:messenger|chat)/i.test(titleClean)) {
        return titleClean;
      }
    }
  } catch(e) {}
  return '';
}

function getSidebarSenderName(row) {
  try {
    if (!row) return '';
    const aria = row.getAttribute('aria-label') || '';
    
    // Khớp mẫu "Đoạn chat với Nguyễn Tuấn..." hoặc "Chat with Nguyễn Tuấn..."
    const ariaMatch = aria.match(/(?:đoạn chat với|chat with|cuộc trò chuyện với)\s+([^,;:\n\r]+)/i);
    if (ariaMatch && ariaMatch[1]) {
      const candidate = ariaMatch[1].trim();
      if (candidate && candidate.length < 40 && !isOutgoingSidebarText(candidate)) {
        return candidate;
      }
    }

    // Thử lấy phần tử tên đầu tiên trong row
    const nameEl = row.querySelector('span[dir="auto"], div[dir="auto"]');
    if (nameEl) {
      const nameText = (nameEl.textContent || '').trim();
      if (nameText && nameText.length < 40 && !isOutgoingSidebarText(nameText)) {
        return nameText;
      }
    }

    // Thử lấy dòng đầu tiên của textContent
    const fullText = (row.textContent || '').trim();
    const firstLine = fullText.split(/[\r\n]+/)[0]?.trim();
    if (firstLine && firstLine.length < 40 && !isOutgoingSidebarText(firstLine)) {
      return firstLine;
    }
  } catch(e) {}
  return '';
}

function isSidebarRowUnread(row) {
  try {
    if (!row) return false;

    const rowRect = row.getBoundingClientRect();
    if (!rowRect || rowRect.width <= 0 || rowRect.height <= 0) return false;

    // ----------------------------------------------------------------------
    // 1. KIỂM TRA CHẤM TRÒN XANH (BLUE UNREAD DOT) TRÊN THẺ DANH BẠ
    // ----------------------------------------------------------------------
    const allDescendants = row.querySelectorAll('div, span, svg, circle, path, i');
    for (let i = 0; i < allDescendants.length; i++) {
      const el = allDescendants[i];
      const aria = (el.getAttribute('aria-label') || '');
      if (/(?:chưa đọc|unread|tin nhắn mới|new message)/i.test(aria)) {
        return true;
      }

      // Kiểm tra màu nền computed backgroundColor
      const cs = window.getComputedStyle(el);
      const bg = cs.backgroundColor || '';
      const rgb = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?/);
      if (rgb) {
        const r = parseInt(rgb[1], 10);
        const g = parseInt(rgb[2], 10);
        const b = parseInt(rgb[3], 10);
        const a = rgb[4] !== undefined ? parseFloat(rgb[4]) : 1;
        // Nhận diện màu xanh dương chuẩn Facebook/Messenger (VD: rgb(0, 132, 255), rgb(24, 119, 242), rgb(0, 149, 246))
        if (a > 0.5 && b >= 140 && b > r + 30 && b > g + 10) {
          const rect = el.getBoundingClientRect();
          // Chấm tròn nằm ở nửa bên phải của thẻ danh bạ và có kích thước nhỏ
          if (rect.width >= 4 && rect.width <= 30 && rect.height >= 4 && rect.height <= 30) {
            if (rect.left >= rowRect.left + rowRect.width * 0.4) {
              return true;
            }
          }
        }
      }

      // Kiểm tra SVG fill/stroke xanh dương
      const fill = cs.fill || '';
      const svgRgb = fill.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (svgRgb) {
        const r = parseInt(svgRgb[1], 10);
        const g = parseInt(svgRgb[2], 10);
        const b = parseInt(svgRgb[3], 10);
        if (b >= 140 && b > r + 30 && b > g + 10) {
          const rect = el.getBoundingClientRect();
          if (rect.width >= 4 && rect.width <= 30 && rect.height >= 4 && rect.height <= 30) {
            return true;
          }
        }
      }
    }

    // ----------------------------------------------------------------------
    // 2. KIỂM TRA CHỮ ĐEN ĐẬM CỦA ĐOẠN TIN NHẮN (SNIPPET)
    // ----------------------------------------------------------------------
    const senderName = (getSidebarSenderName(row) || '').trim().toLowerCase();
    const allTextNodes = row.querySelectorAll('span, strong, b, div[dir="auto"], p');

    for (let i = 0; i < allTextNodes.length; i++) {
      const node = allTextNodes[i];
      if (!node) continue;
      // Bỏ qua các container bọc ngoài lớn
      if (node.children.length > 2) continue;

      const text = (node.textContent || '').trim();
      if (!text || text.length < 1) continue;

      // BỎ QUA nếu node này là Tên người gửi / Tên nhóm
      if (senderName && (text.toLowerCase() === senderName || senderName.includes(text.toLowerCase()))) {
        continue;
      }

      // BỎ QUA nếu node là nhãn thời gian hoặc dấu chấm (VD: "· 1 phút", "12:30", "vừa xong")
      if (/^[·•\s]*(?:\d+\s*(?:phút|giờ|ngày|tuần|tháng|năm|m|h|d|w|min|mins|hr|hrs|s|giây)|vừa xong|just now|yesterday|hôm qua|hôm nay)/i.test(text) || /^[\s·•.-]+$/.test(text)) {
        continue;
      }

      // BỎ QUA nếu vị trí của node nằm ở nửa trên (khu vực tên người gửi) và không có ký hiệu tin nhắn
      const nodeRect = node.getBoundingClientRect();
      if (nodeRect && nodeRect.top < rowRect.top + rowRect.height * 0.35 && !text.includes('·') && !text.includes(':')) {
        continue;
      }

      const cs = window.getComputedStyle(node);
      const fw = parseInt(cs.fontWeight, 10) || (cs.fontWeight === 'bold' ? 700 : (cs.fontWeight === 'bolder' ? 800 : 400));

      // Phân tích màu sắc RGB
      let isDarkColor = false;
      const colorMatch = (cs.color || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (colorMatch) {
        const r = parseInt(colorMatch[1], 10);
        const g = parseInt(colorMatch[2], 10);
        const b = parseInt(colorMatch[3], 10);
        
        // Màu đen đặc chuẩn (#000000 / rgb(5,5,5) / rgb(0,0,0) - r,g,b <= 50)
        if (r <= 50 && g <= 50 && b <= 50) {
          isDarkColor = true;
        }
        // Trường hợp dark mode (chữ trắng đậm unread)
        if (r >= 220 && g >= 220 && b >= 220) {
          isDarkColor = true;
        }
      }

      // Tin nhắn mới: chữ in đậm (fontWeight >= 600) VÀ màu chữ đen đặc
      // Tin nhắn cũ: nét thường (fontWeight 400) hoặc màu xám (r,g,b > 75)
      if ((fw >= 600 && isDarkColor) || node.tagName === 'STRONG' || node.tagName === 'B') {
        return true;
      }
    }
  } catch(e) {}
  return false;
}

function getSidebarMessageSnippet(row, senderName) {
  try {
    if (!row) return '';
    const textNodes = row.querySelectorAll('span, strong, b, div[dir="auto"]');
    for (let i = 0; i < textNodes.length; i++) {
      const node = textNodes[i];
      if (!node || node.children.length > 1) continue;
      const t = (node.textContent || '').trim();
      if (!t || t.length < 1) continue;
      if (senderName && (t.toLowerCase() === senderName.toLowerCase() || senderName.toLowerCase().includes(t.toLowerCase()))) {
        continue;
      }
      if (/^[·•\s]*(?:\d+\s*(?:phút|giờ|ngày|tuần|tháng|năm|m|h|d|w|min|mins|hr|hrs)|vừa xong|just now)/i.test(t) || /^[\s·•.-]+$/.test(t)) {
        continue;
      }
      // BỎ QUA nếu là lệnh của Tool 7 (Web) hoặc tin nhắn gửi đi
      if (isTool7CommandText(t) || isOutgoingSidebarText(t)) {
        continue;
      }
      return t;
    }
  } catch(e) {}
  return '';
}

function removeVietnameseTones(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function isContactBlacklisted(text, blacklistStr) {
  const blacklist = blacklistStr || tool2BlacklistConfig;
  if (!text || !blacklist) return false;

  const rawKeywords = blacklist
    .split(/[\r\n,;]+/)
    .map(k => k.trim())
    .filter(k => k.length > 0);

  if (rawKeywords.length === 0) return false;

  const targetLower = text.toLowerCase();
  const targetNoAccent = removeVietnameseTones(text).toLowerCase();
  const targetCompact = targetNoAccent.replace(/[^a-z0-9]/g, '');

  for (const rawKey of rawKeywords) {
    const keyLower = rawKey.toLowerCase();
    const keyNoAccent = removeVietnameseTones(rawKey).toLowerCase();
    const keyCompact = keyNoAccent.replace(/[^a-z0-9]/g, '');

    if (!keyCompact && !keyLower) continue;

    // 1. Khớp theo chuỗi con thường và không dấu (VD: "Người lạ", "Shop bán hàng")
    if (targetLower.includes(keyLower) || targetNoAccent.includes(keyNoAccent)) {
      return true;
    }

    // 2. Nhận diện thông minh nén ký tự (VD: "GCC" khớp "Gcc", "gcc", "G c C", "G.C.C", "G - C - C", "[GCC] Gen 2 + 3")
    if (keyCompact.length >= 2 && targetCompact.includes(keyCompact)) {
      return true;
    }

    // 3. Khớp từ đơn nếu độ dài 1 ký tự
    if (keyLower.length === 1) {
      const regex = new RegExp(`(?:^|[^a-z0-9])${keyLower}(?:$|[^a-z0-9])`, 'i');
      if (regex.test(targetLower)) return true;
    }
  }

  return false;
}

function findAndClickSidebarContact(threadId, senderName, targetContent) {
  try {
    if (isContactBlacklisted(senderName) || isContactBlacklisted(targetContent)) {
      console.log(`[Tool 2 Preload] 🚫 Thẻ danh bạ [${senderName}] nằm trong Blacklist, bỏ qua click.`);
      return false;
    }

    const rows = document.querySelectorAll(
      '[role="navigation"] [role="row"], ' +
      '[role="grid"] [role="row"], ' +
      '[aria-label*="chat" i] [role="row"], ' +
      '[aria-label*="đoạn chat" i] [role="row"], ' +
      'a[href*="/t/"]'
    );

    let matchedRow = null;

    // Ưu tiên 1: Khớp chính xác theo URL hoặc threadId
    if (threadId && threadId !== 'active_chat' && threadId.length > 3) {
      for (const row of rows) {
        const link = row.querySelector(`a[href*="/t/${threadId}"]`) || (row.tagName === 'A' && row.href && row.href.includes(`/t/${threadId}`) ? row : null);
        if (link || (row.innerHTML && row.innerHTML.includes(threadId))) {
          matchedRow = row;
          break;
        }
      }
    }

    // Ưu tiên 2: Khớp theo Tên người gửi (senderName)
    if (!matchedRow && senderName && senderName.trim().length >= 2) {
      const cleanName = senderName.trim().toLowerCase();
      for (const row of rows) {
        const rowText = (row.textContent || '').toLowerCase();
        const ariaText = (row.getAttribute('aria-label') || '').toLowerCase();
        if (rowText.includes(cleanName) || ariaText.includes(cleanName)) {
          matchedRow = row;
          break;
        }
      }
    }

    // Ưu tiên 3: Khớp theo nội dung tin nhắn đầu vào
    if (!matchedRow && targetContent && targetContent.trim().length >= 3) {
      const cleanTarget = targetContent.trim().toLowerCase().slice(0, 20);
      for (const row of rows) {
        const rowText = (row.textContent || '').toLowerCase();
        if (rowText.includes(cleanTarget)) {
          matchedRow = row;
          break;
        }
      }
    }

    if (matchedRow) {
      const clickTarget = matchedRow.querySelector('a') || matchedRow;
      clickTarget.click();
      clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    }
  } catch(e) {
    console.error('[Tool 2 Preload] Lỗi khi định vị danh bạ:', e);
  }
  return false;
}

async function scanAndExecuteTool2Commands() {
  if (!isTool2Enabled || isProcessingTool2) return;
  if (contactSensorLimit <= 0) return; // Mức 0: Cảm biến tắt hoàn toàn (0 thẻ) -> Tuyệt đối không quét và không cấp input cho AI

  // ========================================================================
  // LÕI XỬ LÝ DUY NHẤT: CHỈ QUÉT DUY NHẤT DOM TIN NHẮN TRÊN THẺ DANH BẠ (SIDEBAR)
  // TUYỆT ĐỐI KHÔNG NẠP BẤT KỲ DOM TIN NHẮN NÀO TRONG KHUNG CHAT / ĐOẠN CHAT
  // ========================================================================
  const topCards = scanTop7ContactCards();
  if (!topCards || topCards.length === 0) return;

  for (let cIdx = 0; cIdx < topCards.length; cIdx++) {
    const row = topCards[cIdx].el;
    if (!row || typeof row.getBoundingClientRect !== 'function') continue;

    // BƯỚC 1: PHÂN BIỆT TIN NHẮN MỚI VS TIN NHẮN CŨ
    // NẾU LÀ TIN NHẮN CŨ (NÉT THƯỜNG, MÀU CHỮ XÁM KHÔNG ĐEN ĐẶC) -> LOẠI BỎ NGAY 100%
    if (!isSidebarRowUnread(row)) {
      continue;
    }

    // BƯỚC 2: QUA ẢI -> ĐƯA ĐẾN LUỒNG CHECK ĐIỀU KIỆN TIẾP THEO
    const fullRowText = (row.textContent || row.innerText || '') + ' ' + (row.getAttribute('aria-label') || '');
    if (!fullRowText || !fullRowText.trim()) continue;

    // Trích xuất thread ID hoặc URL từ thẻ danh bạ
    const linkEl = row.querySelector('a[href*="/t/"]') || (row.tagName === 'A' ? row : null);
    const threadUrl = linkEl ? linkEl.href : '';
    const threadIdMatch = threadUrl.match(/\/t\/([a-zA-Z0-9_-]+)/);
    const threadId = threadIdMatch ? threadIdMatch[1] : (row.getAttribute('data-id') || fullRowText.slice(0, 25));

    const sidebarSenderName = getSidebarSenderName(row);

    // 1. KIỂM TRA BLACKLIST: NẾU TÊN HOẶC NỘI DUNG BỊ CHẶN -> BỎ QUA NGAY
    if (isContactBlacklisted(sidebarSenderName) || isContactBlacklisted(fullRowText) || isContactBlacklisted(threadId)) {
      continue;
    }

    // 2. BỎ QUA NẾU LÀ LỆNH DUYỆT WEB TOOL 7
    if (isTool7CommandText(fullRowText)) {
      continue;
    }

    // 3. PHÂN TÍCH CÓ PHẢI LỆNH TOOL 2 (/ai, /help, /model, /delete, /star, /stop)
    let parsedCmd = parseTool2CommandFromText(fullRowText);

    // 4. NẾU KHÔNG CÓ LỆNH CỤ THỂ, KIỂM TRA CHẾ ĐỘ TỰ ĐỘNG (/star HOẶC /start)
    if (!parsedCmd) {
      // Nếu là tin nhắn do chính mình / AI vừa gửi ("Bạn:", "You:", "Đang gửi...") -> BỎ QUA 100%
      if (isOutgoingSidebarText(fullRowText)) {
        continue;
      }

      let isAutoReadRow = false;
      try {
        isAutoReadRow = await ipcRenderer.invoke('is-thread-auto-read', threadId);
      } catch(e) {}

      if (isAutoReadRow) {
        const cleanSnippet = getSidebarMessageSnippet(row, sidebarSenderName);
        if (isTool7CommandText(cleanSnippet) || isOutgoingSidebarText(cleanSnippet)) {
          continue;
        }

        if (cleanSnippet && cleanSnippet.length >= 1 && !isTool2CommandProcessed(threadId, 'ai', cleanSnippet)) {
          parsedCmd = { command: 'ai', text: cleanSnippet };
        }
      }
    }

    // 5. NẾU CÓ LỆNH TOOL 2 HOẶC TIN NHẮN TỰ ĐỘNG CẦN XỬ LÝ
    if (parsedCmd && parsedCmd.text !== undefined) {
      // Nếu là tin nhắn tự động từ /start mà lại dính từ khóa gửi đi -> BỎ QUA
      if (isOutgoingSidebarText(parsedCmd.text)) {
        continue;
      }

      // Kiểm tra trùng lặp (Deduplication)
      if (isTool2CommandProcessed(threadId, parsedCmd.command, parsedCmd.text)) {
        continue;
      }

      // Đánh dấu đã xử lý ngay lập tức trên Cache
      markTool2CommandProcessed(threadId, parsedCmd.command, parsedCmd.text);

      const previewSnippet = parsedCmd.text;
      console.log(`[Tool 2 Preload] 🤖 PHÁT HIỆN TỪ THẺ DANH BẠ [${sidebarSenderName || 'Ẩn danh'}]: (/${parsedCmd.command}):`, parsedCmd);

      isProcessingTool2 = true;
      const safetyUnlockTimer = setTimeout(() => { isProcessingTool2 = false; }, 15000);

      // CLICK CHUỘT VÀO THẺ DANH BẠ ĐỂ KÍCH HOẠT CUỘC TRÒ CHUYỆN
      const clickTarget = row.querySelector('a') || row;
      try {
        clickTarget.click();
        clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      } catch(e) {}

      // Chuẩn bị nội dung gửi Gemini: Lấy trực tiếp từ DOM Thẻ Danh Bạ (TUYỆT ĐỐI KHÔNG quét khung chat!)
      let promptToSend = parsedCmd.text;
      if (parsedCmd.command === 'ai') {
        promptToSend = sidebarSenderName ? `(${sidebarSenderName})/ai ${parsedCmd.text || ''}` : `/ai ${parsedCmd.text || ''}`;
      }

      // Kiểm tra chặn nếu promptToSend dính từ khóa gửi đi
      if (isOutgoingSidebarText(promptToSend)) {
        console.log('[Tool 2 Preload] 🚫 Chặn do phát hiện từ khóa gửi đi:', promptToSend);
        clearTimeout(safetyUnlockTimer);
        isProcessingTool2 = false;
        return;
      }

      ipcRenderer.send('tool2-status-update', {
        text: `🔄 Đang gửi tới Google Gemini xử lý (${sidebarSenderName ? sidebarSenderName + ' - ' : ''}/${parsedCmd.command})...`,
        level: 'processing'
      });

      (async () => {
        try {
          const result = await ipcRenderer.invoke('tool2-process-gemini-message', {
            command: parsedCmd.command,
            text: promptToSend,
            threadId: threadId
          });

          if (result && result.success && result.reply) {
            console.log('[Tool 2 Preload] 📥 Nhận phản hồi từ Gemini, đang gửi vào tin nhắn...');
            markTool2CommandProcessed(threadId, 'ai', result.reply);

            ipcRenderer.send('tool2-status-update', {
              text: `🎯 Định vị thẻ danh bạ [${sidebarSenderName || 'Người gửi'}] và gửi phản hồi...`,
              level: 'processing'
            });

            // Đảm bảo click đúng thẻ danh bạ trước khi gửi
            findAndClickSidebarContact(threadId, sidebarSenderName, previewSnippet);
            await new Promise(r => setTimeout(r, 180));

            ipcRenderer.send('tool2-status-update', {
              text: `🚀 Đang dán và gửi phản hồi AI cho [${sidebarSenderName || 'Người gửi'}]...`,
              level: 'processing'
            });

            await ipcRenderer.invoke('tool2-paste-and-send-text', {
              text: result.reply,
              messengerWebContentsId: null
            });

            ipcRenderer.send('tool2-status-update', {
              text: `✅ Đã gửi phản hồi AI cho [${sidebarSenderName || 'Người gửi'}] thành công!`,
              level: 'success'
            });

            setTimeout(() => {
              ipcRenderer.send('tool2-status-update', {
                text: `⚡ Sẵn sàng nhận tin nhắn & lệnh AI...`,
                level: 'info'
              });
            }, 4000);
          } else if (result && result.reply) {
            findAndClickSidebarContact(threadId, sidebarSenderName, previewSnippet);
            await new Promise(r => setTimeout(r, 180));
            await ipcRenderer.invoke('tool2-paste-and-send-text', {
              text: result.reply,
              messengerWebContentsId: null
            });
          }
        } catch(err) {
          console.error('[Tool 2 Preload] Lỗi xử lý Gemini:', err);
          ipcRenderer.send('tool2-status-update', {
            text: `❌ Lỗi xử lý Gemini: ${err.message}`,
            level: 'error'
          });
          setTimeout(() => {
            ipcRenderer.send('tool2-status-update', {
              text: `⚡ Sẵn sàng nhận tin nhắn & lệnh AI...`,
              level: 'info'
            });
          }, 6000);
        } finally {
          clearTimeout(safetyUnlockTimer);
          setTimeout(() => { isProcessingTool2 = false; }, 800);
        }
      })();

      break; // Dừng vòng lặp sau khi tìm thấy và xử lý 1 thẻ danh bạ
    }
  }
}

// Lắng nghe sự kiện DOM thay đổi (MutationObserver) để phản ứng ngay khi có tin nhắn mới trên thẻ danh bạ
let domObserver = null;
let observerDebounceTimer = null;
function setupMessengerDomObserver() {
  if (domObserver || !document.body) return;
  try {
    domObserver = new MutationObserver(() => {
      if (observerDebounceTimer) clearTimeout(observerDebounceTimer);
      observerDebounceTimer = setTimeout(() => {
        scanAndExecuteWebInMessCommands();
        scanAndExecuteTool2Commands();
      }, 80);
    });
    domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'class', 'style']
    });
    console.log('[Messenger Preload] ⚡ Đã kích hoạt MutationObserver bắt sự kiện tin nhắn thẻ danh bạ 24/24.');
  } catch(e) {}
}

// Chạy vòng lặp quét
setInterval(renderNeonPills, 60);
setInterval(scanAndExecuteWebInMessCommands, 250);
setInterval(scanAndExecuteTool2Commands, 250);

window.addEventListener('DOMContentLoaded', () => {
  ensureOverlayLayer();
  renderNeonPills();
  setupMessengerDomObserver();
  window.addEventListener('scroll', renderNeonPills, { passive: true });
  window.addEventListener('resize', renderNeonPills, { passive: true });
  setTimeout(() => {
    // Khởi tạo: Ghi nhớ các tin nhắn đã đọc sẵn có trên thẻ danh bạ để không kích hoạt tin cũ
    try {
      const topCards = scanTop7ContactCards();
      for (const card of topCards) {
        const row = card.el;
        if (!row) continue;
        const linkEl = row.querySelector('a[href*="/t/"]') || (row.tagName === 'A' ? row : null);
        const threadUrl = linkEl ? linkEl.href : '';
        const threadIdMatch = threadUrl.match(/\/t\/([a-zA-Z0-9_-]+)/);
        const fullRowText = (row.textContent || row.innerText || '') + ' ' + (row.getAttribute('aria-label') || '');
        const threadId = threadIdMatch ? threadIdMatch[1] : fullRowText.slice(0, 25);
        const senderName = getSidebarSenderName(row);
        const snippet = getSidebarMessageSnippet(row, senderName);
        const isUnread = isSidebarRowUnread(row);
        if (!isUnread && snippet) {
          markTool2CommandProcessed(threadId, 'ai', snippet);
        }
        if (!isUnread) {
          const parsed = parseTool2CommandFromText(fullRowText);
          if (parsed) {
            markTool2CommandProcessed(threadId, parsed.command, parsed.text);
          }
        }
      }
    } catch(e) {}
    setupMessengerDomObserver();
  }, 500);
});