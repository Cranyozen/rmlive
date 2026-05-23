const toggle = document.getElementById('toggle-enabled');
const hint = document.getElementById('hint');
const urlModeSelect = document.getElementById('url-mode-select');
const customUrlWrap = document.getElementById('custom-url-wrap');

let customUrls = [];
let activeCustomUrl = '';

// ── Load ─────────────────────────────────────────────────────────────────────
chrome.storage.local.get(['rmLiveEnabled', 'rmLiveUrlMode', 'rmLiveCustomUrls', 'rmLiveCustomUrl'], (result) => {
  toggle.checked = result['rmLiveEnabled'] !== false;

  const mode = result['rmLiveUrlMode'] || 'builtin';
  urlModeSelect.value = mode;

  customUrls = Array.isArray(result['rmLiveCustomUrls']) ? result['rmLiveCustomUrls'] : [];
  activeCustomUrl = typeof result['rmLiveCustomUrl'] === 'string' ? result['rmLiveCustomUrl'] : '';

  renderCustomSection(mode);
});

// ── Enable toggle ─────────────────────────────────────────────────────────────
toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  chrome.storage.local.set({ rmLiveEnabled: enabled }, () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.id && tab.url && /https:\/\/www\.robomaster\.com\/([\w-]+\/)?live/.test(tab.url)) {
        chrome.tabs.reload(tab.id);
        window.close();
        return;
      }
      showHint(enabled ? '已启用，刷新页面后生效' : '已禁用，刷新页面后生效', enabled);
    });
  });
});

// ── URL mode selector ─────────────────────────────────────────────────────────
urlModeSelect.addEventListener('change', () => {
  const mode = urlModeSelect.value;
  chrome.storage.local.set({ rmLiveUrlMode: mode });
  renderCustomSection(mode);
  if (mode !== 'custom') {
    showHint('来源已切换，刷新页面后生效', true);
  }
});

// ── Custom URL section ────────────────────────────────────────────────────────
function renderCustomSection(mode) {
  customUrlWrap.className = 'custom-url-wrap' + (mode === 'custom' ? ' visible' : '');
  customUrlWrap.innerHTML = '';

  if (mode !== 'custom') return;

  if (customUrls.length === 0) {
    customUrlWrap.innerHTML = `
      <div class="custom-url-empty">尚无自定义 URL，请前往设置页添加。</div>
      <button class="btn-manage" id="btn-goto-options">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
        </svg>
        前往设置添加 URL
      </button>
    `;
    document.getElementById('btn-goto-options').addEventListener('click', openOptions);
    return;
  }

  // URL select dropdown
  const sel = document.createElement('select');
  sel.className = 'custom-url-select';
  customUrls.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item.url;
    opt.textContent = item.label ? `${item.label}  (${item.url})` : item.url;
    opt.selected = item.url === activeCustomUrl;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    activeCustomUrl = sel.value;
    chrome.storage.local.set({ rmLiveCustomUrl: sel.value, rmLiveUrlMode: 'custom' });
    showHint('已切换，刷新页面后生效', true);
  });
  customUrlWrap.appendChild(sel);

  // Manage link
  const manageBtn = document.createElement('button');
  manageBtn.className = 'btn-manage';
  manageBtn.innerHTML = `
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
    管理 URL 列表
  `;
  manageBtn.style.marginTop = '5px';
  manageBtn.addEventListener('click', openOptions);
  customUrlWrap.appendChild(manageBtn);
}

function openOptions() {
  chrome.runtime.openOptionsPage();
  window.close();
}

// ── Open page button ──────────────────────────────────────────────────────────
document.getElementById('btn-open').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
  window.close();
});

document.getElementById('btn-settings').addEventListener('click', openOptions);

// ── Helpers ───────────────────────────────────────────────────────────────────
function showHint(text, success) {
  hint.textContent = text;
  hint.className = 'footer-hint' + (success ? ' visible' : '');
  setTimeout(() => {
    hint.textContent = '刷新 RoboMaster 页面后生效';
    hint.className = 'footer-hint';
  }, 2000);
}

// ── Cross-page sync ───────────────────────────────────────────────────────────
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  let rerender = false;

  if ('rmLiveEnabled' in changes) {
    toggle.checked = changes['rmLiveEnabled'].newValue !== false;
  }
  if ('rmLiveUrlMode' in changes) {
    const mode = changes['rmLiveUrlMode'].newValue ?? 'builtin';
    urlModeSelect.value = mode;
    rerender = true;
  }
  if ('rmLiveCustomUrls' in changes) {
    customUrls = Array.isArray(changes['rmLiveCustomUrls'].newValue)
      ? changes['rmLiveCustomUrls'].newValue
      : [];
    rerender = true;
  }
  if ('rmLiveCustomUrl' in changes) {
    activeCustomUrl = changes['rmLiveCustomUrl'].newValue ?? '';
    rerender = true;
  }
  if (rerender) renderCustomSection(urlModeSelect.value);
});

