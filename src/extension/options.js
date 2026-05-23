const STORAGE_ENABLED = 'rmLiveEnabled';
const STORAGE_URL_MODE = 'rmLiveUrlMode';
const STORAGE_CUSTOM_URLS = 'rmLiveCustomUrls';
const STORAGE_CUSTOM_URL = 'rmLiveCustomUrl';

const toggle = document.getElementById('toggle-enabled');
const badge = document.getElementById('status-badge');
const radios = document.querySelectorAll('input[name="url-mode"]');
const customSection = document.getElementById('custom-section');
const urlListEl = document.getElementById('url-list');
const addUrlBtn = document.getElementById('btn-add-url');
const saveIndicator = document.getElementById('save-indicator');

let customUrls = [];
let activeCustomUrl = '';

// ── Load ────────────────────────────────────────────────────────────────────
chrome.storage.local.get([STORAGE_ENABLED, STORAGE_URL_MODE, STORAGE_CUSTOM_URLS, STORAGE_CUSTOM_URL], (result) => {
  const enabled = result[STORAGE_ENABLED] !== false;
  toggle.checked = enabled;
  updateBadge(enabled);

  const mode = result[STORAGE_URL_MODE] ?? 'builtin';
  setMode(mode, false);

  customUrls = Array.isArray(result[STORAGE_CUSTOM_URLS]) ? result[STORAGE_CUSTOM_URLS] : [];
  activeCustomUrl = typeof result[STORAGE_CUSTOM_URL] === 'string' ? result[STORAGE_CUSTOM_URL] : '';
  renderList();
});

// ── Enable toggle ────────────────────────────────────────────────────────────
toggle.addEventListener('change', () => {
  chrome.storage.local.set({ [STORAGE_ENABLED]: toggle.checked });
  updateBadge(toggle.checked);
  flashSaved();
});

// ── URL mode radios ──────────────────────────────────────────────────────────
radios.forEach((radio) => {
  radio.addEventListener('change', () => {
    if (radio.checked) setMode(radio.value, true);
  });
});

function setMode(mode, save) {
  radios.forEach((r) => { r.checked = r.value === mode; });
  customSection.classList.toggle('visible', mode === 'custom');
  if (save) {
    chrome.storage.local.set({ [STORAGE_URL_MODE]: mode });
    flashSaved();
  }
}

// ── URL list rendering ───────────────────────────────────────────────────────
function renderList() {
  urlListEl.innerHTML = '';
  if (customUrls.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'url-list-empty';
    empty.textContent = '暂无自定义 URL，点击「添加」按钮新增';
    urlListEl.appendChild(empty);
    return;
  }
  customUrls.forEach((item) => urlListEl.appendChild(buildRow(item)));
}

function buildRow(item) {
  const row = document.createElement('div');
  row.className = 'url-item' + (item.url === activeCustomUrl ? ' active' : '');
  row.dataset.id = item.id;
  row.innerHTML = `
    <div class="url-dot-wrap"><div class="url-dot"></div></div>
    <div class="url-item-body">
      <div class="url-item-label">${esc(item.label || item.url)}</div>
      ${item.label ? `<div class="url-item-url">${esc(item.url)}</div>` : ''}
    </div>
    <div class="url-item-actions">
      <button class="btn-icon btn-edit" title="编辑">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="btn-icon btn-delete" title="删除">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      </button>
    </div>
  `;

  const selectArea = row.querySelector('.url-dot-wrap');
  const bodyArea = row.querySelector('.url-item-body');
  [selectArea, bodyArea].forEach((el) => el.addEventListener('click', () => activateUrl(item)));
  row.querySelector('.btn-edit').addEventListener('click', (e) => { e.stopPropagation(); openEdit(item, row, false); });
  row.querySelector('.btn-delete').addEventListener('click', (e) => { e.stopPropagation(); deleteUrl(item.id); });
  return row;
}

function activateUrl(item) {
  activeCustomUrl = item.url;
  chrome.storage.local.set({ [STORAGE_CUSTOM_URL]: item.url, [STORAGE_URL_MODE]: 'custom' });
  setMode('custom', false);
  persistUrls();
  renderList();
  flashSaved();
}

