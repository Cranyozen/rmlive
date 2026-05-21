const STORAGE_KEY = 'rmLiveEnabled';
const toggle = document.getElementById('toggle-enabled');
const badge = document.getElementById('status-badge');

function updateBadge(enabled) {
  if (enabled) {
    badge.textContent = '已启用';
    badge.className = 'status-badge';
  } else {
    badge.textContent = '已禁用';
    badge.className = 'status-badge off';
  }
}

chrome.storage.local.get([STORAGE_KEY], (result) => {
  const enabled = result[STORAGE_KEY] !== false;
  toggle.checked = enabled;
  updateBadge(enabled);
});

toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  chrome.storage.local.set({ [STORAGE_KEY]: enabled });
  updateBadge(enabled);
});
