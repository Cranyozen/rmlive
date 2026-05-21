import { useLocalStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { ref } from 'vue';

const THEME_KEY = 'rm-live-theme';
const PK_ENABLED_KEY = 'rm-live-pk-enabled';
const REACTION_ENABLED_KEY = 'rm-live-reaction-enabled';
const DANMU_ENABLED_KEY = 'rm-live-danmu-enabled';
const MOBILE_BREAKPOINT = 768;
const TOUCH_MOBILE_BREAKPOINT = 1024;

function isTouchMobileDevice() {
  const ua = navigator.userAgent;
  const mobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const iPadDesktopUa = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const shortScreenSide = Math.min(window.screen.width, window.screen.height);

  return mobileUa || iPadDesktopUa || (coarsePointer && shortScreenSide <= TOUCH_MOBILE_BREAKPOINT);
}

export interface SchedulePanelIntent {
  tab: 'schedule' | 'result';
  teamNames: string[];
  zoneIds: string[];
  nonce: number;
}

export const useUiStore = defineStore('ui', () => {
  const isDark = useLocalStorage<boolean>(THEME_KEY, true);
  const pkEnabled = useLocalStorage<boolean>(PK_ENABLED_KEY, true);
  const reactionEnabled = useLocalStorage<boolean>(REACTION_ENABLED_KEY, true);
  const danmuEnabled = useLocalStorage<boolean>(DANMU_ENABLED_KEY, true);
  const isMobile = ref(false);

  const schedulePanelIntent = ref<SchedulePanelIntent | null>(null);
  /** Skip one run of SchedulePanel auto-tab switching after programmatic navigation. */
  const suppressScheduleAutoTabOnce = ref(false);

  function requestSchedulePanelFocus(opts: {
    tab: 'schedule' | 'result';
    teamNames?: string[];
    zoneIds?: string[];
  }) {
    suppressScheduleAutoTabOnce.value = true;
    schedulePanelIntent.value = {
      tab: opts.tab,
      teamNames: opts.teamNames ?? [],
      zoneIds: opts.zoneIds ?? [],
      nonce: Date.now(),
    };
  }

  function clearSchedulePanelIntent() {
    schedulePanelIntent.value = null;
  }

  function consumeSuppressScheduleAutoTabOnce(): boolean {
    if (!suppressScheduleAutoTabOnce.value) {
      return false;
    }
    suppressScheduleAutoTabOnce.value = false;
    return true;
  }

  function applyTheme() {
    document.documentElement.classList.toggle('app-dark', isDark.value);
  }

  function setDarkMode(enabled: boolean) {
    isDark.value = enabled;
    applyTheme();
  }

  function setDanmuEnabled(enabled: boolean) {
    danmuEnabled.value = enabled;
  }

  function updateViewport() {
    isMobile.value = window.innerWidth <= MOBILE_BREAKPOINT || isTouchMobileDevice();
  }

  function onResize() {
    updateViewport();
  }

  function initializeUi() {
    applyTheme();

    updateViewport();
    window.addEventListener('resize', onResize);
  }

  function teardownUi() {
    window.removeEventListener('resize', onResize);
  }

  return {
    isDark,
    pkEnabled,
    reactionEnabled,
    danmuEnabled,
    isMobile,
    schedulePanelIntent,
    requestSchedulePanelFocus,
    clearSchedulePanelIntent,
    consumeSuppressScheduleAutoTabOnce,
    setDarkMode,
    setDanmuEnabled,
    initializeUi,
    teardownUi,
  };
});