function deleteUrl(id) {
  customUrls = customUrls.filter((u) => u.id !== id);
  if (activeCustomUrl && !customUrls.find((u) => u.url === activeCustomUrl)) {
    activeCustomUrl = customUrls[0]?.url ?? '';
    chrome.storage.local.set({ [STORAGE_CUSTOM_URL]: activeCustomUrl });
  }
  persistUrls();
  renderList();
  flashSaved();
}

// ── Inline edit form ─────────────────────────────────────────────────────────
function openEdit(item, row, isNew) {
  row.className = 'url-item editing';
  row.innerHTML = `
    <div class="url-edit-inputs">
      <input class="url-edit-input" placeholder="名称（选填）" value="${esc(item.label ?? '')}" autocomplete="off" />
      <input class="url-edit-input mono" type="url" placeholder="https://your-rmlive-instance.example.com" value="${esc(item.url ?? '')}" autocomplete="off" spellcheck="false" />
      <div class="url-edit-hint"></div>
    </div>
    <div class="url-edit-btns">
      <button class="btn-save">保存</button>
      <button class="btn-cancel">取消</button>
    </div>
  `;

  const [labelInput, urlInput] = row.querySelectorAll('.url-edit-input');
  const hintEl = row.querySelector('.url-edit-hint');
  urlInput.focus();

  row.querySelector('.btn-save').addEventListener('click', () => {
    const url = urlInput.value.trim();
    const label = labelInput.value.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      hintEl.textContent = '地址必须以 https:// 或 http:// 开头';
      hintEl.className = 'url-edit-hint error';
      urlInput.focus();
      return;
    }
    item.url = url;
    item.label = label;
    if (isNew) {
      item.id = genId();
      customUrls.push(item);
    }
    if (!activeCustomUrl) {
      activeCustomUrl = url;
      chrome.storage.local.set({ [STORAGE_CUSTOM_URL]: url });
    }
    persistUrls();
    renderList();
    flashSaved();
  });

  [labelInput, urlInput].forEach((inp) => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') row.querySelector('.btn-save').click();
      if (e.key === 'Escape') row.querySelector('.btn-cancel').click();
    });
  });

  row.querySelector('.btn-cancel').addEventListener('click', () => {
    if (isNew) row.remove();
    else renderList();
  });
}

addUrlBtn.addEventListener('click', () => {
  const newItem = { id: '', label: '', url: '' };
  const row = document.createElement('div');
  urlListEl.appendChild(row);
  openEdit(newItem, row, true);
  row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function persistUrls() {
  chrome.storage.local.set({ [STORAGE_CUSTOM_URLS]: customUrls });
}

let flashTimer = null;
function flashSaved() {
  saveIndicator.textContent = '已保存 ✓';
  saveIndicator.style.opacity = '1';
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { saveIndicator.style.opacity = '0'; }, 1600);
}

function updateBadge(enabled) {
  badge.textContent = enabled ? '已启用' : '已禁用';
  badge.className = 'status-badge' + (enabled ? '' : ' off');
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Cross-page sync ───────────────────────────────────────────────────────────
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  let needRender = false;

  if ('rmLiveEnabled' in changes) {
    const enabled = changes['rmLiveEnabled'].newValue !== false;
    toggle.checked = enabled;
    updateBadge(enabled);
  }
  if ('rmLiveUrlMode' in changes) {
    setMode(changes['rmLiveUrlMode'].newValue ?? 'builtin', false);
  }
  if ('rmLiveCustomUrls' in changes) {
    customUrls = Array.isArray(changes['rmLiveCustomUrls'].newValue)
      ? changes['rmLiveCustomUrls'].newValue
      : [];
    needRender = true;
  }
  if ('rmLiveCustomUrl' in changes) {
    activeCustomUrl = changes['rmLiveCustomUrl'].newValue ?? '';
    needRender = true;
  }
  if (needRender) {
    // Only re-render rows that are not currently being edited
    const editing = urlListEl.querySelector('.url-item.editing');
    if (!editing) renderList();
  }
});
