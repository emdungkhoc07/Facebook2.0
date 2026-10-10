const { ipcRenderer } = require('electron');

let isTabActive = false;

function isLivePage() {
  try {
    return window.location.href.includes('/live') || !!document.querySelector('[data-e2e="live-player"], [data-e2e="live-room"]');
  } catch(e) {
    return false;
  }
}

function pauseAllMedia() {
  if (isTabActive) return; // Tuyệt đối không dừng khi người dùng đang ở tab TikTok
  try {
    const mediaElements = document.querySelectorAll('video, audio');
    mediaElements.forEach(el => {
      try {
        if (!el.paused) {
          el.pause();
        }
      } catch(e) {}
    });
  } catch(e) {}
}

function resumeActiveLiveMedia() {
  if (!isTabActive) return;
  try {
    if (isLivePage()) {
      const mediaElements = document.querySelectorAll('video');
      mediaElements.forEach(el => {
        try {
          if (el.paused) el.play().catch(() => {});
        } catch(e) {}
      });
    }
  } catch(e) {}
}

// Lắng nghe cập nhật trạng thái Tab Active từ renderer chính
ipcRenderer.on('tiktok-tab-state', (event, active) => {
  isTabActive = !!active;
  if (!isTabActive) {
    pauseAllMedia();
  } else {
    resumeActiveLiveMedia();
  }
});

// Chặn sự kiện play CHỈ KHI tab KHÔNG active và KHÔNG PHẢI là người dùng đang xem
document.addEventListener('play', (e) => {
  if (!isTabActive && e.target && (e.target.tagName === 'VIDEO' || e.target.tagName === 'AUDIO')) {
    try {
      e.target.pause();
    } catch(err) {}
  }
}, true);

// Theo dõi DOM khi chạy ngầm
const observer = new MutationObserver(() => {
  if (!isTabActive) {
    pauseAllMedia();
  }
});

if (document.documentElement) {
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    if (!isTabActive) pauseAllMedia();
  });
}
