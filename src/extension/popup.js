const STORAGE_KEY = 'rmLiveEnabled';
const toggle = document.getElementById('toggle-enabled');
const hint = document.getElementById('hint');

chrome.storage.local.get([STORAGE_KEY], (result) => {
  toggle.checked = result[STORAGE_KEY] !== false;
});

toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  chrome.storage.local.set({ [STORAGE_KEY]: enabled }, () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.id && tab.url && /https:\/\/www\.robomaster\.com\/([\w-]+\/)?live/.test(tab.url)) {
        chrome.tabs.reload(tab.id);
        window.close();
        return;
      }
      showHint(enabled);
    });
  });
});

function showHint(enabled) {
  hint.textContent = enabled ? '已启用，刷新页面后生效' : '已禁用，刷新页面后生效';
  hint.className = 'footer-hint' + (enabled ? ' visible' : '');
  setTimeout(() => {
    hint.textContent = '刷新 RoboMaster 页面后生效';
    hint.className = 'footer-hint';
  }, 2000);
}
